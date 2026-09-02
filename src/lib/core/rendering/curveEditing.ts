/**
 * Curve manipulation for the Color page's curve editor.
 *
 * The shader has sampled u_curves since it was written and colorGradeUniforms
 * can already flatten a curve into a LUT — there was simply no way for anyone
 * to draw one. This is the missing half.
 *
 * Dependency-free so it stays testable in the node Vitest project.
 */

export type CurvePoint = [number, number];

export const IDENTITY_CURVE: CurvePoint[] = [
	[0, 0],
	[1, 1]
];

function clamp01(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.max(0, Math.min(1, v));
}

function sorted(points: CurvePoint[]): CurvePoint[] {
	return [...points].sort((a, b) => a[0] - b[0]);
}

export function addPoint(points: CurvePoint[], point: CurvePoint): CurvePoint[] {
	return sorted([...points, [clamp01(point[0]), clamp01(point[1])]]);
}

/**
 * Move one point. Endpoints keep their x pinned to 0 and 1 — dragging one
 * inward would leave the curve undefined past it.
 */
export function movePoint(points: CurvePoint[], index: number, to: CurvePoint): CurvePoint[] {
	if (index < 0 || index >= points.length) return points;

	const next = points.map((p) => [...p] as CurvePoint);
	const isFirst = index === 0;
	const isLast = index === points.length - 1;

	next[index] = [isFirst ? 0 : isLast ? 1 : clamp01(to[0]), clamp01(to[1])];

	// Re-sort instead of forbidding the crossing: dragging a point past its
	// neighbour is a normal gesture, it just reorders the control points.
	return sorted(next);
}

/** Endpoints are structural, so removal is a no-op for them. */
export function removePoint(points: CurvePoint[], index: number): CurvePoint[] {
	if (index <= 0 || index >= points.length - 1) return points;
	return points.filter((_, i) => i !== index);
}

/** SVG path for the curve, y-flipped because SVG y grows downward. */
export function curveToPath(points: CurvePoint[], width: number, height: number): string {
	const pts = sorted(points);
	if (pts.length === 0) return '';
	return pts
		.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x * width},${(1 - y) * height}`)
		.join(' ');
}
