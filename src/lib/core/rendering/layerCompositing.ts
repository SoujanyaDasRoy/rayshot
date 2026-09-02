import type { Clip } from '$lib/types/project';
import { colorGradeToCssFilter } from './colorGradeUniforms';

/**
 * The parameters the preview and the exporter must agree on.
 *
 * The preview composites with absolutely-positioned DOM elements; the exporter
 * composites with canvas 2D. Sharing one draw function would mean rewriting the
 * preview, so they share the *parameters* instead — which is enough, because
 * ctx.filter accepts exactly the CSS filter string the preview div uses.
 *
 * Before this, export ran a bare drawImage: no transform, no opacity, no
 * filters and no colour grade reached the exported file at all.
 *
 * Dependency-free (type-only import of the project types) so it stays testable
 * in the node Vitest project.
 */

export interface LayerFilterOptions {
	/**
	 * Whether the colour grade should be baked into the CSS filter string.
	 * False when a shader is applying the grade, so it isn't applied twice.
	 */
	colorGradeInCss?: boolean;
}

export interface LayerDrawRect {
	dx: number;
	dy: number;
	dw: number;
	dh: number;
	rotationRad: number;
	scale: number;
}

/** Where and how big to draw a layer, in destination-canvas pixels. */
export function getLayerDrawRect(clip: Clip, canvasW: number, canvasH: number): LayerDrawRect {
	const x = clip.transform?.x ?? 0;
	const y = clip.transform?.y ?? 0;
	const scale = clip.transform?.scale ?? 1;
	const rotation = clip.transform?.rotation ?? 0;

	const dw = canvasW * scale;
	const dh = canvasH * scale;

	return {
		// Scale about the centre, matching the preview's transform-origin.
		dx: x + (canvasW - dw) / 2,
		dy: y + (canvasH - dh) / 2,
		dw,
		dh,
		rotationRad: (rotation * Math.PI) / 180,
		scale
	};
}

/** The CSS filter string for a layer. Used verbatim by both preview and export. */
export function getLayerFilter(clip: Clip, options: LayerFilterOptions = {}): string {
	const { colorGradeInCss = true } = options;
	const filterParts: string[] = [];
	const f = clip.filters;

	if (f) {
		if (f.brightness !== undefined && f.brightness !== 0) {
			filterParts.push(`brightness(${100 + Number(f.brightness)}%)`);
		}
		if (f.contrast !== undefined && f.contrast !== 0) {
			filterParts.push(`contrast(${100 + Number(f.contrast)}%)`);
		}
		if (f.saturate !== undefined && f.saturate !== 0) {
			filterParts.push(`saturate(${100 + Number(f.saturate)}%)`);
		}
		if (f.lut && f.lut !== 'none') {
			const preset = LUT_FILTERS[f.lut as string];
			if (preset) filterParts.push(preset);
		}
		if (f.blur !== undefined && f.blur !== 0) filterParts.push(`blur(${Number(f.blur)}px)`);
		if (f.grayscale !== undefined && f.grayscale !== 0) {
			filterParts.push(`grayscale(${Number(f.grayscale)}%)`);
		}
		if (f.sepia !== undefined && f.sepia !== 0) filterParts.push(`sepia(${Number(f.sepia)}%)`);
		if (f.hueRotate !== undefined && f.hueRotate !== 0) {
			filterParts.push(`hue-rotate(${Number(f.hueRotate)}deg)`);
		}
	}

	if (colorGradeInCss) {
		const grade = colorGradeToCssFilter(clip.colorGrade);
		if (grade) filterParts.push(grade);
	}

	return filterParts.length > 0 ? filterParts.join(' ') : 'none';
}

const LUT_FILTERS: Record<string, string> = {
	teal_orange: 'contrast(1.18) saturate(1.25) hue-rotate(-8deg) sepia(0.12)',
	vintage_film: 'sepia(0.28) contrast(0.95) brightness(1.04) saturate(0.85)',
	cinema_noir: 'grayscale(1) contrast(1.35) brightness(0.92)',
	golden_hour: 'sepia(0.2) saturate(1.3) hue-rotate(-5deg) brightness(1.05)',
	cyber_matrix: 'saturate(1.6) hue-rotate(18deg) contrast(1.22)'
};
