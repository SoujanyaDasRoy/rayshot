/**
 * Hand-drawn icon set, 24x24 optical grid.
 *
 * Modelled on SF Symbols' behaviour rather than any icon library: every glyph
 * has a resting form and a heavier selected form, so selection reads as a shift
 * in optical weight (outline -> fill for shapes, regular -> semibold for
 * strokes) instead of only a colour change. Stroke width is standardised at
 * 1.6 resting / 2.3 selected across the whole set.
 */

export interface IconGlyph {
	/** Resting form. */
	outline: string;
	/** Selected form — filled, or the same strokes at heavier weight. */
	solid: string;
}

export type IconName = keyof typeof ICONS;

export const ICONS = {
	library: {
		outline: `<rect x="3" y="5.2" width="18" height="13.6" rx="3.2"/><path d="M10.5 9.9v4.2l3.7-2.1z" stroke-linejoin="round"/>`,
		solid: `<path fill-rule="evenodd" d="M6.2 5.2h11.6A3.2 3.2 0 0 1 21 8.4v7.2a3.2 3.2 0 0 1-3.2 3.2H6.2A3.2 3.2 0 0 1 3 15.6V8.4a3.2 3.2 0 0 1 3.2-3.2Zm4.3 4.7v4.2l3.7-2.1z"/>`
	},
	record: {
		outline: `<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>`,
		solid: `<path fill-rule="evenodd" d="M12 2.9a9.1 9.1 0 1 0 0 18.2 9.1 9.1 0 0 0 0-18.2Zm0 2.3a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6Z"/><circle cx="12" cy="12" r="4.4"/>`
	},
	templates: {
		outline: `<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>`,
		solid: `<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>`
	},
	effects: {
		outline: `<path d="M9.8 3.4c.52 3.2 1.72 4.4 4.92 4.92-3.2.52-4.4 1.72-4.92 4.92-.52-3.2-1.72-4.4-4.92-4.92 3.2-.52 4.4-1.72 4.92-4.92Z" stroke-linejoin="round"/><path d="M17 14.2c.28 1.72.92 2.36 2.64 2.64-1.72.28-2.36.92-2.64 2.64-.28-1.72-.92-2.36-2.64-2.64 1.72-.28 2.36-.92 2.64-2.64Z" stroke-linejoin="round"/>`,
		solid: `<path d="M9.8 3.4c.52 3.2 1.72 4.4 4.92 4.92-3.2.52-4.4 1.72-4.92 4.92-.52-3.2-1.72-4.4-4.92-4.92 3.2-.52 4.4-1.72 4.92-4.92Z"/><path d="M17 14.2c.28 1.72.92 2.36 2.64 2.64-1.72.28-2.36.92-2.64 2.64-.28-1.72-.92-2.36-2.64-2.64 1.72-.28 2.36-.92 2.64-2.64Z"/>`
	},
	text: {
		outline: `<path d="M4.8 7.6V5.4h14.4v2.2"/><path d="M12 5.4v13.2"/><path d="M8.9 18.6h6.2"/>`,
		solid: `<path d="M4.8 7.6V5.4h14.4v2.2"/><path d="M12 5.4v13.2"/><path d="M8.9 18.6h6.2"/>`
	},
	export: {
		outline: `<path d="M12 3.6v10.2"/><path d="m8.5 7.1 3.5-3.5 3.5 3.5"/><path d="M5.6 12.6v5.1a2.3 2.3 0 0 0 2.3 2.3h8.2a2.3 2.3 0 0 0 2.3-2.3v-5.1"/>`,
		solid: `<path d="M12 3.6v10.2"/><path d="m8.5 7.1 3.5-3.5 3.5 3.5"/><path d="M5.6 12.6v5.1a2.3 2.3 0 0 0 2.3 2.3h8.2a2.3 2.3 0 0 0 2.3-2.3v-5.1"/>`
	},
	import: {
		outline: `<path d="M12 3.6v10.2"/><path d="m8.5 10.3 3.5 3.5 3.5-3.5"/><path d="M5.6 12.6v5.1a2.3 2.3 0 0 0 2.3 2.3h8.2a2.3 2.3 0 0 0 2.3-2.3v-5.1"/>`,
		solid: `<path d="M12 3.6v10.2"/><path d="m8.5 10.3 3.5 3.5 3.5-3.5"/><path d="M5.6 12.6v5.1a2.3 2.3 0 0 0 2.3 2.3h8.2a2.3 2.3 0 0 0 2.3-2.3v-5.1"/>`
	},
	add: {
		outline: `<path d="M12 5v14"/><path d="M5 12h14"/>`,
		solid: `<path d="M12 5v14"/><path d="M5 12h14"/>`
	},
	undo: {
		outline: `<path d="M4.8 10.6h9.3a4.7 4.7 0 1 1 0 9.4H9.6"/><path d="m8.6 6.5-3.8 4.1 3.8 4.1"/>`,
		solid: `<path d="M4.8 10.6h9.3a4.7 4.7 0 1 1 0 9.4H9.6"/><path d="m8.6 6.5-3.8 4.1 3.8 4.1"/>`
	},
	redo: {
		outline: `<path d="M19.2 10.6H9.9a4.7 4.7 0 1 0 0 9.4h4.5"/><path d="m15.4 6.5 3.8 4.1-3.8 4.1"/>`,
		solid: `<path d="M19.2 10.6H9.9a4.7 4.7 0 1 0 0 9.4h4.5"/><path d="m15.4 6.5 3.8 4.1-3.8 4.1"/>`
	},
	sidebar: {
		outline: `<rect x="3" y="4.6" width="18" height="14.8" rx="3.2"/><path d="M9.7 4.6v14.8"/>`,
		solid: `<rect x="3" y="4.6" width="18" height="14.8" rx="3.2"/><path d="M9.7 4.6v14.8"/>`
	},
	inspector: {
		outline: `<rect x="3" y="4.6" width="18" height="14.8" rx="3.2"/><path d="M14.3 4.6v14.8"/>`,
		solid: `<rect x="3" y="4.6" width="18" height="14.8" rx="3.2"/><path d="M14.3 4.6v14.8"/>`
	},
	folder: {
		outline: `<path d="M3.6 8a2.4 2.4 0 0 1 2.4-2.4h3.2l2 2.4h6.8A2.4 2.4 0 0 1 20.4 10.4v6.2a2.4 2.4 0 0 1-2.4 2.4H6a2.4 2.4 0 0 1-2.4-2.4Z" stroke-linejoin="round"/>`,
		solid: `<path d="M3.6 8a2.4 2.4 0 0 1 2.4-2.4h3.2l2 2.4h6.8A2.4 2.4 0 0 1 20.4 10.4v6.2a2.4 2.4 0 0 1-2.4 2.4H6a2.4 2.4 0 0 1-2.4-2.4Z"/>`
	},
	settings: {
		outline: `<path d="M3.6 8.4h8.2"/><path d="M15.8 8.4h4.6"/><circle cx="13.8" cy="8.4" r="2.1"/><path d="M3.6 15.6h4.6"/><path d="M12.2 15.6h8.2"/><circle cx="10.2" cy="15.6" r="2.1"/>`,
		solid: `<path d="M3.6 8.4h8.2"/><path d="M15.8 8.4h4.6"/><circle cx="13.8" cy="8.4" r="2.1"/><path d="M3.6 15.6h4.6"/><path d="M12.2 15.6h8.2"/><circle cx="10.2" cy="15.6" r="2.1"/>`
	},
	help: {
		outline: `<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.5a2.5 2.5 0 1 1 2.8 2.5v1.4"/><circle cx="12.4" cy="16.4" r="0.95" fill="currentColor" stroke="none"/>`,
		solid: `<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.5a2.5 2.5 0 1 1 2.8 2.5v1.4"/><circle cx="12.4" cy="16.4" r="0.95" fill="currentColor" stroke="none"/>`
	},
	/*
		Page glyphs. Each one diagrams the layout of the workspace it switches
		to, rather than illustrating a topic — so the switcher shows the room
		you are moving to. Same 24x24 grid and stroke weights as the rest.
	*/
	'page-media': {
		outline: `<rect x="3.4" y="5" width="7.4" height="6" rx="1.4"/><rect x="13.2" y="5" width="7.4" height="6" rx="1.4"/><rect x="3.4" y="13" width="7.4" height="6" rx="1.4"/><rect x="13.2" y="13" width="7.4" height="6" rx="1.4"/>`,
		solid: `<rect x="3.4" y="5" width="7.4" height="6" rx="1.4"/><rect x="13.2" y="5" width="7.4" height="6" rx="1.4"/><rect x="3.4" y="13" width="7.4" height="6" rx="1.4"/><rect x="13.2" y="13" width="7.4" height="6" rx="1.4"/>`
	},
	'page-edit': {
		outline: `<rect x="3.4" y="5" width="17.2" height="4.6" rx="1.4"/><path d="M3.4 13.4h9.2"/><path d="M3.4 17.6h13.4"/><path d="M17.4 12.2v7.2"/>`,
		solid: `<rect x="3.4" y="5" width="17.2" height="4.6" rx="1.4"/><path d="M3.4 13.4h9.2"/><path d="M3.4 17.6h13.4"/><path d="M17.4 12.2v7.2"/>`
	},
	'page-color': {
		outline: `<rect x="3.4" y="4.8" width="17.2" height="14.4" rx="2.6"/><path d="M12 4.8v14.4"/><circle cx="7.6" cy="12" r="1.9"/>`,
		solid: `<rect x="3.4" y="4.8" width="17.2" height="14.4" rx="2.6"/><path d="M12 4.8v14.4"/><circle cx="7.6" cy="12" r="1.9"/>`
	},
	'page-audio': {
		outline: `<path d="M3.6 12h1.8"/><path d="M7.6 8.4v7.2"/><path d="M11.2 5.6v12.8"/><path d="M14.8 9.2v5.6"/><path d="M18.4 7v10"/><path d="M20.6 12h-0.2"/>`,
		solid: `<path d="M3.6 12h1.8"/><path d="M7.6 8.4v7.2"/><path d="M11.2 5.6v12.8"/><path d="M14.8 9.2v5.6"/><path d="M18.4 7v10"/><path d="M20.6 12h-0.2"/>`
	},
	chevron: {
		outline: `<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>`,
		solid: `<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>`
	}
} as const satisfies Record<string, IconGlyph>;

/**
 * How each glyph's selected form is painted. Shape-like marks fill in; glyph-like
 * marks (a "T", an arrow) have nothing to fill, so they gain weight instead —
 * the same split SF Symbols makes between its fill and semibold variants.
 */
export const SOLID_PAINT = {
	library: 'fill',
	record: 'fill',
	templates: 'fill',
	effects: 'fill',
	folder: 'fill',
	text: 'stroke',
	export: 'stroke',
	import: 'stroke',
	add: 'stroke',
	undo: 'stroke',
	redo: 'stroke',
	sidebar: 'stroke',
	inspector: 'stroke',
	settings: 'stroke',
	help: 'stroke',
	'page-media': 'fill',
	'page-edit': 'stroke',
	'page-color': 'stroke',
	'page-audio': 'stroke',
	chevron: 'stroke'
} as const satisfies Record<IconName, 'fill' | 'stroke'>;
