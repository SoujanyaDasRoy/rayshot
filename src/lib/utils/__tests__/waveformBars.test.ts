import { describe, test, expect } from 'vitest';
import { waveformBars } from '../waveformBars';

// A 100-peak ramp: peaks[i] === i / 100, so a slice's values reveal
// exactly which window of the source was taken.
const ramp = Array.from({ length: 100 }, (_, i) => i / 100);

describe('waveformBars', () => {
	test('bar count scales with clip width', () => {
		const narrow = waveformBars(ramp, 0, 10, 10, 40);
		const wide = waveformBars(ramp, 0, 10, 10, 400);

		expect(wide.length).toBeGreaterThan(narrow.length);
	});

	test('clamps bar count so a hairline clip still renders and a huge one stays cheap', () => {
		expect(waveformBars(ramp, 0, 10, 10, 1).length).toBe(6);
		expect(waveformBars(ramp, 0, 10, 10, 100000).length).toBe(180);
	});

	test('sourceIn/sourceOut select the matching window of the source peaks', () => {
		// Second half of a 10s asset -> values drawn from the top half of the ramp.
		const secondHalf = waveformBars(ramp, 5, 10, 10, 200);

		expect(Math.min(...secondHalf)).toBeGreaterThanOrEqual(0.5);
	});

	test('a trimmed window does not reuse the full-clip values', () => {
		const full = waveformBars(ramp, 0, 10, 10, 200);
		const trimmed = waveformBars(ramp, 5, 10, 10, 200);

		expect(trimmed).not.toEqual(full);
	});

	test('empty peaks falls back to a flat baseline instead of throwing', () => {
		const bars = waveformBars([], 0, 10, 10, 200);

		expect(bars.length).toBeGreaterThan(0);
		expect(bars.every((v) => v >= 0 && v <= 1)).toBe(true);
	});

	test('every bar is a finite 0..1 value, even with a degenerate zero-length window', () => {
		const bars = waveformBars(ramp, 4, 4, 10, 200);

		expect(bars.length).toBeGreaterThan(0);
		expect(bars.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
	});

	test('survives a zero assetDuration without dividing by zero', () => {
		const bars = waveformBars(ramp, 0, 0, 0, 200);

		expect(bars.every((v) => Number.isFinite(v))).toBe(true);
	});
});
