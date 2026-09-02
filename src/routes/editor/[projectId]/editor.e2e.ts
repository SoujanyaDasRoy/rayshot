import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test.describe('editor workspace smoke test', () => {
	test('importing a folder brings in its media immediately, ready for the timeline', async ({ page }) => {
		// Built fresh per test run, not checked into the repo as loose files.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-folder-import-'));
		writeFileSync(path.join(fixtureDir, 'clip.mp4'), 'fake-mp4-bytes');
		writeFileSync(path.join(fixtureDir, 'photo.jpg'), 'fake-jpg-bytes');
		writeFileSync(path.join(fixtureDir, 'notes.txt'), 'not media');

		await page.goto('/');

		// webkitdirectory hands the browser a flat list of every file in the
		// chosen tree; setInputFiles on the hidden input simulates exactly that
		// without needing to drive the native OS folder picker.
		await page.locator('input[webkitdirectory]').setInputFiles(fixtureDir);

		// Immediate: no confirmation step, no extra click — straight into the library.
		await expect(page.locator('.filename-pill', { hasText: 'clip.mp4' })).toBeVisible();
		await expect(page.locator('.filename-pill', { hasText: 'photo.jpg' })).toBeVisible();
		await expect(page.getByText('notes.txt')).toHaveCount(0);

		// Ready for the timeline: the exact same "Add to Timeline" path any
		// other imported asset uses, not a special read-only import.
		await page.locator('.filename-pill', { hasText: 'clip.mp4' }).click();
		await expect(page.getByRole('button', { name: 'Add to Timeline' })).toBeEnabled();

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('sidebar\'s Import Files adds files straight to the library', async ({ page }) => {
		// Import now lives in the sidebar, not a header button on the Media
		// Library view itself — this is the one place it should work from,
		// regardless of which tab is active.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-sidebar-import-'));
		const filePath = path.join(fixtureDir, 'sidebar_clip.mp4');
		writeFileSync(filePath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[type="file"]:not([webkitdirectory])').setInputFiles(filePath);

		await expect(page.locator('.filename-pill', { hasText: 'sidebar_clip.mp4' })).toBeVisible();

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('an audio clip on the timeline draws waveform bars with real height', async ({ page }) => {
		// The bug this guards: bars rendered via a Tailwind arbitrary value built
		// by Svelte interpolation (h-[{n}%]), which Tailwind never compiles, on
		// top of CSS that gave them no height and stacked them all at x=0. Both
		// failures are invisible to a DOM-count assertion and to dev-mode eyeballing
		// — only a computed-height check against the production build catches them.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-waveform-'));
		const audioPath = path.join(fixtureDir, 'tone.wav');
		writeFileSync(audioPath, 'fake-wav-bytes');

		await page.goto('/');
		await page.locator('.rail input[type="file"]:not([webkitdirectory])').setInputFiles(audioPath);

		await page.locator('.filename-pill', { hasText: 'tone.wav' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();

		// The timeline only exists on the editing surface, not the library view.
		await page.getByRole('button', { name: 'Effects' }).click();

		const bars = page.locator('.clip-waveform-bar');
		await expect(bars.first()).toBeVisible();
		expect(await bars.count()).toBeGreaterThan(6);

		const heights = await bars.evaluateAll((els) =>
			els.map((el) => parseFloat(getComputedStyle(el).height))
		);
		expect(heights.some((h) => h > 1)).toBe(true);

		// Not all collapsed to the same x — the absolute-positioning bug.
		const lefts = await bars.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
		expect(new Set(lefts).size).toBeGreaterThan(1);

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('a restored project gets its media bytes back and is actually playable', async ({ page }) => {
		// The bug: the autosave strips sourceBlob by design (IndexedDB owns the
		// bytes) but nothing ever read them back, so a restored project showed
		// clips, durations and thumbnails while rendering an empty frame. It
		// looked restored and was unplayable — which a DOM-presence assertion
		// cannot tell apart from success. Hence asserting on the blob: URL.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-restore-'));
		const clipPath = path.join(fixtureDir, 'restored.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[type="file"]:not([webkitdirectory])').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'restored.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();

		// Auto-save is debounced 800ms after a command executes.
		await page.waitForTimeout(1500);
		await page.reload();

		await page.getByRole('button', { name: 'Restore' }).click();
		await page.getByRole('button', { name: 'Effects' }).click();

		const layer = page.locator('.canvas-layer').first();
		await expect(layer).toBeVisible();
		await expect(page.locator('.media-offline')).toHaveCount(0);

		const src = await layer.locator('video, img').first().getAttribute('src');
		expect(src).toMatch(/^blob:/);

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('media whose bytes are gone reports itself offline instead of rendering blank', async ({ page }) => {
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-offline-'));
		const clipPath = path.join(fixtureDir, 'vanished.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[type="file"]:not([webkitdirectory])').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'vanished.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.waitForTimeout(1500);

		// Drop the blob cache but keep the auto-save: exactly the state of
		// opening someone else's project file, or a cache the browser evicted.
		await page.evaluate(
			() => new Promise<void>((resolve) => {
				const req = indexedDB.deleteDatabase('RayShotDB');
				req.onsuccess = req.onerror = req.onblocked = () => resolve();
			})
		);
		await page.reload();
		await page.getByRole('button', { name: 'Restore' }).click();

		await expect(page.locator('.offline-badge').first()).toBeVisible();

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('the colour grade sliders actually change the picture', async ({ page }) => {
		// For a long time all 12 sliders wrote to clip.colorGrade and nothing
		// read it — Canvas fabricated its own object and read clip.filters
		// instead. The panel looked completely functional and did nothing.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-grade-'));
		const clipPath = path.join(fixtureDir, 'graded.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[type="file"]:not([webkitdirectory])').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'graded.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Effects' }).click();

		const layer = page.locator('.canvas-layer').first();
		await expect(layer).toBeVisible();

		// Ungraded: no filter. This is also the regression guard for the old
		// contrast: (0/100)-1 = -1.0 bug, which crushed an untouched clip.
		const before = await layer.evaluate((el) => getComputedStyle(el).filter);
		expect(before === 'none' || before === '').toBe(true);

		await page.locator('.timeline-clip-block').first().click();
		const saturation = page.locator('#cg-saturation');
		await expect(saturation).toBeVisible();
		await saturation.fill('-100');
		await saturation.dispatchEvent('input');

		await expect
			.poll(() => layer.evaluate((el) => getComputedStyle(el).filter))
			.toContain('saturate');

		// A drag fires one command per input event. Without merging, those ~100
		// entries bury a 50-deep undo stack and evict all real history, so one
		// undo must return the clip to its pre-drag state, not one tick back.
		for (const v of ['-80', '-60', '-40']) {
			await saturation.fill(v);
			await saturation.dispatchEvent('input');
		}
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect
			.poll(() => layer.evaluate((el) => getComputedStyle(el).filter))
			.toBe('none');

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('/ redirects into the editor, and the editing surface is actually reachable', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/');
		await expect(page).toHaveURL(/\/editor\/default-project$/);

		// Timeline is not part of the full-screen Library view...
		await expect(page.locator('.bottom-timeline-row')).toHaveCount(0);

		// ...but appears once you're on the actual editing surface (the bug this
		// whole pass exists to fix: this view used to be permanently unreachable).
		await page.getByRole('button', { name: 'Effects' }).click();
		await expect(page.locator('.bottom-timeline-row')).toBeVisible();
		await expect(page.locator('.bottom-timeline-row')).toContainText('V1');
		await expect(page.locator('.bottom-timeline-row')).toContainText('A1');

		expect(errors, `Uncaught page errors: ${errors.join('; ')}`).toEqual([]);
	});

	test('undo and redo are disabled until there is history to move through', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
	});

	test('export dialog opens, is a real accessible dialog, and closes on Escape', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/');
		await page.getByRole('button', { name: 'Export', exact: true }).click();

		const dialog = page.getByRole('dialog', { name: 'Export Project' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('WebM (VP9)')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();

		expect(errors).toEqual([]);
	});

	test('this browser can actually record the WebM/VP9 export claims to produce', async ({ page }) => {
		// isCodecSupported() (exportUtils.ts) is a thin wrapper over exactly this
		// browser API — asserting the real capability it depends on, since Vitest's
		// node environment has no MediaRecorder to check it against directly.
		await page.goto('/');
		const support = await page.evaluate(() => ({
			vp9: MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
			fake: MediaRecorder.isTypeSupported('video/not-a-real-codec')
		}));

		expect(support.fake).toBe(false);
		expect(support.vp9).toBe(true);
	});

	test('number keys jump panels, but not while typing in a field', async ({ page }) => {
		await page.goto('/');

		await page.keyboard.press('4');
		await expect(page.getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-current', 'page');

		// Typing "1" into the project name field must not also switch panels.
		// pressSequentially (not fill) so real per-character keydown events fire.
		await page.getByLabel('Project name').click();
		await page.getByLabel('Project name').pressSequentially('11');
		await expect(page.getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-current', 'page');
		await expect(page.getByRole('button', { name: 'Media' })).not.toHaveAttribute('aria-current', 'page');
	});

	test('arrow keys move focus between panel rows', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Media' }).focus();
		await page.keyboard.press('ArrowDown');
		await expect(page.getByRole('button', { name: 'Record' })).toBeFocused();
		await page.keyboard.press('ArrowDown');
		await expect(page.getByRole('button', { name: 'Templates' })).toBeFocused();
		await page.keyboard.press('ArrowUp');
		await expect(page.getByRole('button', { name: 'Record' })).toBeFocused();
	});

	test('sidebar remembers collapsed state and last panel across a reload', async ({ page }) => {
		// Isolate from whatever a previous test in this worker left behind —
		// this is exactly the scenario being tested (a returning user's saved
		// preference), so it must not depend on starting from a blank slate.
		// A plain evaluate (not addInitScript, which would re-fire and wipe our
		// own write on the reload later in this same test).
		await page.goto('/');
		await page.evaluate(() => localStorage.removeItem('rayshot:sidebar'));
		await page.reload();
		await expect(page.getByRole('button', { name: 'Media' })).toBeVisible(); // hydrated and ready

		await page.keyboard.press('3'); // Templates
		await page.locator('.rail .toggle-sidebar').click(); // starts expanded, so this collapses it
		// Persisting to localStorage happens in an $effect, a tick after the
		// click — wait for the visible result before reloading, or the reload
		// can race ahead of the write.
		await expect(page.locator('.rail')).toHaveClass(/collapsed/);

		await page.reload();

		await expect(page.locator('.rail')).toHaveClass(/collapsed/);
		await expect(page.getByRole('button', { name: 'Templates' })).toHaveAttribute('aria-current', 'page');
	});

	test('sidebar has no Folders section until a folder is actually imported', async ({ page }) => {
		await page.goto('/');

		// Fresh project: nothing imported yet, so no fake/demo folders either.
		await expect(page.getByText('Folders', { exact: true })).toHaveCount(0);

		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-sidebar-folder-'));
		writeFileSync(path.join(fixtureDir, 'clip.mp4'), 'fake-mp4-bytes');
		const folderName = path.basename(fixtureDir);

		await page.locator('input[webkitdirectory]').setInputFiles(fixtureDir);

		// Now it's real: the sidebar shows exactly the folder that was imported.
		await expect(page.getByText('Folders', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: new RegExp(`^${folderName} 1$`) })).toBeVisible();

		rmSync(fixtureDir, { recursive: true, force: true });
	});
});
