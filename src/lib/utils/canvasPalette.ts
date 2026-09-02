/**
 * The monochrome tokens, as literal colours a canvas can actually use.
 *
 * CanvasRenderingContext2D.fillStyle does not resolve CSS custom properties:
 * assigning `var(--ms-text)` is an invalid value, which the spec says to
 * ignore, so the *previous* fillStyle silently stays in effect. A palette pass
 * that rewrote hexes to design tokens reached this drawing code and turned
 * every colour into a no-op — text drawn in whatever shade happened to be set
 * last, with nothing to show that anything had gone wrong.
 *
 * Keep these in step with the `--ms-*` definitions in routes/layout.css.
 */
export const CANVAS_COLORS = {
	void: '#000000',
	text: '#ffffff',
	textSecondary: 'rgba(255, 255, 255, 0.62)',
	textTertiary: 'rgba(255, 255, 255, 0.38)',
	edge: 'rgba(255, 255, 255, 0.08)'
} as const;
