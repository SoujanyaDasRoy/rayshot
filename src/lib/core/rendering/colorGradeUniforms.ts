import type { Clip } from '$lib/types/project';

/**
 * The single place the colour-grade unit conversion happens.
 *
 * The panel works in the units a human wants (-100..100, plus stops for
 * exposure and 0..1 for vignette/grain). The shader works in -1..1. Those two
 * conventions used to be reconciled ad hoc inside Canvas, which got it wrong:
 * contrast was computed as (value/100) - 1, so a neutral clip resolved to
 * -1.0 — the shader's floor — and every slider was a no-op besides.
 *
 * Dependency-free (type-only import) so it is unit-testable in the node Vitest
 * project, which cannot resolve bare `$lib` specifiers.
 */

type ColorGrade = Clip['colorGrade'];
type Curves = ColorGrade['curves'];

function identityCurve(): [number, number][] {
	return [
		[0, 0],
		[1, 1]
	];
}

export const DEFAULT_COLOR_GRADE: ColorGrade = {
	exposure: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	temperature: 0,
	tint: 0,
	saturation: 0,
	vibrance: 0,
	vignette: 0,
	grain: 0,
	curves: {
		r: identityCurve(),
		g: identityCurve(),
		b: identityCurve(),
		lum: identityCurve()
	}
};

export interface ShaderUniforms {
	exposure: number;
	contrast: number;
	highlights: number;
	shadows: number;
	whites: number;
	blacks: number;
	temperature: number;
	tint: number;
	saturation: number;
	vibrance: number;
	vignette: number;
	grain: number;
	curves: Curves;
}

/** Panel units -> shader units. Every consumer goes through this. */
export function toShaderUniforms(grade: Partial<ColorGrade> | undefined): ShaderUniforms {
	const g = { ...DEFAULT_COLOR_GRADE, ...(grade ?? {}) };

	return {
		// Already in stops, which is what the shader wants.
		exposure: clamp(num(g.exposure), -10, 10),
		contrast: pct(g.contrast),
		highlights: pct(g.highlights),
		shadows: pct(g.shadows),
		whites: pct(g.whites),
		blacks: pct(g.blacks),
		temperature: pct(g.temperature),
		tint: pct(g.tint),
		saturation: pct(g.saturation),
		vibrance: pct(g.vibrance),
		// Already 0..1.
		vignette: clamp(num(g.vignette), 0, 1),
		grain: clamp(num(g.grain), 0, 1),
		curves: g.curves ?? DEFAULT_COLOR_GRADE.curves
	};
}

/**
 * Flatten curves into the 256x1 RGBA texture the shader samples.
 * Per-channel curves are composed with the luma curve.
 */
export function curvesToLut(curves: Curves | undefined): Uint8Array {
	const c = curves ?? DEFAULT_COLOR_GRADE.curves;
	const lut = new Uint8Array(256 * 4);

	for (let i = 0; i < 256; i++) {
		const x = i / 255;
		const lum = evalCurve(c.lum, x);
		lut[i * 4 + 0] = to8bit(evalCurve(c.r, lum));
		lut[i * 4 + 1] = to8bit(evalCurve(c.g, lum));
		lut[i * 4 + 2] = to8bit(evalCurve(c.b, lum));
		lut[i * 4 + 3] = 255;
	}
	return lut;
}

/**
 * The honest CSS subset, for image layers and the no-WebGL2 fallback.
 *
 * Returns '' rather than inventing approximations for what CSS cannot do —
 * highlights, shadows, whites, blacks, curves, vignette, grain and per-channel
 * white balance all need the shader.
 */
export function colorGradeToCssFilter(grade: Partial<ColorGrade> | undefined): string {
	const g = { ...DEFAULT_COLOR_GRADE, ...(grade ?? {}) };
	const parts: string[] = [];

	// One stop = a doubling of light.
	const exposure = num(g.exposure);
	if (exposure !== 0) parts.push(`brightness(${round(Math.pow(2, exposure))})`);

	const contrast = pct(g.contrast);
	if (contrast !== 0) parts.push(`contrast(${round(1 + contrast)})`);

	// Vibrance is a weaker saturation; CSS has no separate control, so fold it in.
	const saturation = pct(g.saturation) + pct(g.vibrance) * 0.5;
	if (saturation !== 0) parts.push(`saturate(${round(Math.max(0, 1 + saturation))})`);

	return parts.join(' ');
}

function pct(value: unknown): number {
	return clamp(num(value) / 100, -1, 1);
}

function num(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function to8bit(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value * 255)));
}

/** Linear interpolation between sorted control points. */
function evalCurve(points: [number, number][] | undefined, x: number): number {
	if (!points || points.length === 0) return x;
	if (points.length === 1) return points[0][1];

	const sorted = [...points].sort((a, b) => a[0] - b[0]);
	if (x <= sorted[0][0]) return sorted[0][1];
	if (x >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];

	for (let i = 1; i < sorted.length; i++) {
		const [x0, y0] = sorted[i - 1];
		const [x1, y1] = sorted[i];
		if (x <= x1) {
			const span = x1 - x0;
			return span === 0 ? y1 : y0 + ((x - x0) / span) * (y1 - y0);
		}
	}
	return x;
}
