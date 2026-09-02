import { describe, it, expect } from 'vitest';
import {
	PX_PER_SECOND,
	MIN_ZOOM,
	MAX_ZOOM,
	MAX_TICKS,
	timeToPx,
	pxToTime,
	clampZoom,
	zoomAtAnchor,
	fitZoom,
	rulerStep,
	rulerTicks,
	formatRulerLabel
} from '../timelineRuler';

describe('timeToPx / pxToTime', () => {
	it('round-trips through the zoom level', () => {
		expect(pxToTime(timeToPx(4.25, 1.7), 1.7)).toBeCloseTo(4.25, 10);
	});

	it('uses PX_PER_SECOND at zoom 1', () => {
		expect(timeToPx(1, 1)).toBe(PX_PER_SECOND);
	});
});

describe('clampZoom', () => {
	it('holds the zoom inside the slider range', () => {
		expect(clampZoom(0.01)).toBe(MIN_ZOOM);
		expect(clampZoom(99)).toBe(MAX_ZOOM);
		expect(clampZoom(1.4)).toBe(1.4);
	});
});

describe('rulerStep', () => {
	// The whole point of an adaptive ruler: labels never crowd, never vanish.
	it('never spaces major labels closer than the legibility floor', () => {
		for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM + 1e-9; zoom += 0.1) {
			const { major } = rulerStep(zoom);
			expect(timeToPx(major, zoom)).toBeGreaterThanOrEqual(72);
		}
	});

	it('coarsens as you zoom out and refines as you zoom in', () => {
		const wide = rulerStep(MIN_ZOOM).major;
		const tight = rulerStep(MAX_ZOOM).major;
		expect(wide).toBeGreaterThan(tight);
	});

	it('drops minor ticks rather than letting them turn into a smear', () => {
		const { minor } = rulerStep(MIN_ZOOM);
		if (minor > 0) expect(timeToPx(minor, MIN_ZOOM)).toBeGreaterThanOrEqual(14);
	});

	it('subdivides the major step evenly when it does emit minors', () => {
		const { major, minor } = rulerStep(1);
		expect(minor).toBeGreaterThan(0);
		// Written as a ratio rather than a modulo: 1 % 0.2 is 0.1999... in binary
		// floating point, which would fail a test that is really about evenness.
		expect(major / minor).toBeCloseTo(Math.round(major / minor), 10);
	});
});

describe('rulerTicks', () => {
	it('labels majors and leaves minors unlabelled', () => {
		const ticks = rulerTicks(20, 1);
		const labelled = ticks.filter((t) => t.label !== null);
		expect(labelled.length).toBeGreaterThan(0);
		expect(ticks.some((t) => t.label === null)).toBe(true);
	});

	it('starts at zero and reaches the end of the sequence', () => {
		const ticks = rulerTicks(20, 1);
		expect(ticks[0].time).toBe(0);
		expect(ticks[ticks.length - 1].time).toBeGreaterThanOrEqual(20);
	});

	it('positions each tick at its own time', () => {
		const ticks = rulerTicks(10, 1.5);
		for (const tick of ticks) {
			expect(tick.px).toBeCloseTo(timeToPx(tick.time, 1.5), 6);
		}
	});

	it('stays bounded on a long sequence at full zoom', () => {
		// Two hours at max zoom is ~1.7 million pixels wide. Emitting a tick per
		// step there would stall the browser before it ever painted.
		expect(rulerTicks(7200, MAX_ZOOM).length).toBeLessThanOrEqual(MAX_TICKS);
	});

	it('survives a zero-length sequence', () => {
		expect(() => rulerTicks(0, 1)).not.toThrow();
	});
});

describe('zoomAtAnchor', () => {
	it('keeps the time under the cursor pinned to the cursor', () => {
		const zoom = 1;
		const next = 2;
		const scrollLeft = 400;
		const anchorX = 300;
		const timeUnderCursor = pxToTime(scrollLeft + anchorX, zoom);

		const nextScroll = zoomAtAnchor(next, zoom, scrollLeft, anchorX);

		expect(pxToTime(nextScroll + anchorX, next)).toBeCloseTo(timeUnderCursor, 10);
	});

	it('holds the same point when zooming back out', () => {
		const timeUnderCursor = pxToTime(1000 + 250, 2.5);
		const nextScroll = zoomAtAnchor(0.5, 2.5, 1000, 250);
		expect(pxToTime(nextScroll + 250, 0.5)).toBeCloseTo(timeUnderCursor, 10);
	});

	it('never scrolls before the start of the timeline', () => {
		expect(zoomAtAnchor(0.2, 3, 10, 5)).toBeGreaterThanOrEqual(0);
	});
});

describe('fitZoom', () => {
	it('fits the whole sequence inside the viewport', () => {
		const zoom = fitZoom(60, 1200);
		expect(timeToPx(60, zoom)).toBeLessThanOrEqual(1200);
	});

	it('stays inside the zoom range for absurd inputs', () => {
		expect(fitZoom(100000, 800)).toBe(MIN_ZOOM);
		expect(fitZoom(0.1, 4000)).toBe(MAX_ZOOM);
	});

	it('does not divide by a zero viewport', () => {
		expect(Number.isFinite(fitZoom(30, 0))).toBe(true);
	});
});

describe('formatRulerLabel', () => {
	it('shows tenths only when the step is finer than a second', () => {
		expect(formatRulerLabel(2.5, 0.5)).toBe('0:02.5');
		expect(formatRulerLabel(125, 5)).toBe('2:05');
	});

	it('grows an hours field once the sequence is that long', () => {
		expect(formatRulerLabel(3725, 60)).toBe('1:02:05');
	});
});
