import type { Clip } from '$lib/types/project';

/** Where the preview's own text layer sits: 84px at a 1920-wide frame. */
const REFERENCE_WIDTH = 1920;

/**
 * Draw a title onto an export frame.
 *
 * The preview lays text out with CSS; this has to reach the same result with
 * fillText, because a title that appears in the preview and not in the file is
 * the same class of bug as one that never rendered at all.
 */
export function drawTextClip(
	ctx: CanvasRenderingContext2D,
	clip: Clip,
	width: number,
	height: number
): void {
	const text = clip.text;
	if (!text || !text.content) return;

	const scale = width / REFERENCE_WIDTH;
	const fontSize = text.fontSize * scale;
	const padding = width * 0.06;

	ctx.save();
	ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
	ctx.fillStyle = text.color;
	ctx.textBaseline = 'middle';
	ctx.textAlign = text.align;
	ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
	ctx.shadowBlur = 12 * scale;
	ctx.shadowOffsetY = 2 * scale;

	const x = text.align === 'left' ? padding : text.align === 'right' ? width - padding : width / 2;

	// Wrap on the same width the preview's padding gives it, so a long title
	// breaks in the same place in both.
	const maxWidth = width - padding * 2;
	const lines = wrapLines(ctx, text.content, maxWidth);
	const lineHeight = fontSize * 1.15;
	const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

	lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
	ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, content: string, maxWidth: number): string[] {
	const lines: string[] = [];
	for (const paragraph of content.split('\n')) {
		let line = '';
		for (const word of paragraph.split(/\s+/)) {
			const candidate = line ? `${line} ${word}` : word;
			if (line && ctx.measureText(candidate).width > maxWidth) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		}
		lines.push(line);
	}
	return lines;
}
