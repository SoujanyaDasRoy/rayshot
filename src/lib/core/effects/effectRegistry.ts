/**
 * What the named effects actually are.
 *
 * The effects drawer shipped six cards — Glitch, Lens Blur, VHS Retro, Cyber
 * Color, Sharpen, Glow — and every one of them called the same code path and
 * set filters.brightness. Glitch and Sharpen were byte-identical. Each preset
 * carried a `cssFilter` string describing its real look that nothing ever
 * read.
 *
 * Dependency-free so it stays testable in the node Vitest project.
 */

export type EffectKind = 'video' | 'audio';

export interface EffectDef {
	id: string;
	name: string;
	kind: EffectKind;
	/** One line, in the user's terms, not the implementation's. */
	description: string;
	/** Default parameter values written onto the clip when first applied. */
	params: Record<string, number>;
	/**
	 * The CSS filter this effect contributes, if it is expressible that way.
	 * Absent means the shader owns it — we omit rather than fake it.
	 */
	cssFilter?: (params: Record<string, number>) => string;
}

export const VIDEO_EFFECTS: EffectDef[] = [
	{
		id: 'lens-blur',
		name: 'Lens Blur',
		kind: 'video',
		description: 'Softens the whole frame, as a wide aperture would.',
		params: { blur: 6 },
		cssFilter: (p) => `blur(${p.blur ?? 6}px)`
	},
	{
		id: 'vhs-retro',
		name: 'VHS Retro',
		kind: 'video',
		description: 'Warm, faded tape look with reduced contrast.',
		params: { sepia: 30, contrast: -10, saturate: -15 },
		cssFilter: (p) =>
			`sepia(${p.sepia ?? 30}%) contrast(${100 + (p.contrast ?? -10)}%) saturate(${100 + (p.saturate ?? -15)}%)`
	},
	{
		id: 'cyber-color',
		name: 'Cyber Color',
		kind: 'video',
		description: 'Pushes saturation and shifts hue towards cyan.',
		params: { saturate: 55, hueRotate: 18 },
		cssFilter: (p) => `saturate(${100 + (p.saturate ?? 55)}%) hue-rotate(${p.hueRotate ?? 18}deg)`
	},
	{
		id: 'noir',
		name: 'Noir',
		kind: 'video',
		description: 'Black and white with hard contrast.',
		params: { grayscale: 100, contrast: 35 },
		cssFilter: (p) => `grayscale(${p.grayscale ?? 100}%) contrast(${100 + (p.contrast ?? 35)}%)`
	},
	{
		id: 'glow',
		name: 'Glow',
		kind: 'video',
		description: 'Lifts the highlights so bright areas bloom.',
		params: { brightness: 12, blur: 1 },
		cssFilter: (p) => `brightness(${100 + (p.brightness ?? 12)}%) blur(${p.blur ?? 1}px)`
	},
	{
		id: 'sharpen',
		name: 'Sharpen',
		kind: 'video',
		description: 'Increases local contrast at edges.',
		// No honest CSS equivalent: a convolution needs the shader. Omitted
		// rather than approximated with contrast, which is what the old
		// presets did to everything.
		params: { amount: 40 }
	},
	{
		id: 'glitch',
		name: 'Glitch',
		kind: 'video',
		description: 'Displaces colour channels for a broken-signal look.',
		// Channel displacement is a shader effect; CSS cannot express it.
		params: { amount: 35, speed: 50 }
	}
];

export const AUDIO_EFFECTS: EffectDef[] = [
	{
		id: 'voice-clarity',
		name: 'Voice Clarity',
		kind: 'audio',
		description: 'Cuts low rumble and lifts speech frequencies.',
		params: { highPassHz: 90, presenceDb: 3 }
	},
	{
		id: 'warmth',
		name: 'Warmth',
		kind: 'audio',
		description: 'Gently raises the low mids.',
		params: { lowShelfHz: 200, gainDb: 2.5 }
	},
	{
		id: 'de-esser',
		name: 'De-esser',
		kind: 'audio',
		description: 'Tames harsh S sounds.',
		params: { centerHz: 6500, reductionDb: -4 }
	},
	{
		id: 'room',
		name: 'Room',
		kind: 'audio',
		description: 'Adds a short, close reverb.',
		params: { mix: 18, decaySec: 0.8 }
	}
];

