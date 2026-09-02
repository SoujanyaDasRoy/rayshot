import { describe, test, expect, vi } from 'vitest';
import { drawTextClip } from '../drawTextClip';
import type { Clip } from '$lib/types/project';

function fakeCtx(charWidth = 10) {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		fillText: vi.fn(),
		measureText: (s: string) => ({ width: s.length * charWidth }),
		font: '',
		fillStyle: '',
		textBaseline: '',
		textAlign: '',
		shadowColor: '',
		shadowBlur: 0,
		shadowOffsetY: 0
	};
}

const clip = (text: Partial<Clip['text']> | undefined): Clip =>
	({ text: text as Clip['text'] }) as Clip;

describe('drawTextClip', () => {
	test('draws nothing when there is nothing to say', () => {
		const ctx = fakeCtx();
		drawTextClip(ctx as never, clip(undefined), 1920, 1080);
		drawTextClip(ctx as never, clip({ content: '', fontSize: 84, align: 'center', color: '#fff' }), 1920, 1080);
		expect(ctx.fillText).not.toHaveBeenCalled();
	});

	test('scales the type with the frame, so a title keeps its proportion', () => {
		// 84px at 1920 must be 42px at 960, or an export at a different
		// resolution silently changes the design.
		const big = fakeCtx();
		drawTextClip(big as never, clip({ content: 'Hi', fontSize: 84, align: 'center', color: '#fff' }), 1920, 1080);
		const small = fakeCtx();
		drawTextClip(small as never, clip({ content: 'Hi', fontSize: 84, align: 'center', color: '#fff' }), 960, 540);

		expect(big.font).toContain('84px');
		expect(small.font).toContain('42px');
	});

	test('centres on the frame, and insets when aligned to an edge', () => {
		const centre = fakeCtx();
		drawTextClip(centre as never, clip({ content: 'Hi', fontSize: 84, align: 'center', color: '#fff' }), 1000, 500);
		expect(centre.fillText.mock.calls[0][1]).toBe(500);

		const left = fakeCtx();
		drawTextClip(left as never, clip({ content: 'Hi', fontSize: 84, align: 'left', color: '#fff' }), 1000, 500);
		// Inset by the same 6% the preview pads with, not flush to the edge.
		expect(left.fillText.mock.calls[0][1]).toBe(60);
	});

	test('wraps a long title instead of running it off the frame', () => {
		const ctx = fakeCtx(40);
		drawTextClip(
			ctx as never,
			clip({ content: 'one two three four five six', fontSize: 84, align: 'center', color: '#fff' }),
			1000,
			500
		);
		expect(ctx.fillText.mock.calls.length).toBeGreaterThan(1);
	});

	test('honours an explicit line break', () => {
		const ctx = fakeCtx();
		drawTextClip(
			ctx as never,
			clip({ content: 'first\nsecond', fontSize: 84, align: 'center', color: '#fff' }),
			1920,
			1080
		);
		expect(ctx.fillText.mock.calls.map((c) => c[0])).toEqual(['first', 'second']);
	});

	test('stacks lines around the middle rather than growing downward', () => {
		const ctx = fakeCtx();
		drawTextClip(
			ctx as never,
			clip({ content: 'a\nb', fontSize: 100, align: 'center', color: '#fff' }),
			1920,
			1000
		);
		const ys = ctx.fillText.mock.calls.map((c) => c[2] as number);
		expect((ys[0] + ys[1]) / 2).toBeCloseTo(500, 6);
	});
});
