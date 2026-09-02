import { describe, test, expect } from 'vitest';
import { getLayerFilter, getLayerDrawRect } from '../layerCompositing';
import type { Clip } from '$lib/types/project';

function clip(overrides: Partial<Clip> = {}): Clip {
	return {
		id: 'c1',
		mediaAssetId: 'a1',
		sourceIn: 0,
		sourceOut: 5,
		timelineStart: 0,
		timelineDuration: 5,
		transform: { x: 0, y: 0, scale: 1, rotation: 0 },
		effects: [],
		audioParameters: { volume: 1, mute: false },
		filters: {},
		...overrides
	} as Clip;
}

describe('getLayerDrawRect', () => {
	test('an identity transform fills the frame exactly', () => {
		const r = getLayerDrawRect(clip(), 1920, 1080);

		expect(r).toMatchObject({ dx: 0, dy: 0, dw: 1920, dh: 1080, rotationRad: 0 });
	});

	test('scale shrinks around the centre, not the top-left', () => {
		const r = getLayerDrawRect(clip({ transform: { x: 0, y: 0, scale: 0.5, rotation: 0 } }), 1920, 1080);

		expect(r.dw).toBe(960);
		expect(r.dh).toBe(540);
		expect(r.dx).toBe(480);
		expect(r.dy).toBe(270);
	});

	test('translation is applied in pixels, matching the preview transform', () => {
		const r = getLayerDrawRect(clip({ transform: { x: 100, y: -50, scale: 1, rotation: 0 } }), 1920, 1080);

		expect(r.dx).toBe(100);
		expect(r.dy).toBe(-50);
	});

	test('rotation converts degrees to radians', () => {
		const r = getLayerDrawRect(clip({ transform: { x: 0, y: 0, scale: 1, rotation: 90 } }), 1920, 1080);

		expect(r.rotationRad).toBeCloseTo(Math.PI / 2, 6);
	});

	test('a missing transform falls back to filling the frame', () => {
		const r = getLayerDrawRect(clip({ transform: undefined as never }), 640, 480);

		expect(r).toMatchObject({ dx: 0, dy: 0, dw: 640, dh: 480, rotationRad: 0 });
	});
});

describe('getLayerFilter with effects', () => {
	test('an applied effect reaches the picture', () => {
		// clip.effects was written by a command and read by no renderer at all.
		const css = getLayerFilter(clip({ effects: ['lens-blur'] }));
		expect(css).toContain('blur(');
	});

	test('two different effects produce two different looks', () => {
		const a = getLayerFilter(clip({ effects: ['vhs-retro'] }));
		const b = getLayerFilter(clip({ effects: ['cyber-color'] }));
		expect(a).not.toBe(b);
	});
});

describe('getLayerFilter', () => {
	test('an untouched clip needs no filter', () => {
		expect(getLayerFilter(clip())).toBe('none');
	});

	test('carries the legacy clip.filters values', () => {
		const css = getLayerFilter(clip({ filters: { brightness: 20, blur: 4 } }));

		expect(css).toContain('brightness(120%)');
		expect(css).toContain('blur(4px)');
	});

	test('includes the colour grade by default', () => {
		const css = getLayerFilter(clip({ colorGrade: { saturation: -100 } } as never));

		expect(css).toContain('saturate(0)');
	});

	test('omits the grade when the shader is handling it, to avoid double-applying', () => {
		const css = getLayerFilter(clip({ colorGrade: { saturation: -100 } } as never), {
			colorGradeInCss: false
		});

		expect(css).toBe('none');
	});

	test('preview and export are the same string by construction', () => {
		const c = clip({ filters: { contrast: 30 }, colorGrade: { contrast: 40 } } as never);

		expect(getLayerFilter(c)).toBe(getLayerFilter(c));
	});
});
