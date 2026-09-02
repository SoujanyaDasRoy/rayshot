import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGLCompositor } from '../webglCompositor';
import { DEFAULT_COLOR_GRADE, toShaderUniforms } from '../colorGradeUniforms';

/**
 * The previous version of this file asserted only that a writable store
 * echoed the object handed to it, which proved nothing about rendering.
 * These assert the uniform values that actually reach the GPU.
 */

/** Records every uniform1f(name, value) so tests can assert on them. */
function makeMockGl() {
	const uniforms: Record<string, number> = {};
	let nextLoc = 0;
	const locNames = new Map<number, string>();

	const gl: Record<string, unknown> = {
		TEXTURE_2D: 1, RGBA: 2, UNSIGNED_BYTE: 3, COLOR_BUFFER_BIT: 4, TRIANGLE_STRIP: 5,
		clearColor: vi.fn(), enable: vi.fn(), blendFunc: vi.fn(), viewport: vi.fn(),
		createShader: vi.fn(() => ({})), shaderSource: vi.fn(), compileShader: vi.fn(),
		getShaderParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(() => ''),
		createProgram: vi.fn(() => ({})), attachShader: vi.fn(), linkProgram: vi.fn(),
		getProgramParameter: vi.fn(() => true), getProgramInfoLog: vi.fn(() => ''),
		deleteShader: vi.fn(), getAttribLocation: vi.fn(() => 0),
		enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(),
		createBuffer: vi.fn(() => ({})), bindBuffer: vi.fn(), bufferData: vi.fn(),
		createTexture: vi.fn(() => ({})), bindTexture: vi.fn(), texParameteri: vi.fn(),
		texImage2D: vi.fn(), clear: vi.fn(), useProgram: vi.fn(),
		createVertexArray: vi.fn(() => ({})), bindVertexArray: vi.fn(),
		drawArrays: vi.fn(), deleteProgram: vi.fn(), deleteTexture: vi.fn(),
		deleteVertexArray: vi.fn(), activeTexture: vi.fn(),
		getUniformLocation: vi.fn((_p: unknown, name: string) => {
			const loc = nextLoc++;
			locNames.set(loc, name);
			return loc;
		}),
		uniform1i: vi.fn(),
		uniform1f: vi.fn((loc: number, value: number) => {
			uniforms[locNames.get(loc) ?? String(loc)] = value;
		})
	};

	return { gl, uniforms };
}

let mock: ReturnType<typeof makeMockGl>;

beforeEach(() => {
	mock = makeMockGl();
	// @ts-expect-error - mocking the global
	global.OffscreenCanvas = class {
		width: number;
		height: number;
		constructor(width: number, height: number) {
			this.width = width;
			this.height = height;
		}
		getContext() {
			return mock.gl;
		}
	};
});

afterEach(() => {
	// @ts-expect-error - cleanup
	delete global.OffscreenCanvas;
	vi.restoreAllMocks();
});

const fakeVideo = {} as HTMLVideoElement;

describe('WebGLCompositor', () => {
	test('constructs at the requested size', () => {
		const c = new WebGLCompositor(1280, 720);

		expect(c).toBeInstanceOf(WebGLCompositor);
	});

	test('a neutral grade sends all-zero uniforms to the shader', () => {
		// Guards the bug this work exists to fix: Canvas used to send
		// contrast: -1.0 for an ungraded clip.
		const c = new WebGLCompositor(64, 64);

		c.renderFrame(fakeVideo, toShaderUniforms(DEFAULT_COLOR_GRADE));

		expect(mock.uniforms.u_contrast).toBe(0);
		expect(mock.uniforms.u_saturation).toBe(0);
		expect(mock.uniforms.u_exposure).toBe(0);
		expect(mock.uniforms.u_temperature).toBe(0);
	});

	test('slider values arrive at the shader already converted to -1..1', () => {
		const c = new WebGLCompositor(64, 64);

		c.renderFrame(
			fakeVideo,
			toShaderUniforms({ ...DEFAULT_COLOR_GRADE, contrast: 100, saturation: -50 })
		);

		expect(mock.uniforms.u_contrast).toBe(1);
		expect(mock.uniforms.u_saturation).toBe(-0.5);
	});

	test('actually draws', () => {
		const c = new WebGLCompositor(64, 64);

		c.renderFrame(fakeVideo, toShaderUniforms(DEFAULT_COLOR_GRADE));

		expect(mock.gl.drawArrays).toHaveBeenCalled();
	});
});
