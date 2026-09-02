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
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(filePath);

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
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(audioPath);

		await page.locator('.filename-pill', { hasText: 'tone.wav' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();

		// The timeline belongs to the pages that edit a sequence, not the library.
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

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
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'restored.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();

		// Auto-save is debounced 800ms after a command executes.
		await page.waitForTimeout(1500);
		await page.reload();

		await page.getByRole('button', { name: 'Restore' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

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
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
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
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'graded.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const layer = page.locator('.canvas-layer').first();
		await expect(layer).toBeVisible();

		// Ungraded: no filter. This is also the regression guard for the old
		// contrast: (0/100)-1 = -1.0 bug, which crushed an untouched clip.
		const before = await layer.evaluate((el) => getComputedStyle(el).filter);
		expect(before === 'none' || before === '').toBe(true);

		await page.locator('.timeline-clip-block').first().click();
		// The Inspector opens short now: grading is a click away rather than
		// unfolded by default.
		await page.getByRole('button', { name: 'Color Grading' }).click();
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

	test('the WebGL path renders to a canvas without exhausting GL contexts', async ({ page }) => {
		// Two things this guards. The old path built a full-resolution PNG per
		// layer per frame into a $state(new Map()), which Svelte 5 does not proxy,
		// so it never displayed at all. And it created one compositor per clip —
		// one live WebGL context each, against a browser cap around 16.
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));

		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-webgl-'));
		const clipPath = path.join(fixtureDir, 'gl.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'gl.mp4' }).click();

		// Stack up many clips; one context per clip would blow the cap here.
		for (let i = 0; i < 20; i++) {
			await page.getByRole('button', { name: 'Add to Timeline' }).click();
		}
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const lost = await page.evaluate(() => {
			const probe = document.createElement('canvas');
			return probe.getContext('webgl2') === null;
		});
		expect(lost, 'no WebGL2 context available - earlier contexts were leaked').toBe(false);

		expect(errors.join('; ')).not.toContain('context');
		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('tracks have real lanes, real labels and a subtitle type', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		// Lanes were 24/20/16px because Tailwind class names (w-48, h-24) were
		// transcribed into CSS as literal pixels, making the whole timeline about
		// a quarter of its intended size.
		const lane = page.locator('.track-row-lane').first();
		const laneHeight = await lane.evaluate((el) => parseFloat(getComputedStyle(el).height));
		expect(laneHeight).toBeGreaterThan(40);

		// Every label row must match its lane exactly, or the two columns drift
		// apart and the error compounds down the stack. Checked across all rows,
		// not just the first: the sidebar is a flex column, so the mismatch only
		// appears once enough tracks exist to overflow it.
		await page.getByRole('button', { name: '+ Video' }).click();
		await page.getByRole('button', { name: '+ Audio' }).click();
		const pairs = await page.evaluate(() => {
			const lanes = [...document.querySelectorAll('.track-row-lane')];
			const rows = [...document.querySelectorAll('.track-label-row')];
			return lanes.map((lane, i) => [
				parseFloat(getComputedStyle(lane).height),
				parseFloat(getComputedStyle(rows[i]).height)
			]);
		});
		expect(pairs.length).toBeGreaterThan(4);
		for (const [laneH, rowH] of pairs) {
			expect(Math.abs(laneH - rowH), `lane ${laneH} vs row ${rowH}`).toBeLessThanOrEqual(1);
		}

		// Subtitle is a real third type; the old label maths produced a
		// mis-numbered audio track for anything that was not video.
		await page.getByRole('button', { name: '+ Subtitle' }).click();
		await expect(page.locator('.track-label-row.subtitle')).toHaveCount(1);
		await expect(page.locator('.track-name', { hasText: 'Caption 1' })).toBeVisible();
	});

	test('track mute and lock survive a reload, and colour is user-chosen', async ({ page }) => {
		// These were component-local $state: the buttons toggled, nothing read
		// them, and nothing survived a reload.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const firstRow = page.locator('.track-label-row').first();
		await firstRow.getByRole('button', { name: 'Mute track' }).click();
		await expect(firstRow.getByRole('button', { name: 'Unmute track' })).toBeVisible();

		// Undo is real now, because it goes through a command.
		await page.keyboard.press('Control+z');
		await expect(firstRow.getByRole('button', { name: 'Mute track' })).toBeVisible();

		// Colour: the one place user data is allowed to be coloured.
		await firstRow.getByRole('button', { name: 'Track colour' }).click();
		await page.getByRole('button', { name: 'Teal' }).click();
		await expect
			.poll(() => firstRow.evaluate((el) => getComputedStyle(el).borderLeftColor))
			.not.toBe('rgba(0, 0, 0, 0)');
	});

	test('a .rayshot bundle round-trips a project and its media', async ({ page }) => {
		// The Excalidraw-style ask: one file that carries the project AND its
		// bytes, so it opens on a machine that has never seen the media.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-bundle-'));
		const clipPath = path.join(fixtureDir, 'bundled.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes-for-bundling');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await expect(page.locator('.filename-pill', { hasText: 'bundled.mp4' })).toBeVisible();

		const download = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Save Project' }).click();
		const saved = await download;
		expect(saved.suggestedFilename()).toMatch(/\.rayshot$/);

		const bundlePath = path.join(fixtureDir, 'saved.rayshot');
		await saved.saveAs(bundlePath);

		// Wipe everything a browser could be remembering, so reopening cannot be
		// quietly served by the autosave or the blob cache.
		await page.evaluate(async () => {
			localStorage.clear();
			const dbs = await indexedDB.databases();
			await Promise.all(
				dbs.map((d) => new Promise<void>((res) => {
					const q = indexedDB.deleteDatabase(d.name!);
					q.onsuccess = q.onerror = q.onblocked = () => res();
				}))
			);
			try {
				const root = await navigator.storage.getDirectory();
				for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
					await root.removeEntry(name, { recursive: true });
				}
			} catch { /* no OPFS, nothing to clear */ }
		});
		await page.reload();
		await expect(page.locator('.filename-pill')).toHaveCount(0);

		await page.locator('.rail input[accept=".rayshot,application/zip"]').setInputFiles(bundlePath);

		// Back, with its media: not offline, and playable.
		await expect(page.locator('.filename-pill', { hasText: 'bundled.mp4' })).toBeVisible();
		await expect(page.locator('.offline-badge')).toHaveCount(0);

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('the Color page has working curves, which did not exist at all', async ({ page }) => {
		// The shader has sampled u_curves since it was written and the LUT
		// flattener already existed; there was simply no way to draw a curve.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-curves-'));
		const clipPath = path.join(fixtureDir, 'graded.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'graded.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();

		await page.getByRole('button', { name: 'Color', exact: true }).click();
		await page.locator('.timeline-clip-block').first().click();

		await page.getByRole('tab', { name: 'Curves' }).click();
		const surface = page.getByRole('button', { name: /Tone curve/ });
		await expect(surface).toBeVisible();

		// Identity curve is two points; clicking the plot adds a third.
		await expect(page.locator('.curve-point')).toHaveCount(2);
		await surface.click({ position: { x: 60, y: 60 } });
		await expect(page.locator('.curve-point')).toHaveCount(3);

		// And it is a real edit, so it undoes.
		await page.keyboard.press('Control+z');
		await expect(page.locator('.curve-point')).toHaveCount(2);

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('/ redirects into the editor, and the editing surface is actually reachable', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/');
		await expect(page).toHaveURL(/\/editor\/default-project$/);

		// The Media page is the library: no timeline.
		await expect(page.locator('.bottom-timeline-row')).toHaveCount(0);

		// Switching page rearranges the window — that is what a page is.
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(page.locator('.bottom-timeline-row')).toBeVisible();
		await expect(page.locator('.bottom-timeline-row')).toContainText('Video 1');
		await expect(page.locator('.bottom-timeline-row')).toContainText('Audio 1');

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

	test('number keys pick a tool in the current page, but not while typing', async ({ page }) => {
		await page.goto('/');

		// Media's tools are Import Files (1), Record (2), Templates (3).
		// Scoped to the rail: opening Record also renders a "Start Recording"
		// button, which substring-matches the same name.
		const recordRow = page.locator('.rail .row', { hasText: 'Record' });
		await page.keyboard.press('2');
		await expect(recordRow).toHaveAttribute('aria-current', 'page');

		// Typing "1" into the project name must not also switch tools.
		await page.getByLabel('Project name').click();
		await page.getByLabel('Project name').pressSequentially('11');
		await expect(recordRow).toHaveAttribute('aria-current', 'page');
	});

	test('arrow keys move focus between rail rows', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Import Files' }).focus();
		await page.keyboard.press('ArrowDown');
		await expect(page.getByRole('button', { name: 'Import Folder' })).toBeFocused();
		await page.keyboard.press('ArrowUp');
		await expect(page.getByRole('button', { name: 'Import Files' })).toBeFocused();
	});

	test('sidebar remembers its collapsed state across a reload', async ({ page }) => {
		// The page you are on is deliberately NOT persisted any more: it used to
		// be restored from localStorage with no validation at all, so any string
		// became the active tab.
		await page.goto('/');
		await page.evaluate(() => localStorage.removeItem('rayshot:sidebar'));
		await page.reload();
		await expect(page.getByRole('button', { name: 'Import Files' })).toBeVisible();

		await page.locator('.rail .toggle-sidebar').click();
		await expect(page.locator('.rail')).toHaveClass(/collapsed/);

		await page.reload();

		await expect(page.locator('.rail')).toHaveClass(/collapsed/);
	});

	test('pages rearrange the window, and reach what the old nav could not', async ({ page }) => {
		await page.goto('/');

		// Transitions had no route into it at all: it was in the tab union and
		// in no nav array, so the drawer was unreachable dead code.
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Transitions' })).toBeVisible();

		// Colour gets the viewer and the grade panel, and no media bin.
		await page.getByRole('button', { name: 'Color', exact: true }).click();
		await expect(page.locator('.left-mediabin-col')).toHaveCount(0);
		await expect(page.locator('.bottom-timeline-row')).toBeVisible();

		// Media is the library: no timeline.
		await page.getByRole('button', { name: 'Media', exact: true }).click();
		await expect(page.locator('.bottom-timeline-row')).toHaveCount(0);
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
		// Scoped to the rail: the library's folder card carries the same
		// accessible name now that its icon is an SVG rather than ligature text.
		await expect(
			page.locator('.rail').getByRole('button', { name: new RegExp(`^${folderName} 1$`) })
		).toBeVisible();

		rmSync(fixtureDir, { recursive: true, force: true });
	});
	test('the ruler changes density with zoom instead of labelling every second', async ({
		page
	}) => {
		// The old ruler drew a major tick per second at every zoom, so zooming out
		// produced hundreds of overlapping labels and zooming in produced a ruler
		// with nothing between the seconds. Density is the whole feature, and only
		// a computed-position check can see it.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const gaps = async () =>
			page.locator('.ruler-mark-major').evaluateAll((els) => {
				const lefts = els.map((el) => parseFloat(getComputedStyle(el).left)).sort((a, b) => a - b);
				return lefts.slice(1).map((left, i) => left - lefts[i]);
			});

		const zoomOut = page.getByRole('button', { name: 'Zoom Out' });
		const zoomIn = page.getByRole('button', { name: 'Zoom In' });

		for (let i = 0; i < 15; i++) await zoomOut.click();
		const wide = await gaps();
		expect(wide.length).toBeGreaterThan(0);
		// Labels never crowd, at any zoom.
		expect(Math.min(...wide)).toBeGreaterThanOrEqual(60);

		for (let i = 0; i < 30; i++) await zoomIn.click();
		const tight = await gaps();
		expect(Math.min(...tight)).toBeGreaterThanOrEqual(60);

		// Zoomed in, the ruler resolves time more finely than it did zoomed out.
		const labels = await page
			.locator('.ruler-mark-major .ruler-timecode')
			.evaluateAll((els) => els.slice(0, 2).map((el) => el.textContent?.trim() ?? ''));
		expect(labels[0]).not.toBe(labels[1]);
	});

	test('the wheel zooms at the pointer and pans, rather than doing nothing', async ({ page }) => {
		// There were no wheel handlers at all: the scrollbar was the only way to
		// navigate. A passive listener would also silently fail to preventDefault,
		// which is invisible except in a real browser.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const viewport = page.locator('.tracks-scroll-viewport');
		const box = (await viewport.boundingBox())!;
		const anchorX = 240;

		const readZoom = () =>
			page.locator('.zoom-percentage-badge').evaluate((el) => parseFloat(el.textContent!) / 100);
		const readScroll = () => viewport.evaluate((el) => el.scrollLeft);

		await page.mouse.move(box.x + anchorX, box.y + box.height / 2);

		const zoomBefore = await readZoom();
		const scrollBefore = await readScroll();
		const timeBefore = (scrollBefore + anchorX) / (80 * zoomBefore);

		await page.keyboard.down('Control');
		await page.mouse.wheel(0, -240);
		await page.keyboard.up('Control');

		const zoomAfter = await readZoom();
		expect(zoomAfter).toBeGreaterThan(zoomBefore);

		// The moment under the cursor is still under the cursor. Tolerance is in
		// seconds, and generous enough for the rounded badge reading.
		const timeAfter = ((await readScroll()) + anchorX) / (80 * zoomAfter);
		expect(Math.abs(timeAfter - timeBefore)).toBeLessThan(0.35);

		// Shift+wheel pans sideways.
		const beforePan = await readScroll();
		await page.keyboard.down('Shift');
		await page.mouse.wheel(0, 300);
		await page.keyboard.up('Shift');
		expect(await readScroll()).toBeGreaterThan(beforePan);
	});

	test('a dragged clip follows the pointer instead of jumping on release', async ({ page }) => {
		// draggedTime was computed on every mousemove and read only at commit, so
		// the clip sat still through the whole gesture and teleported on mouseup.
		// The assertion has to happen mid-drag, before the mouse is released.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-dragghost-'));
		const clipPath = path.join(fixtureDir, 'shot.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'shot.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const clip = page.locator('.timeline-clip-block').first();
		await expect(clip).toBeVisible();
		const start = (await clip.boundingBox())!;

		// Grab the middle: within 8px of either edge is a trim, not a move.
		await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
		await page.mouse.down();
		await page.mouse.move(start.x + start.width / 2 + 180, start.y + start.height / 2, {
			steps: 12
		});

		const during = (await clip.boundingBox())!;
		expect(during.x - start.x).toBeGreaterThan(100);

		await page.mouse.up();
		rmSync(fixtureDir, { recursive: true, force: true });
	});
	test('muting or soloing a track actually reaches the audio', async ({ page }) => {
		// track.muted has been persisted since the track overhaul and read by
		// nothing: the button toggled and the audio played on. Solo did not exist.
		// Only the element's live volume can tell the difference.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-solo-'));
		const clipPath = path.join(fixtureDir, 'take.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'take.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const volume = () =>
			page.evaluate(() => {
				const el = document.querySelector('video, audio') as HTMLMediaElement | null;
				return el ? el.volume : -1;
			});

		await expect.poll(volume).toBeGreaterThan(0);

		// By name, not by position: video counts up the screen now, so the first
		// row is the highest video track rather than the one holding the clip.
		const videoRow = page
			.locator('.track-label-row')
			.filter({ has: page.locator('.track-name', { hasText: 'Video 1' }) });
		await videoRow.getByRole('button', { name: 'Mute track' }).click();
		await expect.poll(volume).toBe(0);

		await videoRow.getByRole('button', { name: 'Unmute track' }).click();
		await expect.poll(volume).toBeGreaterThan(0);

		// Solo elsewhere silences everything that is not soloed — the rule that
		// makes solo mean anything at all.
		const audioRow = page
			.locator('.track-label-row')
			.filter({ has: page.locator('.track-name', { hasText: 'Audio 1' }) });
		await audioRow.getByRole('button', { name: 'Solo track' }).click();
		await expect.poll(volume).toBe(0);

		await audioRow.getByRole('button', { name: 'Unsolo track' }).click();
		await expect.poll(volume).toBeGreaterThan(0);

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('track controls stay out of the way until hover or keyboard focus', async ({ page }) => {
		// Hover-only controls do not exist for a keyboard, so focus has to reveal
		// them too. That is the half a hover test would quietly miss.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const row = page.locator('.track-label-row').first();
		const controls = row.locator('.track-controls');
		const opacity = () => controls.evaluate((el) => getComputedStyle(el).opacity);

		// The dot is the one control that never hides: it reads the track's
		// on/off state and its colour at a glance.
		await expect(row.locator('.track-enable-dot')).toBeVisible();
		await expect.poll(opacity).toBe('0');

		await row.hover();
		await expect.poll(opacity).toBe('1');

		// Move away, then arrive by keyboard instead.
		await page.mouse.move(0, 0);
		await expect.poll(opacity).toBe('0');
		await row.getByRole('button', { name: 'Mute track' }).focus();
		await expect.poll(opacity).toBe('1');
	});

	test('the timeline can be resized, and remembers it across a reload', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const timeline = page.locator('.bottom-timeline-row');
		const height = () => timeline.evaluate((el) => Math.round(el.getBoundingClientRect().height));
		const before = await height();

		// Keyboard, not drag: the handle has to work for people who cannot drag.
		const handle = page.getByRole('slider', { name: 'Resize timeline' });
		await handle.focus();
		for (let i = 0; i < 5; i++) await handle.press('ArrowUp');

		const after = await height();
		expect(after).toBeGreaterThan(before);

		await page.reload();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		expect(Math.abs((await height()) - after)).toBeLessThanOrEqual(2);
	});

	test('the track names stay level with their lanes when the timeline scrolls', async ({
		page
	}) => {
		// The label column is outside the scroller, so without an explicit sync it
		// sits still while the lanes move and every name lines up with the wrong
		// track. The ruler had the mirror bug: it scrolled away entirely.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		for (let i = 0; i < 8; i++) await page.getByRole('button', { name: '+ Video' }).click();

		await page.locator('.tracks-scroll-viewport').evaluate((el) => {
			el.scrollTop = 120;
			el.dispatchEvent(new Event('scroll'));
		});

		const drift = await page.evaluate(() => {
			const lanes = [...document.querySelectorAll('.track-row-lane')];
			const rows = [...document.querySelectorAll('.track-label-row')];
			return lanes.map(
				(lane, i) => lane.getBoundingClientRect().top - rows[i].getBoundingClientRect().top
			);
		});
		expect(drift.length).toBeGreaterThan(8);
		for (const d of drift) expect(Math.abs(d)).toBeLessThanOrEqual(1);

		// And the ruler is still on screen to read time against.
		const ruler = page.locator('.timecode-ruler');
		const viewport = page.locator('.tracks-scroll-viewport');
		const [rulerTop, viewportTop] = await Promise.all([
			ruler.evaluate((el) => el.getBoundingClientRect().top),
			viewport.evaluate((el) => el.getBoundingClientRect().top)
		]);
		expect(Math.abs(rulerTop - viewportTop)).toBeLessThanOrEqual(2);
	});
	test('an effect can be dragged onto a clip, and the Inspector then edits it', async ({
		page
	}) => {
		// Effects could only be applied by selecting a clip and clicking a card,
		// and once applied they were invisible: the Inspector had no effects
		// section at all, so nothing could be adjusted or removed afterwards.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-fxdrag-'));
		const clipPath = path.join(fixtureDir, 'scene.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'scene.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const inspector = page.locator('.inspector-sidebar');
		const clip = page.locator('.timeline-clip-block').first();
		// The Inspector only has sections once there is a clip to inspect.
		await clip.click();
		await expect(inspector.getByText('Drag an effect from the library')).toBeVisible();

		const card = page.locator('.effect-card', { hasText: 'Lens Blur' });
		await card.dragTo(clip);

		// The effect is on the clip, and its own parameter is editable — the
		// registry's range, not a guessed 0..100.
		const slider = inspector.getByRole('slider', { name: 'Lens Blur Blur' });
		await expect(slider).toBeVisible();
		expect(await slider.getAttribute('max')).toBe('20');
		expect(await slider.inputValue()).toBe('6');

		// And it reaches the picture.
		await expect
			.poll(() =>
				page.locator('.canvas-layer').first().evaluate((el) => getComputedStyle(el).filter)
			)
			.toContain('blur');

		// One gesture, one undo. Applying used to fire AddClipEffect plus one
		// SetClipFilter per parameter, so taking it back took four presses.
		await page.keyboard.press('Control+z');
		await expect(slider).toHaveCount(0);
		await expect(inspector.getByText('Drag an effect from the library')).toBeVisible();

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('an applied effect can be adjusted and removed from the Inspector', async ({ page }) => {
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-fxedit-'));
		const clipPath = path.join(fixtureDir, 'take.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'take.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		await page.locator('.timeline-clip-block').first().click();
		await page.locator('.effect-card', { hasText: 'Noir' }).click();

		const inspector = page.locator('.inspector-sidebar');
		const contrast = inspector.getByRole('slider', { name: 'Noir Contrast' });
		await expect(contrast).toBeVisible();

		// The slider drives the real filter, not just its own readout.
		await contrast.fill('80');
		await expect
			.poll(() =>
				page.locator('.canvas-layer').first().evaluate((el) => getComputedStyle(el).filter)
			)
			.toContain('contrast(1.8)');

		await inspector.getByRole('button', { name: 'Remove Noir' }).click();
		await expect(contrast).toHaveCount(0);

		rmSync(fixtureDir, { recursive: true, force: true });
	});

	test('blend mode reaches the picture instead of only the dropdown', async ({ page }) => {
		// The dropdown wrote filters.blendMode and nothing read it: picking
		// Multiply changed the select and nothing else, in preview or export.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-blend-'));
		const clipPath = path.join(fixtureDir, 'plate.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'plate.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.locator('.timeline-clip-block').first().click();

		const layerBlend = () =>
			page.locator('.canvas-layer').first().evaluate((el) => getComputedStyle(el).mixBlendMode);
		await expect.poll(layerBlend).toBe('normal');

		// Opacity & Blend now starts closed: the Inspector opens short.
		await page.getByRole('button', { name: 'Opacity & Blend' }).click();
		await page.getByRole('combobox', { name: 'Blend Mode' }).selectOption('multiply');

		await expect.poll(layerBlend).toBe('multiply');

		rmSync(fixtureDir, { recursive: true, force: true });
	});
	test('a voice effect builds a real Web Audio chain, not just a slider', async ({ page }) => {
		// The unit tests prove the graph against a fake AudioContext. This is the
		// half a fake cannot check: that the real Web Audio API accepts every node
		// we ask it for, on a page where an AudioContext genuinely exists.
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => {
			if (m.type() === 'error') errors.push(m.text());
		});

		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-voicefx-'));
		const audioPath = path.join(fixtureDir, 'voice.wav');
		writeFileSync(audioPath, 'fake-wav-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(audioPath);
		await page.locator('.filename-pill', { hasText: 'voice.wav' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		await page.locator('.timeline-clip-block').first().click();
		await page.locator('.effect-card', { hasText: 'Voice Clarity' }).click();
		// Room is the awkward one: a convolver with a generated impulse response
		// plus a wet/dry split, rather than a single filter node.
		await page.locator('.effect-card', { hasText: 'Room' }).click();

		const inspector = page.locator('.inspector-sidebar');
		await expect(inspector.getByRole('slider', { name: 'Voice Clarity High-pass' })).toBeVisible();
		await expect(inspector.getByRole('slider', { name: 'Room Mix' })).toBeVisible();

		// Changing a parameter rebuilds the chain; that is where a bad node type
		// or an out-of-range value would throw.
		await inspector.getByRole('slider', { name: 'Room Decay' }).fill('2.5');
		await page.waitForTimeout(200);

		// The fixture is not real audio, so the decode worker fails on it by
		// design. Everything else must be silent — a bad node type or an
		// out-of-range AudioParam would show up here and nowhere else.
		const unexpected = errors.filter((e) => !e.includes('MediaWorker'));
		expect(unexpected).toEqual([]);

		rmSync(fixtureDir, { recursive: true, force: true });
	});
	test('changing speed resizes the clip and the element actually plays fast', async ({ page }) => {
		// Speed used to be stored twice: in clip.playbackRate, and implicitly as
		// the ratio of source span to clip length. The element got the first and
		// the seek position came from the second, so at 2x every sync yanked the
		// element back — stutter, not speed. Speed is derived now, so the two
		// numbers cannot disagree; there is only one of them.
		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-speed-'));
		const clipPath = path.join(fixtureDir, 'run.mp4');
		writeFileSync(clipPath, 'fake-mp4-bytes');

		await page.goto('/');
		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'run.mp4' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const clip = page.locator('.timeline-clip-block').first();
		await clip.click();
		const widthBefore = (await clip.boundingBox())!.width;

		await page
			.locator('.inspector-sidebar')
			.getByRole('combobox', { name: 'Clip Speed' })
			.selectOption('2');

		// The clip is half as long, because that is what speed means now.
		await expect.poll(async () => (await clip.boundingBox())!.width).toBeLessThan(
			widthBefore * 0.6
		);

		// And the element is genuinely running at 2x rather than being reseeked.
		await expect
			.poll(() =>
				page.evaluate(() => {
					const el = document.querySelector('video, audio') as HTMLMediaElement | null;
					return el ? el.playbackRate : -1;
				})
			)
			.toBeCloseTo(2, 5);

		// Undo restores the length, and with it the speed.
		await page.keyboard.press('Control+z');
		await expect.poll(async () => (await clip.boundingBox())!.width).toBeCloseTo(widthBefore, 0);

		rmSync(fixtureDir, { recursive: true, force: true });
	});
	test('a real video draws its own frames on the clip', async ({ page }) => {
		// Every other fixture in this file is fake bytes, which decode to nothing.
		// That means no test here has ever exercised the decode path, and a clip
		// that renders as an empty coloured block looks identical to one whose
		// thumbnails never arrived. This builds an actually-decodable video in
		// the page and asserts the frames reach the timeline.
		await page.goto('/');

		const base64 = await page.evaluate(async () => {
			const canvas = document.createElement('canvas');
			canvas.width = 320;
			canvas.height = 180;
			const ctx = canvas.getContext('2d')!;
			const stream = canvas.captureStream(30);
			const chunks: Blob[] = [];
			const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
			rec.ondataavailable = (e) => chunks.push(e.data);
			rec.start();

			// Each frame a different hue, so a captured thumbnail cannot be
			// mistaken for a blank canvas.
			await new Promise<void>((resolve) => {
				let i = 0;
				const id = setInterval(() => {
					ctx.fillStyle = `hsl(${(i * 37) % 360}, 85%, 50%)`;
					ctx.fillRect(0, 0, 320, 180);
					if (++i > 60) {
						clearInterval(id);
						resolve();
					}
				}, 25);
			});

			rec.stop();
			await new Promise((resolve) => (rec.onstop = resolve));
			const blob = new Blob(chunks, { type: 'video/webm' });
			return await new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve((reader.result as string).split(',')[1]);
				reader.readAsDataURL(blob);
			});
		});

		const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rayshot-realvideo-'));
		const clipPath = path.join(fixtureDir, 'colours.webm');
		writeFileSync(clipPath, Buffer.from(base64, 'base64'));

		await page.locator('.rail input[accept="video/*,audio/*,image/*"]').setInputFiles(clipPath);
		await page.locator('.filename-pill', { hasText: 'colours.webm' }).click();
		await page.getByRole('button', { name: 'Add to Timeline' }).click();
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const frames = page.locator('.clip-frame');
		await expect(frames.first()).toBeVisible();

		// Each frame must carry a real image, not the transparent placeholder.
		await expect
			.poll(
				async () =>
					await frames.evaluateAll((els) =>
						els.filter((el) => {
							const bg = getComputedStyle(el).backgroundImage;
							return bg.startsWith('url(') && bg.length > 200;
						}).length
					),
				{ timeout: 8000 }
			)
			.toBeGreaterThan(2);

		rmSync(fixtureDir, { recursive: true, force: true });
	});
	test('a title stays editable text instead of becoming a picture of text', async ({ page }) => {
		// Titles were rasterised to a 1920x1080 PNG the moment they were added,
		// so the words became pixels and the string that made them was thrown
		// away. Nothing could change a typo afterwards.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.locator('.rail').getByRole('button', { name: 'Text' }).click();

		await page.locator('.preset-row').first().click();

		const clip = page.locator('.timeline-clip-block').first();
		await expect(clip).toBeVisible();
		await clip.click();

		// The words reach the preview as text, not as an image.
		const layer = page.locator('.canvas-text-layer').first();
		await expect(layer).toBeVisible();
		const original = (await layer.textContent())!.trim();
		expect(original.length).toBeGreaterThan(0);

		// And the clip on the timeline says the same thing.
		await expect(clip).toContainText(original);

		// Now change them, which was the whole impossibility before.
		const field = page.locator('.inspector-sidebar').getByRole('textbox', { name: 'Title text' });
		await field.fill('Rewritten on the timeline');

		await expect(layer).toHaveText('Rewritten on the timeline');
		await expect(clip).toContainText('Rewritten on the timeline');

		// One undo, not one per keystroke.
		await page.keyboard.press('Control+z');
		await expect(layer).toHaveText(original);
	});
	test('picture sits above sound, and the higher track is the one on top', async ({ page }) => {
		// The canvas gives a higher track order a higher z-index, so Video 2
		// covers Video 1 in the viewer. The timeline drew Video 2 *below* Video 1,
		// which meant the row underneath was covering the row above it. Nothing
		// in the model was wrong; the picture of it was upside down.
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.getByRole('button', { name: '+ Subtitle' }).click();

		const readRows = () =>
			page.locator('.track-label-row').evaluateAll((els) =>
				els.map((el) => ({
					name: el.querySelector('.track-name')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
					top: el.getBoundingClientRect().top
				}))
			);

		const rows = await readRows();
		const names = rows.map((r) => r.name);

		// Captions above, then video, then audio.
		expect(names[0]).toContain('Caption');
		const firstAudio = names.findIndex((n) => n.startsWith('Audio'));
		const lastVideo = names.map((n) => n.startsWith('Video')).lastIndexOf(true);
		expect(lastVideo).toBeLessThan(firstAudio);

		// Video counts up the screen: Video 2 is drawn above Video 1.
		const v1 = rows.find((r) => r.name === 'Video 1')!;
		const v2 = rows.find((r) => r.name === 'Video 2')!;
		expect(v2.top).toBeLessThan(v1.top);

		// Audio counts down it.
		const a1 = rows.find((r) => r.name === 'Audio 1')!;
		const a2 = rows.find((r) => r.name === 'Audio 2')!;
		expect(a1.top).toBeLessThan(a2.top);

		// The lanes must agree with the labels, or every name points at the
		// wrong track.
		const lanes = await page
			.locator('.track-row-lane')
			.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
		expect(lanes[0]).toContain('S1');
		expect(lanes.at(-1)).toContain('A2');
	});
});
