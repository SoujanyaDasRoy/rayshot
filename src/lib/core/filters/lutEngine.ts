/**
 * Look-Up Table (LUT) & Color Grading Engine
 * Provides cinematic color grading presets and shader / canvas matrix transformations.
 */

export interface LutPreset {
	id: string;
	name: string;
	category: string;
	description: string;
	cssFilter: string;
	colorMatrix?: number[]; // 4x5 color matrix for SVG/Canvas
	rgbAdjustments: {
		brightness: number; // -100 to 100
		contrast: number;   // -100 to 100
		saturation: number; // -100 to 100
		sepia: number;      // 0 to 100
		hueRotate: number;  // -180 to 180 deg
	};
}

export const BUILTIN_LUT_PRESETS: LutPreset[] = [
	{
		id: 'none',
		name: 'Standard (None)',
		category: 'Basic',
		description: 'Natural unaltered camera color',
		cssFilter: 'none',
		rgbAdjustments: { brightness: 0, contrast: 0, saturation: 0, sepia: 0, hueRotate: 0 }
	},
	{
		id: 'teal_orange',
		name: 'Teal & Orange',
		category: 'Cinematic',
		description: 'Hollywood blockbuster high-contrast teal shadows with warm skin tones',
		cssFilter: 'contrast(1.18) saturate(1.25) hue-rotate(-8deg) sepia(0.12)',
		rgbAdjustments: { brightness: 2, contrast: 18, saturation: 25, sepia: 12, hueRotate: -8 }
	},
	{
		id: 'vintage_film',
		name: 'Vintage 35mm',
		category: 'Film',
		description: 'Warm organic film grain tone with lifted blacks and soft highlights',
		cssFilter: 'sepia(0.28) contrast(0.95) brightness(1.04) saturate(0.85)',
		rgbAdjustments: { brightness: 4, contrast: -5, saturation: -15, sepia: 28, hueRotate: 4 }
	},
	{
		id: 'cinema_noir',
		name: 'Cinema Noir',
		category: 'Monochrome',
		description: 'Deep high-contrast black and white with dramatic tonal punch',
		cssFilter: 'grayscale(1) contrast(1.35) brightness(0.92)',
		rgbAdjustments: { brightness: -8, contrast: 35, saturation: -100, sepia: 0, hueRotate: 0 }
	},
	{
		id: 'golden_hour',
		name: 'Golden Hour',
		category: 'Atmospheric',
		description: 'Warm sunset glow, amplified amber hues and soft shadow warmth',
		cssFilter: 'sepia(0.2) saturate(1.3) hue-rotate(-5deg) brightness(1.05)',
		rgbAdjustments: { brightness: 5, contrast: 6, saturation: 30, sepia: 20, hueRotate: -5 }
	},
	{
		id: 'cyber_matrix',
		name: 'Cyberpunk Neon',
		category: 'Stylized',
		description: 'Stylized cyan & magenta vibrance with amplified cold highlights',
		cssFilter: 'saturate(1.6) hue-rotate(18deg) contrast(1.22)',
		rgbAdjustments: { brightness: 0, contrast: 22, saturation: 60, sepia: 0, hueRotate: 18 }
	}
];

/**
 * Get CSS filter string for a given LUT ID and user adjustment overrides
 */
export function getLutCssFilter(lutId: string = 'none'): string {
	const preset = BUILTIN_LUT_PRESETS.find((p) => p.id === lutId) ?? BUILTIN_LUT_PRESETS[0];
	return preset.cssFilter;
}

/**
 * Get a LUT preset by ID
 */
export function getLutPreset(lutId: string): LutPreset | undefined {
	return BUILTIN_LUT_PRESETS.find((p) => p.id === lutId);
}

