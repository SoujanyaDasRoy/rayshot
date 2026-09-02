import { describe, test, expect } from 'vitest';
import {
	DEFAULT_COLOR_GRADE,
	toShaderUniforms,
	curvesToLut,
	colorGradeToCssFilter
} from '../colorGradeUniforms';

describe('toShaderUniforms', () => {
	test('defaults map to a fully neutral uniform set', () => {
		// The regression test for the bug this module exists to kill: Canvas
		// used to compute contrast as (0/100)-1 = -1.0, the shader's floor, so
		// an ungraded clip was crushed before a single slider was touched.
		const u = toShaderUniforms(DEFAULT_COLOR_GRADE);

		for (const [key, value] of Object.entries(u)) {
			if (typeof value === 'number') {
				expect(value, `${key} should be neutral at rest`).toBe(0);
			}
		}
	});

	test('converts the -100..100 sliders onto the shader -1..1 range', () => {
		expect(toShaderUniforms({ ...DEFAULT_COLOR_GRADE, contrast: 100 }).contrast).toBe(1);
		expect(toShaderUniforms({ ...DEFAULT_COLOR_GRADE, contrast: -100 }).contrast).toBe(-1);
		expect(toShaderUniforms({ ...DEFAULT_COLOR_GRADE, saturation: 50 }).saturation).toBe(0.5);
		expect(toShaderUniforms({ ...DEFAULT_COLOR_GRADE, temperature: -25 }).temperature).toBe(-0.25);
	});

	test('exposure passes through unscaled — the panel already works in stops', () => {
		expect(toShaderUniforms({ ...DEFAULT_COLOR_GRADE, exposure: 1.5 }).exposure).toBe(1.5);
		expect(toShaderUniforms({ ...DEFAULT_COLOR_GRADE, exposure: -2 }).exposure).toBe(-2);
	});

	test('vignette and grain pass through — the panel already works in 0..1', () => {
		const u = toShaderUniforms({ ...DEFAULT_COLOR_GRADE, vignette: 0.4, grain: 0.25 });

		expect(u.vignette).toBe(0.4);
		expect(u.grain).toBe(0.25);
	});

	test('carries whites and blacks, which the shader was missing entirely', () => {
		const u = toShaderUniforms({ ...DEFAULT_COLOR_GRADE, whites: 100, blacks: -50 });

		expect(u.whites).toBe(1);
		expect(u.blacks).toBe(-0.5);
	});

	test('clamps out-of-range input rather than letting it reach the shader', () => {
		const u = toShaderUniforms({ ...DEFAULT_COLOR_GRADE, contrast: 5000, vignette: 9 });

		expect(u.contrast).toBe(1);
		expect(u.vignette).toBe(1);
	});

	test('survives a partial grade object from an older project', () => {
		const u = toShaderUniforms({ contrast: 50 } as never);

		expect(u.contrast).toBe(0.5);
		expect(u.saturation).toBe(0);
	});
});

describe('curvesToLut', () => {
	test('produces a 256-entry RGBA lookup table', () => {
		expect(curvesToLut(DEFAULT_COLOR_GRADE.curves).length).toBe(256 * 4);
	});

	test('an identity curve is a monotonic 0..255 ramp', () => {
		const lut = curvesToLut(DEFAULT_COLOR_GRADE.curves);

		expect(lut[0]).toBe(0);
		expect(lut[255 * 4]).toBe(255);
		for (let i = 1; i < 256; i++) {
			expect(lut[i * 4]).toBeGreaterThanOrEqual(lut[(i - 1) * 4]);
		}
	});

	test('a lifted curve raises output above the identity ramp', () => {
		const lifted = {
			...DEFAULT_COLOR_GRADE.curves,
			lum: [[0, 0.5], [1, 1]] as [number, number][]
		};

		expect(curvesToLut(lifted)[0]).toBeGreaterThan(100);
	});

	test('alpha is opaque so the sampler never reads a transparent texel', () => {
		const lut = curvesToLut(DEFAULT_COLOR_GRADE.curves);

		expect(lut[3]).toBe(255);
		expect(lut[255 * 4 + 3]).toBe(255);
	});
});

describe('colorGradeToCssFilter', () => {
	test('a neutral grade adds no filter at all', () => {
		expect(colorGradeToCssFilter(DEFAULT_COLOR_GRADE)).toBe('');
	});

	test('expresses the CSS-representable subset', () => {
		const css = colorGradeToCssFilter({ ...DEFAULT_COLOR_GRADE, contrast: 50, saturation: -50 });

		expect(css).toContain('contrast(');
		expect(css).toContain('saturate(');
	});

	test('exposure becomes a brightness multiplier in stops', () => {
		// +1 stop is 2x the light.
		expect(colorGradeToCssFilter({ ...DEFAULT_COLOR_GRADE, exposure: 1 })).toContain('brightness(2');
	});

	test('omits what CSS genuinely cannot express, rather than faking it', () => {
		const css = colorGradeToCssFilter({
			...DEFAULT_COLOR_GRADE,
			vignette: 1,
			grain: 1,
			highlights: 100,
			shadows: -100
		});

		expect(css).toBe('');
	});
});
