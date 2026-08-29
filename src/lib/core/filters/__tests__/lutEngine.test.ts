import { describe, it, expect } from 'vitest';
import { BUILTIN_LUT_PRESETS, getLutCssFilter, getLutPreset } from '../lutEngine';

describe('LutEngine', () => {
	it('has at least 5 built-in LUT presets', () => {
		expect(BUILTIN_LUT_PRESETS.length).toBeGreaterThanOrEqual(5);
	});

	it('returns standard none filter for unknown or none id', () => {
		expect(getLutCssFilter('none')).toBe('none');
		expect(getLutCssFilter('unknown_id')).toBe('none');
	});

	it('returns valid CSS filter strings for cinematic presets', () => {
		const tealOrange = getLutPreset('teal_orange');
		expect(tealOrange).toBeDefined();
		expect(tealOrange?.cssFilter).toContain('contrast');
		expect(tealOrange?.cssFilter).toContain('hue-rotate');
		expect(getLutCssFilter('teal_orange')).toBe(tealOrange?.cssFilter);
	});
});

