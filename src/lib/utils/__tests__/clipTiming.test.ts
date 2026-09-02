import { describe, test, expect } from 'vitest';
import {
	clipRate,
	timelineDurationForRate,
	sourceTimeAt,
	type ClipTiming
} from '../clipTiming';

const clip = (over: Partial<ClipTiming> = {}): ClipTiming => ({
	sourceIn: 0,
	sourceOut: 10,
	timelineStart: 0,
	timelineDuration: 10,
	...over
});

describe('clipRate', () => {
	test('a clip whose box matches its source runs at 1x', () => {
		expect(clipRate(clip())).toBe(1);
	});

	test('half the timeline length for the same source is 2x', () => {
		expect(clipRate(clip({ timelineDuration: 5 }))).toBe(2);
	});

	test('twice the timeline length is half speed', () => {
		expect(clipRate(clip({ timelineDuration: 20 }))).toBe(0.5);
	});

	test('a degenerate clip reports 1x rather than Infinity or NaN', () => {
		// A zero-length box would otherwise divide by zero and be pushed
		// straight into HTMLMediaElement.playbackRate, which throws.
		expect(clipRate(clip({ timelineDuration: 0 }))).toBe(1);
		expect(clipRate(clip({ timelineDuration: -4 }))).toBe(1);
		expect(clipRate(clip({ sourceIn: 5, sourceOut: 5 }))).toBe(1);
	});
});

describe('timelineDurationForRate', () => {
	test('doubling the speed halves the clip', () => {
		expect(timelineDurationForRate(0, 10, 2)).toBe(5);
	});

	test('halving the speed doubles the clip', () => {
		expect(timelineDurationForRate(0, 10, 0.5)).toBe(20);
	});

	test('refuses a rate that would collapse or invert the clip', () => {
		expect(timelineDurationForRate(0, 10, 0)).toBe(10);
		expect(timelineDurationForRate(0, 10, -2)).toBe(10);
	});

	test('round-trips against clipRate — the invariant that was missing', () => {
		// This is the whole point: speed and duration can no longer disagree,
		// because there is only one of them stored.
		for (const rate of [0.25, 0.5, 1, 1.5, 2, 4]) {
			const timelineDuration = timelineDurationForRate(2, 12, rate);
			expect(clipRate(clip({ sourceIn: 2, sourceOut: 12, timelineDuration }))).toBeCloseTo(
				rate,
				10
			);
		}
	});
});

describe('sourceTimeAt', () => {
	test('the head of the clip is sourceIn and the tail is sourceOut', () => {
		const c = clip({ sourceIn: 3, sourceOut: 8, timelineStart: 20, timelineDuration: 5 });
		expect(sourceTimeAt(c, 20)).toBeCloseTo(3, 10);
		expect(sourceTimeAt(c, 25)).toBeCloseTo(8, 10);
	});

	test('a 2x clip advances through its source twice as fast', () => {
		const c = clip({ sourceIn: 0, sourceOut: 10, timelineStart: 0, timelineDuration: 5 });
		expect(sourceTimeAt(c, 1)).toBeCloseTo(2, 10);
		expect(sourceTimeAt(c, 2.5)).toBeCloseTo(5, 10);
	});

	test('reaches sourceOut exactly at the end of a retimed clip', () => {
		// The old code set the element rate from one number and the seek position
		// from another; at 2x they disagreed and every sync yanked the element
		// back, which is what the stutter was.
		const timelineDuration = timelineDurationForRate(0, 10, 2);
		const c = clip({ timelineDuration });
		expect(sourceTimeAt(c, timelineDuration)).toBeCloseTo(10, 10);
		expect(clipRate(c)).toBe(2);
	});

	test('a degenerate clip parks at sourceIn instead of returning NaN', () => {
		expect(sourceTimeAt(clip({ timelineDuration: 0, sourceIn: 4 }), 7)).toBe(4);
	});
});
