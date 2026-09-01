import { expect, test } from '@playwright/test';
import { colorGradeShader } from '../colorGradeShader.glsl.ts';

test('colorGradeShader fragment shader actually compiles in WebGL2', async ({ page }) => {
	await page.goto('about:blank');

	const result = await page.evaluate((source) => {
		const canvas = new OffscreenCanvas(4, 4);
		const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
		const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
		return { ok, log: gl.getShaderInfoLog(shader) ?? '' };
	}, colorGradeShader);

	expect(result.ok, result.log).toBe(true);
});
