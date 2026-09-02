import type { Track } from '$lib/types/project';

/**
 * Track identity: type, label, height and colour.
 *
 * Track colours are the one place user data is allowed to be coloured — the
 * chrome stays monochrome. They are the editor's own organisational language
 * (dialogue, music, b-roll), so the user picks them, not the design system.
 *
 * Dependency-free so it stays testable in the node Vitest project.
 */

export type TrackType = 'video' | 'audio' | 'subtitle';

export const TRACK_TYPES: TrackType[] = ['video', 'audio', 'subtitle'];

export interface TrackColor {
	name: string;
	value: string;
}

/** Muted, evenly-spaced hues: legible on black without shouting over the media. */
export const TRACK_COLORS: TrackColor[] = [
	{ name: 'Slate', value: '#7c8592' },
	{ name: 'Blue', value: '#5b8def' },
	{ name: 'Teal', value: '#3fa8a0' },
	{ name: 'Green', value: '#5aa469' },
	{ name: 'Amber', value: '#c8963e' },
	{ name: 'Rust', value: '#c2704f' },
	{ name: 'Plum', value: '#9a6fb0' },
	{ name: 'Rose', value: '#c2607f' }
];

export const DEFAULT_TRACK_COLOR = TRACK_COLORS[0].value;

/** Per-type fallbacks. Subtitles need less room than a filmstrip. */
const DEFAULT_HEIGHTS: Record<TrackType, number> = {
	video: 64,
	audio: 52,
	subtitle: 34
};

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 240;

const LABEL_PREFIX: Record<TrackType, string> = {
	video: 'V',
	audio: 'A',
	subtitle: 'S'
};

export function makeTrack(type: TrackType, order: number): Track {
	return {
		id: `track-${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
		type,
		order,
		clipInstances: [],
		color: DEFAULT_TRACK_COLOR,
		locked: false,
		muted: false,
		solo: false,
		hidden: false
	};
}

export function trackLabel(type: TrackType, indexWithinType: number): string {
	return `${LABEL_PREFIX[type] ?? '?'}${indexWithinType + 1}`;
}

/**
 * Label every track, numbering each type independently.
 * The old inline maths assumed exactly two types and mislabelled a third.
 */
export function trackLabels(tracks: Pick<Track, 'type'>[]): string[] {
	const seen: Record<string, number> = {};
	return tracks.map((track) => {
		const type = track.type as TrackType;
		const n = seen[type] ?? 0;
		seen[type] = n + 1;
		return trackLabel(type, n);
	});
}

export function trackHeight(track: Pick<Track, 'type' | 'height'>): number {
	const fallback = DEFAULT_HEIGHTS[track.type as TrackType] ?? DEFAULT_HEIGHTS.video;
	const raw = typeof track.height === 'number' && Number.isFinite(track.height) ? track.height : fallback;
	return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, raw));
}

/** Any well-formed hex, so a custom colour works, but never arbitrary CSS. */
export function isValidTrackColor(value: unknown): boolean {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * Which tracks you can hear.
 *
 * Solo selects, mute silences, and both have to pass. "Solo overrides mute" is
 * the other common reading, but it surprises anyone who muted a track on
 * purpose and then soloed a different one.
 *
 * A project saved before solo existed has the flag undefined everywhere, which
 * reads as "nothing is soloed" — so old projects sound exactly as they did.
 */
export function audibleTrackIds(tracks: Track[]): Set<string> {
	const anySolo = tracks.some((track) => track.solo);
	const audible = new Set<string>();
	for (const track of tracks) {
		if (track.muted) continue;
		if (anySolo && !track.solo) continue;
		audible.add(track.id);
	}
	return audible;
}
