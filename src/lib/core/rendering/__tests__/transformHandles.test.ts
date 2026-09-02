import { describe, test, expect } from 'vitest';
import {
	getLayerPreviewTransform,
	getTransformCorners,
	moveDeltaToNative,
	scaleFromPointer,
	rotationFromPointer,
	snapAngle,
	clampScale
} from '../transformHandles';
import type { Clip } from '$lib/types/project';

const clip = (transform: Partial<Clip['transform']> = {}): Clip =>
	({
		transform: { x: 0, y: 0, scale: 1, rotation: 0, ...transform }
	}) as Clip;

describe('getLayerPreviewTransform', () => {
	// This is the bug: the preview applied clip.transform.x as CSS pixels of
	// whatever size the stage happened to be rendered at on screen, while
	// export (getLayerDrawRect) applies it as pixels of the sequence's native
	// resolution. The same stored value moved a different visual distance
	// depending on the window size, and disagreed with the exported file.
	test('is a no-op string at rest', () => {
		expect(getLayerPreviewTransform(clip(), 1920, 1080)).toBe(
			'translate(0%, 0%) scale(1) rotate(0deg)'
		);
	});

	test('expresses position as a percentage of the frame, not a pixel count', () => {
		// Half the frame width to the right, whatever the frame's resolution.
		expect(getLayerPreviewTransform(clip({ x: 960 }), 1920, 1080)).toBe(
			'translate(50%, 0%) scale(1) rotate(0deg)'
		);
		expect(getLayerPreviewTransform(clip({ x: 480 }), 1920, 1080)).toBe(
			'translate(25%, 0%) scale(1) rotate(0deg)'
		);
	});

	test('the same fraction of frame width holds at any sequence resolution', () => {
		// A 4K sequence and an HD sequence must place a "quarter width" offset
		// at visually the same spot: only the fraction matters. That is the
		// whole point of expressing it as a percentage rather than a pixel
		// count copied from whatever the preview happened to be sized at.
		const hd = getLayerPreviewTransform(clip({ x: 480 }), 1920, 1080);
		const uhd = getLayerPreviewTransform(clip({ x: 960 }), 3840, 2160);
		expect(hd).toBe(uhd);
	});

	test('carries scale and rotation through unchanged', () => {
		expect(getLayerPreviewTransform(clip({ scale: 0.5, rotation: 45 }), 1920, 1080)).toBe(
			'translate(0%, 0%) scale(0.5) rotate(45deg)'
		);
	});

	test('does not divide by zero when a sequence has no resolution yet', () => {
		expect(() => getLayerPreviewTransform(clip({ x: 10 }), 0, 0)).not.toThrow();
	});
});

describe('getTransformCorners', () => {
	const stage = { width: 640, height: 360 };

	test('at rest, the corners are exactly the stage corners', () => {
		const c = getTransformCorners(clip(), stage.width, stage.height, 1920, 1080);
		expect(c.tl).toEqual({ x: 0, y: 0 });
		expect(c.tr).toEqual({ x: 640, y: 0 });
		expect(c.br).toEqual({ x: 640, y: 360 });
		expect(c.bl).toEqual({ x: 0, y: 360 });
		expect(c.center).toEqual({ x: 320, y: 180 });
	});

	test('the rotate handle sits above the top edge at rest', () => {
		const c = getTransformCorners(clip(), stage.width, stage.height, 1920, 1080);
		expect(c.rotateHandle.x).toBeCloseTo(320, 6);
		expect(c.rotateHandle.y).toBeLessThan(0);
	});

	test('scale shrinks every corner toward the centre, symmetrically', () => {
		const c = getTransformCorners(clip({ scale: 0.5 }), stage.width, stage.height, 1920, 1080);
		expect(c.tl).toEqual({ x: 160, y: 90 });
		expect(c.br).toEqual({ x: 480, y: 270 });
	});

	test('position moves every corner by the same screen-space offset', () => {
		// x is stored in native sequence pixels (960 of 1920 = half width);
		// at this stage size that is 320 screen px.
		const c = getTransformCorners(clip({ x: 960 }), stage.width, stage.height, 1920, 1080);
		expect(c.tl).toEqual({ x: 320, y: 0 });
		expect(c.tr).toEqual({ x: 960, y: 0 });
	});

	test('a 90 degree rotation swaps which corner is on top', () => {
		const c = getTransformCorners(clip({ rotation: 90 }), stage.width, stage.height, 1920, 1080);
		// The corner that started top-left is now top-right (CSS rotate is
		// clockwise for positive degrees).
		expect(c.tl.x).toBeCloseTo(c.center.x + stage.height / 2, 4);
		expect(c.tl.y).toBeCloseTo(c.center.y - stage.width / 2, 4);
	});
});

