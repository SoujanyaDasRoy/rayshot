import { expect, test } from '@playwright/test';
import { colorGradeShader } from '../colorGradeShader.glsl.ts';

/**
 * Compiling is not the same as being correct. These render actual pixels
 * through the real fragment shader and read them back.
 *
 * The compile-only test passed happily while the shader, at its default
 * settings, desaturated the image to grey (vibrance), tinted it (tint = 0
 * still applied 0.1), and cooled it to 8500K.
 */
const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_texCoord;
void main() {
  v_texCoord = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

type Grade = Partial<Record<string, number>>;

async function renderPixel(page: import('@playwright/test').Page, rgb: [number, number, number], grade: Grade) {
	return page.evaluate(
		({ frag, vert, rgb, grade }) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 8;
			const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
			if (!gl) return { error: 'no webgl2' };

			const compile = (type: number, src: string) => {
				const sh = gl.createShader(type)!;
				gl.shaderSource(sh, src);
				gl.compileShader(sh);
				if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? '');
				return sh;
			};

			const prog = gl.createProgram()!;
			gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
			gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
			gl.linkProgram(prog);
			if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? '');
			gl.useProgram(prog);

			const buf = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
			const loc = gl.getAttribLocation(prog, 'a_pos');
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

			// Source: a solid colour.
			gl.activeTexture(gl.TEXTURE0);
			const videoTex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, videoTex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
				new Uint8Array([rgb[0], rgb[1], rgb[2], 255]));
			gl.uniform1i(gl.getUniformLocation(prog, 'u_video'), 0);

			// Identity curves ramp on unit 2, as the compositor must bind.
			const lut = new Uint8Array(256 * 4);
			for (let i = 0; i < 256; i++) {
				lut[i * 4] = lut[i * 4 + 1] = lut[i * 4 + 2] = i;
				lut[i * 4 + 3] = 255;
			}
			gl.activeTexture(gl.TEXTURE2);
			const curvesTex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, curvesTex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
			gl.uniform1i(gl.getUniformLocation(prog, 'u_curves'), 2);

			const names = ['exposure','contrast','highlights','shadows','whites','blacks',
				'temperature','tint','saturation','vibrance','vignette','grain'];
			for (const n of names) {
				const l = gl.getUniformLocation(prog, `u_${n}`);
				if (l) gl.uniform1f(l, (grade as Record<string, number>)[n] ?? 0);
			}

			gl.viewport(0, 0, 8, 8);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLES, 0, 3);

			// Centre pixel, so the vignette (radial) doesn't skew the reading.
			const px = new Uint8Array(4);
			gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			return { px: [px[0], px[1], px[2], px[3]] as number[] };
		},
		{ frag: colorGradeShader, vert: VERT, rgb, grade }
	);
}

test('a neutral grade returns the source pixel unchanged', async ({ page }) => {
	await page.goto('about:blank');
	const grey: [number, number, number] = [128, 128, 128];

	const out = await renderPixel(page, grey, {});

	expect(out.error).toBeUndefined();
	for (let i = 0; i < 3; i++) {
		expect(Math.abs(out.px![i] - grey[i]), `channel ${i} drifted: ${out.px}`).toBeLessThanOrEqual(2);
	}
});

test('a neutral grade preserves colour, not just brightness', async ({ page }) => {
	await page.goto('about:blank');
	// The vibrance bug greyed everything; a grey probe alone cannot see it.
	const orange: [number, number, number] = [200, 120, 60];

	const out = await renderPixel(page, orange, {});

	for (let i = 0; i < 3; i++) {
		expect(Math.abs(out.px![i] - orange[i]), `channel ${i} drifted: ${out.px}`).toBeLessThanOrEqual(3);
	}
});

test('contrast responds monotonically in both directions', async ({ page }) => {
	await page.goto('about:blank');

	const brightUp = await renderPixel(page, [200, 200, 200], { contrast: 0.5 });
	const brightDown = await renderPixel(page, [200, 200, 200], { contrast: -0.5 });
	const darkUp = await renderPixel(page, [60, 60, 60], { contrast: 0.5 });

	expect(brightUp.px![0]).toBeGreaterThan(200);
	expect(brightDown.px![0]).toBeLessThan(200);
	expect(darkUp.px![0]).toBeLessThan(60);
});

test('whites and blacks reach the shader at all', async ({ page }) => {
	await page.goto('about:blank');

	const withWhites = await renderPixel(page, [200, 200, 200], { whites: 1 });
	const withBlacks = await renderPixel(page, [60, 60, 60], { blacks: -1 });

	expect(withWhites.px![0]).not.toBe(200);
	expect(withBlacks.px![0]).not.toBe(60);
});

test('saturation at -1 fully desaturates, and 0 does not', async ({ page }) => {
	await page.goto('about:blank');
	const orange: [number, number, number] = [200, 120, 60];

	const grey = await renderPixel(page, orange, { saturation: -1 });
	const spread = Math.max(...grey.px!.slice(0, 3)) - Math.min(...grey.px!.slice(0, 3));

	expect(spread).toBeLessThanOrEqual(3);
});
