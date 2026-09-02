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

/**
 * What each kind of track looks like before anyone chooses.
 *
 * Colour here is doing identification work, not decoration: at a glance a lane
 * says what sort of thing lives in it. Blue for picture and green for sound
 * follow the convention every NLE already trained people on; captions take a
 * third hue so they never read as either.
 */
const DEFAULT_BY_TYPE: Record<TrackType, string> = {
	video: '#5b8def',
	audio: '#5aa469',
	subtitle: '#9a6fb0'
};

/**
 * A track's colour: what the user chose, or what its type says by default.
 *
 * The default is never written onto the track. Storing it would duplicate a
 * derivable value and make "never chosen" indistinguishable from "chose this
 * exact colour" — and it would go stale the day a default changes.
 */
export function trackColor(track: Pick<Track, 'type' | 'color'>): string {
	return track.color ?? DEFAULT_BY_TYPE[track.type] ?? TRACK_COLORS[0].value;
}

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

/**
 * Tracks in the order an editor expects to see them, top to bottom.
 *
 * Every NLE puts picture above sound and stacks video upward, so the track
 * that covers the others is the one drawn highest. RayShot listed tracks in
 * creation order while the canvas gave a higher track order a higher z-index —
 * so Video 2 sat *below* Video 1 on the timeline and covered it in the
 * viewer. The row you were looking at was hidden by the row beneath it.
 *
 * Captions ride above the picture, which is both where Resolve puts them and
 * where you can actually read them against the clips they caption.
 *
 * This is display only: the model keeps its own order, and so does labelling.
 */
export function timelineOrder<T extends Pick<Track, 'type' | 'order'>>(tracks: T[]): T[] {
	const rank: Record<TrackType, number> = { subtitle: 0, video: 1, audio: 2 };
	return [...tracks].sort((a, b) => {
		const byType = (rank[a.type] ?? 3) - (rank[b.type] ?? 3);
		if (byType !== 0) return byType;
		// Video counts up the screen; audio counts down it.
		return a.type === 'audio' ? a.order - b.order : b.order - a.order;
	});
}
