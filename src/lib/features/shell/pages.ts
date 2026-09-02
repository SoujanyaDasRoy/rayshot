import type { IconName } from './icons';

/**
 * The four workspaces.
 *
 * A page is a mode, not a menu item: it rearranges the whole window for a
 * different job. Record, Templates, Effects and Text used to sit alongside
 * Media as if they were peers — they are tools you reach for *within* a page,
 * which is why they now hang off one.
 *
 * Dependency-free so it stays testable in the node Vitest project.
 */

export type PageId = 'media' | 'edit' | 'color' | 'audio';

/** A tool occupies the rail; it does not rearrange the window. */
export type ToolId =
	| 'import'
	| 'record'
	| 'templates'
	| 'effects'
	| 'text'
	| 'transitions'
	| 'audio';

export interface PageDef {
	id: PageId;
	label: string;
	/** Glyph that diagrams this page's layout, so the switcher shows the room. */
	icon: IconName;
	key: string;
	tools: ToolId[];
	/** Pages that edit a sequence need the timeline; the library does not. */
	showsTimeline: boolean;
}

export const PAGES: PageDef[] = [
	{
		id: 'media',
		label: 'Media',
		icon: 'page-media',
		key: '1',
		// 'import' is the library view itself; the Import Files/Folder
		// actions live in their own group in the rail.
		tools: ['import', 'record', 'templates'],
		showsTimeline: false
	},
	{
		id: 'edit',
		label: 'Edit',
		icon: 'page-edit',
		key: '2',
		// 'transitions' had no route into it at all before this.
		tools: ['effects', 'text', 'transitions'],
		showsTimeline: true
	},
	{
		id: 'color',
		label: 'Color',
		icon: 'page-color',
		key: '3',
		tools: [],
		showsTimeline: true
	},
	{
		id: 'audio',
		label: 'Audio',
		icon: 'page-audio',
		key: '4',
		// MediaBin's 'audio' pillar was unreachable: not in the old tab union.
		tools: ['audio'],
		showsTimeline: true
	}
];

export const PAGE_IDS: PageId[] = PAGES.map((p) => p.id);

export const DEFAULT_PAGE: PageId = 'media';

export function isPageId(value: unknown): value is PageId {
	return typeof value === 'string' && (PAGE_IDS as string[]).includes(value);
}

/** Restored preferences are untrusted input; anything unknown falls back. */
export function coercePageId(value: unknown): PageId {
	return isPageId(value) ? value : DEFAULT_PAGE;
}

export function pageById(id: PageId): PageDef {
	return PAGES.find((p) => p.id === id) ?? PAGES[0];
}

export function toolsForPage(id: PageId): ToolId[] {
	return pageById(id).tools;
}

export function defaultToolForPage(id: PageId): ToolId | null {
	return pageById(id).tools[0] ?? null;
}