const ALL = [...VIDEO_EFFECTS, ...AUDIO_EFFECTS];

export function effectById(id: string): EffectDef | null {
	return ALL.find((e) => e.id === id) ?? null;
}

/** Compose the CSS-expressible effects on a clip, in the order applied. */
export function effectsToCssFilter(
	effectIds: string[],
	params: Record<string, number> = {}
): string {
	const parts: string[] = [];
	for (const id of effectIds) {
		const def = effectById(id);
		if (!def?.cssFilter) continue;
		parts.push(def.cssFilter({ ...def.params, ...params }));
	}
	return parts.join(' ');
}

/** Seed a clip's params for a newly applied effect without overwriting edits. */
export function applyEffectDefaults(
	existing: Record<string, number>,
	effectId: string
): Record<string, number> {
	const def = effectById(effectId);
	if (!def) return existing;
	return { ...def.params, ...existing };
}

export interface ParamMeta {
	/** What to call it in the Inspector — the user's word, not the code's. */
	label: string;
	min: number;
	max: number;
	step: number;
	unit?: string;
}

/**
 * Ranges for effect parameters, keyed by parameter name rather than by effect.
 *
 * Names repeat across effects — `contrast` means the same thing in Noir as in
 * VHS Retro — so one table beats a range block on every effect. A test asserts
 * every registered parameter appears here, which is what stops a new effect
 * quietly rendering with a guessed range.
 */
export const PARAM_META: Record<string, ParamMeta> = {
	blur: { label: 'Blur', min: 0, max: 20, step: 0.5, unit: 'px' },
	sepia: { label: 'Sepia', min: 0, max: 100, step: 1, unit: '%' },
	contrast: { label: 'Contrast', min: -100, max: 100, step: 1, unit: '%' },
	saturate: { label: 'Saturation', min: -100, max: 100, step: 1, unit: '%' },
	hueRotate: { label: 'Hue', min: -180, max: 180, step: 1, unit: '°' },
	grayscale: { label: 'Desaturate', min: 0, max: 100, step: 1, unit: '%' },
	brightness: { label: 'Brightness', min: -100, max: 100, step: 1, unit: '%' },
	amount: { label: 'Amount', min: 0, max: 100, step: 1, unit: '%' },
	speed: { label: 'Speed', min: 0, max: 100, step: 1, unit: '%' },
	mix: { label: 'Mix', min: 0, max: 100, step: 1, unit: '%' },
	highPassHz: { label: 'High-pass', min: 20, max: 500, step: 5, unit: 'Hz' },
	lowShelfHz: { label: 'Low shelf', min: 60, max: 800, step: 10, unit: 'Hz' },
	centerHz: { label: 'Centre', min: 2000, max: 12000, step: 100, unit: 'Hz' },
	presenceDb: { label: 'Presence', min: -12, max: 12, step: 0.5, unit: 'dB' },
	gainDb: { label: 'Gain', min: -12, max: 12, step: 0.5, unit: 'dB' },
	reductionDb: { label: 'Reduction', min: -24, max: 0, step: 0.5, unit: 'dB' },
	decaySec: { label: 'Decay', min: 0.1, max: 3, step: 0.1, unit: 's' }
};

const FALLBACK_META: ParamMeta = { label: 'Amount', min: 0, max: 100, step: 1 };

export function paramMeta(name: string): ParamMeta {
	return PARAM_META[name] ?? { ...FALLBACK_META, label: name };
}
