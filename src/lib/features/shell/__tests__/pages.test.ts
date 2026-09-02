import { describe, test, expect } from 'vitest';
import { PAGES, PAGE_IDS, isPageId, coercePageId, toolsForPage, defaultToolForPage } from '../pages';

describe('page model', () => {
	test('exposes exactly the four pages, in workflow order', () => {
		expect(PAGE_IDS).toEqual(['media', 'edit', 'color', 'audio']);
	});

	test('every page has a label, a glyph and a number-key shortcut', () => {
		for (const page of PAGES) {
			expect(page.label, page.id).toBeTruthy();
			expect(page.icon, page.id).toBeTruthy();
			expect(page.key, page.id).toMatch(/^[1-9]$/);
		}
	});

	test('shortcuts are unique so one key cannot mean two pages', () => {
		const keys = PAGES.map((p) => p.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test('rejects anything that is not a page id', () => {
		expect(isPageId('media')).toBe(true);
		expect(isPageId('effects')).toBe(false);
		expect(isPageId('')).toBe(false);
		expect(isPageId(null)).toBe(false);
	});

	test('coerces junk from localStorage back to the default page', () => {
		expect(coercePageId('color')).toBe('color');
		expect(coercePageId('transitions')).toBe('media');
		expect(coercePageId(undefined)).toBe('media');
		expect(coercePageId({ nope: true })).toBe('media');
	});

	test('each page carries its own tools, so the rail is contextual', () => {
		expect(toolsForPage('media')).toContain('templates');
		expect(toolsForPage('edit')).toContain('effects');
		expect(toolsForPage('media')).not.toContain('effects');
	});

	test('transitions and audio presets are reachable — they were dead code', () => {
		const all = PAGE_IDS.flatMap((id) => toolsForPage(id));
		expect(all).toContain('transitions');
		expect(all).toContain('audio');
	});

	test('a page opens on its own first tool', () => {
		for (const id of PAGE_IDS) {
			const tools = toolsForPage(id);
			if (tools.length > 0) expect(tools).toContain(defaultToolForPage(id));
		}
	});

	test('only the pages that edit a sequence show the timeline', () => {
		const withTimeline = PAGES.filter((p) => p.showsTimeline).map((p) => p.id);
		expect(withTimeline).toEqual(['edit', 'color', 'audio']);
	});
});
