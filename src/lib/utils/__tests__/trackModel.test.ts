import { describe, test, expect } from 'vitest';
import {
	TRACK_COLORS,
	makeTrack,
	trackLabel,
	trackLabels,
	trackHeight,
	trackColor,
	audibleTrackIds,
	isValidTrackColor,
	TRACK_TYPES
} from '../trackModel';
import type { Track } from '$lib/types/project';

const t = (over: Partial<Track> = {}): Track =>
	({ id: 't', type: 'video', order: 0, clipInstances: [], ...over }) as Track;

describe('track types', () => {
	test('subtitle joins video and audio', () => {
		expect(TRACK_TYPES).toEqual(['video', 'audio', 'subtitle']);
	});
});

describe('makeTrack', () => {
	test('creates a track with sane defaults, unlocked and audible', () => {
		const track = makeTrack('video', 0);

		expect(track.type).toBe('video');
		expect(track.locked).toBe(false);
		expect(track.muted).toBe(false);
		expect(track.hidden).toBe(false);
		expect(track.color).toBeUndefined();
		expect(track.clipInstances).toEqual([]);
	});

	test('gives every track a distinct id', () => {
		const ids = new Set(Array.from({ length: 50 }, (_, i) => makeTrack('audio', i).id));
		expect(ids.size).toBe(50);
	});
});

describe('trackLabels', () => {
	test('numbers each type independently: V1 V2 A1 A2', () => {
		const tracks = [t({ type: 'video' }), t({ type: 'video' }), t({ type: 'audio' }), t({ type: 'audio' })];
		expect(trackLabels(tracks)).toEqual(['V1', 'V2', 'A1', 'A2']);
	});

	test('subtitle tracks get their own series, not mislabelled as audio', () => {
		// The old label maths was `V{i+1}` else `A{i+1-videoCount}`, so a third
		// type came out as an audio track with the wrong number.
		const tracks = [t({ type: 'video' }), t({ type: 'subtitle' }), t({ type: 'audio' }), t({ type: 'subtitle' })];
		expect(trackLabels(tracks)).toEqual(['V1', 'S1', 'A1', 'S2']);
	});

	test('numbers by position within its own type, whatever the ordering', () => {
		const tracks = [t({ type: 'audio' }), t({ type: 'video' }), t({ type: 'audio' })];
		expect(trackLabels(tracks)).toEqual(['A1', 'V1', 'A2']);
	});

	test('labels a single track directly too', () => {
		expect(trackLabel('video', 0)).toBe('V1');
		expect(trackLabel('subtitle', 2)).toBe('S3');
	});
});

describe('trackHeight', () => {
	test('falls back to a readable per-type default', () => {
		expect(trackHeight(t({ type: 'video' }))).toBeGreaterThan(40);
		expect(trackHeight(t({ type: 'subtitle' }))).toBeGreaterThan(0);
	});

	test('an explicit height wins', () => {
		expect(trackHeight(t({ height: 120 }))).toBe(120);
	});

	test('clamps absurd heights rather than letting a lane fill the screen', () => {
		expect(trackHeight(t({ height: 5000 }))).toBeLessThanOrEqual(240);
		expect(trackHeight(t({ height: 1 }))).toBeGreaterThanOrEqual(24);
	});
});

describe('track colours', () => {
	test('offers a palette to choose from', () => {
		expect(TRACK_COLORS.length).toBeGreaterThanOrEqual(6);
	});

	test('every swatch is a valid hex colour', () => {
		for (const c of TRACK_COLORS) expect(c.value).toMatch(/^#[0-9a-f]{6}$/i);
	});

	test('swatch names are unique, so the picker never shows two "Blue"', () => {
		const names = TRACK_COLORS.map((c) => c.name);
		expect(new Set(names).size).toBe(names.length);
	});

	test('accepts a palette colour and rejects junk', () => {
		expect(isValidTrackColor(TRACK_COLORS[1].value)).toBe(true);
		expect(isValidTrackColor('javascript:alert(1)')).toBe(false);
		expect(isValidTrackColor('#xyzxyz')).toBe(false);
		expect(isValidTrackColor(undefined)).toBe(false);
	});

	test('accepts any well-formed hex, so a custom colour is not blocked', () => {
		expect(isValidTrackColor('#1a2b3c')).toBe(true);
	});
});

describe('audibleTrackIds', () => {
	const track = (id: string, extra: Partial<Track> = {}): Track => ({
		...makeTrack('audio', 0),
		id,
		...extra
	});

	test('lets everything through when nothing is muted or soloed', () => {
		const tracks = [track('a'), track('b')];
		expect(audibleTrackIds(tracks)).toEqual(new Set(['a', 'b']));
	});

	test('silences a muted track', () => {
		const audible = audibleTrackIds([track('a', { muted: true }), track('b')]);
		expect(audible.has('a')).toBe(false);
		expect(audible.has('b')).toBe(true);
	});

	test('narrows to the soloed tracks once any track is soloed', () => {
		const audible = audibleTrackIds([track('a', { solo: true }), track('b'), track('c')]);
		expect(audible).toEqual(new Set(['a']));
	});

	test('keeps every soloed track, not just the first', () => {
		const audible = audibleTrackIds([track('a', { solo: true }), track('b', { solo: true }), track('c')]);
		expect(audible).toEqual(new Set(['a', 'b']));
	});

	test('still respects mute on a soloed track: solo selects, mute silences', () => {
		// Two independent controls, both of which must pass. Predictable beats
		// clever here — "solo overrides mute" surprises people who muted on purpose.
		const audible = audibleTrackIds([track('a', { solo: true, muted: true }), track('b')]);
		expect(audible.size).toBe(0);
	});

	test('treats a project saved before solo existed as un-soloed', () => {
		const legacy = [track('a'), track('b')];
		for (const t of legacy) delete (t as Partial<Track>).solo;
		expect(audibleTrackIds(legacy)).toEqual(new Set(['a', 'b']));
	});

	test('survives an empty sequence', () => {
		expect(audibleTrackIds([])).toEqual(new Set());
	});
});

describe('trackColor', () => {
	test('each type reads as itself before anyone has chosen anything', () => {
		const video = trackColor(makeTrack('video', 0));
		const audio = trackColor(makeTrack('audio', 1));
		const subtitle = trackColor(makeTrack('subtitle', 2));
		expect(new Set([video, audio, subtitle]).size).toBe(3);
	});

	test('every type default is a colour from the one palette', () => {
		const palette = TRACK_COLORS.map((c) => c.value);
		for (const type of TRACK_TYPES) {
			expect(palette).toContain(trackColor(makeTrack(type, 0)));
		}
	});

	test("a chosen colour always beats the type's default", () => {
		const track = { ...makeTrack('video', 0), color: '#c2607f' };
		expect(trackColor(track)).toBe('#c2607f');
	});

	test('a new track stores no colour, so the default stays derivable', () => {
		// Same lesson as clip speed: do not store a value that duplicates a
		// default. A stored copy is a second representation waiting to go stale
		// when the default changes.
		expect(makeTrack('video', 0).color).toBeUndefined();
	});

	test('a track from before type colours keeps the colour it was given', () => {
		const legacy = { ...makeTrack('audio', 0), color: '#7c8592' };
		expect(trackColor(legacy)).toBe('#7c8592');
	});
});
