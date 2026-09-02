import { describe, test, expect } from 'vitest';
import type { Clip } from '$lib/types/project';
import { getLayerOpacity } from '../canvasUtils';

describe('getLayerOpacity', () => {
	test('converts 0-100 filter opacity to a 0-1 CSS opacity value', () => {
		const clip = { filters: { opacity: 50 } } as unknown as Clip;
		expect(getLayerOpacity(clip)).toBe(0.5);
	});

	test('defaults to fully opaque when opacity is unset', () => {
		const clip = { filters: {} } as unknown as Clip;
		expect(getLayerOpacity(clip)).toBe(1);
	});

	test('100 stays fully opaque, not clamped below it', () => {
		const clip = { filters: { opacity: 100 } } as unknown as Clip;
		expect(getLayerOpacity(clip)).toBe(1);
	});
});
