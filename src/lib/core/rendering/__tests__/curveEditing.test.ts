import { describe, test, expect } from 'vitest';
import { addPoint, movePoint, removePoint, curveToPath, IDENTITY_CURVE } from '../curveEditing';

describe('curve editing', () => {
	test('identity is a straight line from black to white', () => {
		expect(IDENTITY_CURVE).toEqual([[0, 0], [1, 1]]);
	});

	test('adding a point keeps the curve sorted by input', () => {
		const c = addPoint(IDENTITY_CURVE, [0.5, 0.7]);
		expect(c.map((p) => p[0])).toEqual([0, 0.5, 1]);
	});

	test('clamps a point into the 0..1 box', () => {
		const c = addPoint(IDENTITY_CURVE, [5, -2]);
		const added = c.find((p) => p[0] === 1 && p[1] === 0);
		expect(added).toBeDefined();
	});

	test('moving a point re-sorts rather than crossing its neighbours', () => {
		const c = addPoint(IDENTITY_CURVE, [0.3, 0.3]);
		const moved = movePoint(c, 1, [0.9, 0.4]);
		expect(moved.map((p) => p[0])).toEqual([...moved.map((p) => p[0])].sort((a, b) => a - b));
	});

	test('the endpoints cannot be dragged off the ends', () => {
		// Losing an endpoint leaves the curve undefined at 0 or 1.
		const moved = movePoint(IDENTITY_CURVE, 0, [0.4, 0.4]);
		expect(moved[0][0]).toBe(0);
		const movedEnd = movePoint(IDENTITY_CURVE, 1, [0.4, 0.4]);
		expect(movedEnd[movedEnd.length - 1][0]).toBe(1);
	});

	test('removing an interior point works, endpoints are protected', () => {
		const c = addPoint(IDENTITY_CURVE, [0.5, 0.5]);
		expect(removePoint(c, 1)).toHaveLength(2);
		expect(removePoint(c, 0)).toHaveLength(3);
		expect(removePoint(c, 2)).toHaveLength(3);
	});

	test('renders an SVG path across the full width', () => {
		const d = curveToPath(IDENTITY_CURVE, 100, 100);
		expect(d.startsWith('M')).toBe(true);
		expect(d).toContain('L');
	});

	test('the path is y-flipped, because SVG y grows downward', () => {
		// Input 0 (black) must sit at the BOTTOM of the box, not the top.
		const d = curveToPath(IDENTITY_CURVE, 100, 100);
		expect(d).toMatch(/^M\s*0[,\s]+100/);
	});
});