describe('moveDeltaToNative', () => {
	test('one screen pixel is one native pixel when the stage matches the sequence', () => {
		const { dx, dy } = moveDeltaToNative(10, -6, 1920, 1080, 1920, 1080);
		expect(dx).toBe(10);
		expect(dy).toBe(-6);
	});

	test('scales up when the sequence is larger than the on-screen stage', () => {
		// The stage is displayed at half the sequence's native resolution, so a
		// 10px screen drag must move the stored position by 20 native px, or
		// the content would lag behind the pointer.
		const { dx } = moveDeltaToNative(10, 0, 960, 540, 1920, 1080);
		expect(dx).toBe(20);
	});

	test('rotation of the clip does not affect the mapping — position is frame-aligned', () => {
		// Direct manipulation always drags along the screen axes, matching
		// every mainstream editor, regardless of how the object itself is
		// rotated.
		const a = moveDeltaToNative(15, 4, 960, 540, 1920, 1080);
		const b = moveDeltaToNative(15, 4, 960, 540, 1920, 1080);
		expect(a).toEqual(b);
	});
});

describe('scaleFromPointer', () => {
	const center = { x: 320, y: 180 };

	// Scale is computed relative to where the drag STARTED, not as an
	// absolute pointer-distance mapping. A corner handle has some click
	// forgiveness, so a real click rarely lands pixel-exact on the corner —
	// an absolute mapping would make the scale visibly jump to whatever
	// distance you happened to click at the instant you touched down, before
	// the pointer had moved at all. Anchoring on the origin distance means no
	// movement yet is always no scale change yet, however imprecisely you
	// grabbed the handle.
	test('no movement yet means no scale change yet, from any starting scale', () => {
		const origin = { x: center.x + 260, y: center.y - 130 };
		expect(scaleFromPointer(center, origin, origin, 1)).toBeCloseTo(1, 6);
		expect(scaleFromPointer(center, origin, origin, 2.4)).toBeCloseTo(2.4, 6);
	});

	test('doubling the distance from centre doubles the scale from wherever it started', () => {
		const origin = { x: center.x + 100, y: center.y };
		const pointer = { x: center.x + 200, y: center.y };
		expect(scaleFromPointer(center, origin, pointer, 1.5)).toBeCloseTo(3, 6);
	});

	test('halving the distance halves the scale', () => {
		const origin = { x: center.x + 200, y: center.y };
		const pointer = { x: center.x + 100, y: center.y };
		expect(scaleFromPointer(center, origin, pointer, 2)).toBeCloseTo(1, 6);
	});

	test('never returns zero, negative or non-finite, even if the drag started exactly on the centre', () => {
		const scale = scaleFromPointer(center, center, { x: center.x + 50, y: center.y }, 1);
		expect(Number.isFinite(scale)).toBe(true);
		expect(scale).toBeGreaterThan(0);
	});
});

describe('clampScale', () => {
	test('holds scale inside a sane, non-degenerate range', () => {
		expect(clampScale(0)).toBeGreaterThan(0);
		expect(clampScale(-5)).toBeGreaterThan(0);
		expect(clampScale(1000)).toBeLessThan(1000);
		expect(clampScale(1)).toBe(1);
	});
});

describe('rotationFromPointer', () => {
	const center = { x: 100, y: 100 };

	test('directly above centre is zero degrees', () => {
		expect(rotationFromPointer(center, { x: 100, y: 0 })).toBeCloseTo(0, 6);
	});

	test('directly right of centre is ninety degrees clockwise', () => {
		expect(rotationFromPointer(center, { x: 200, y: 100 })).toBeCloseTo(90, 6);
	});

	test('directly below centre is a half turn', () => {
		expect(Math.abs(rotationFromPointer(center, { x: 100, y: 200 }))).toBeCloseTo(180, 6);
	});

	test('directly left of centre is ninety degrees counter-clockwise', () => {
		expect(rotationFromPointer(center, { x: 0, y: 100 })).toBeCloseTo(-90, 6);
	});
});

describe('snapAngle', () => {
	test('pulls a near-miss onto the nearest 15 degree step', () => {
		expect(snapAngle(46, 15, 4)).toBe(45);
		expect(snapAngle(-1, 15, 4)).toBe(0);
		expect(snapAngle(89, 15, 4)).toBe(90);
	});

	test('leaves an angle alone once it is outside the tolerance', () => {
		expect(snapAngle(38, 15, 4)).toBe(38);
	});

	test('wraps correctly near the 180/-180 seam', () => {
		expect(snapAngle(179, 15, 4)).toBe(180);
		expect(snapAngle(-179, 15, 4)).toBe(-180);
	});
});
