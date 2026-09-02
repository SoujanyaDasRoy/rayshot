import { describe, test, expect } from 'vitest';
import {
	VIDEO_EFFECTS,
	AUDIO_EFFECTS,
	effectById,
	paramMeta,
	PARAM_META,
	effectsToCssFilter,
	applyEffectDefaults
} from '../effectRegistry';

describe('effect registry', () => {
	test('every video effect has a distinct id and a real name', () => {
		const ids = VIDEO_EFFECTS.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const e of VIDEO_EFFECTS) expect(e.name.length).toBeGreaterThan(0);
	});

	test('the named effects actually differ from one another', () => {
		// All six cards used to call the same preset: Glitch and Sharpen were
		// byte-identical, and every one of them just set filters.brightness.
		const signatures = VIDEO_EFFECTS.map((e) => JSON.stringify(e.params));
		expect(new Set(signatures).size).toBe(signatures.length);
	});

	test('looks up by id, and returns null for an unknown one', () => {
		expect(effectById(VIDEO_EFFECTS[0].id)?.id).toBe(VIDEO_EFFECTS[0].id);
		expect(effectById('does-not-exist')).toBeNull();
	});

	test('audio effects exist at all — there were none', () => {
		expect(AUDIO_EFFECTS.length).toBeGreaterThan(0);
		for (const e of AUDIO_EFFECTS) expect(e.kind).toBe('audio');
	});
});

describe('effectsToCssFilter', () => {
	test('no effects means no filter', () => {
		expect(effectsToCssFilter([])).toBe('');
	});

	test('a CSS-expressible effect produces its filter', () => {
		const blur = VIDEO_EFFECTS.find((e) => e.id === 'lens-blur')!;
		expect(effectsToCssFilter([blur.id])).toContain('blur(');
	});

	test('stacks multiple effects in order', () => {
		const css = effectsToCssFilter(['vhs-retro', 'lens-blur']);
		expect(css.indexOf('sepia')).toBeLessThan(css.indexOf('blur('));
	});

	test('ignores unknown ids instead of throwing', () => {
		expect(effectsToCssFilter(['nope', 'lens-blur'])).toContain('blur(');
	});

	test('an effect the shader owns contributes nothing to CSS', () => {
		// Honest omission rather than a fake approximation.
		const shaderOnly = VIDEO_EFFECTS.filter((e) => !e.cssFilter);
		for (const e of shaderOnly) expect(effectsToCssFilter([e.id])).toBe('');
	});
});

describe('applyEffectDefaults', () => {
	test('fills a clip with the effect parameters it does not have yet', () => {
		const params = applyEffectDefaults({}, 'lens-blur');
		expect(Object.keys(params).length).toBeGreaterThan(0);
	});

	test('does not clobber values the user already set', () => {
		const existing = { blur: 12 };
		expect(applyEffectDefaults(existing, 'lens-blur').blur).toBe(12);
	});
});

describe('paramMeta', () => {
	// The one that matters: an effect whose parameter has no metadata renders
	// as a slider with a guessed range, which is worse than no slider at all.
	// This fails the moment someone adds an effect and forgets the table.
	test('every parameter of every registered effect has a range', () => {
		const missing: string[] = [];
		for (const effect of [...VIDEO_EFFECTS, ...AUDIO_EFFECTS]) {
			for (const name of Object.keys(effect.params)) {
				if (!(name in PARAM_META)) missing.push(`${effect.id}.${name}`);
			}
		}
		expect(missing).toEqual([]);
	});

	test('every default value sits inside its own range', () => {
		const outOfRange: string[] = [];
		for (const effect of [...VIDEO_EFFECTS, ...AUDIO_EFFECTS]) {
			for (const [name, value] of Object.entries(effect.params)) {
				const meta = paramMeta(name);
				if (value < meta.min || value > meta.max) {
					outOfRange.push(`${effect.id}.${name}=${value} not in ${meta.min}..${meta.max}`);
				}
			}
		}
		expect(outOfRange).toEqual([]);
	});

	test('falls back to a usable range for an unknown parameter', () => {
		const meta = paramMeta('somethingNobodyDefined');
		expect(meta.max).toBeGreaterThan(meta.min);
		expect(meta.step).toBeGreaterThan(0);
	});

	test("labels a parameter in the user's terms, not the code's", () => {
		expect(paramMeta('highPassHz').label).toBe('High-pass');
		expect(paramMeta('highPassHz').unit).toBe('Hz');
	});
});
