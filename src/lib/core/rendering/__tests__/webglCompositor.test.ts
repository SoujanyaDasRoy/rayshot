import type { ColorGrade } from '../webglCompositor';
import { WebGLCompositor } from '../webglCompositor';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock OffscreenCanvas and WebGL2RenderingContext
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: () => mockGL,
} as any;

const mockGL = {
  clearColor: () => {},
  enable: () => {},
  blendFunc: () => {},
  viewport: () => {},
  createShader: () => mockShader,
  shaderSource: () => {},
  compileShader: () => {},
  getShaderParameter: () => true,
  getShaderInfoLog: () => '',
  createProgram: () => mockProgram,
  attachShader: () => {},
  linkProgram: () => {},
  getProgramParameter: () => true,
  getProgramInfoLog: () => '',
  deleteShader: () => {},
  getAttribLocation: () => 0,
  enableVertexAttribArray: () => {},
  vertexAttribPointer: () => {},
  createBuffer: () => {},
  bindBuffer: () => {},
  bufferData: () => {},
  createTexture: () => ({}),
  bindTexture: () => {},
  texParameteri: () => {},
  texImage2D: () => {},
  clear: () => {},
  useProgram: () => {},
  getUniformLocation: () => 0,
  uniform1i: () => {},
  uniform1f: () => {},
  drawArrays: () => {},
  bindVertexArray: () => {},
  createVertexArray: () => ({}),
  deleteProgram: () => {},
  deleteTexture: () => {},
  deleteVertexArray: () => {},
} as any;

const mockShader = {} as WebGLShader;
const mockProgram = {} as WebGLProgram;

// Mock the canvas.getContext to return our mockGL
Object.defineProperty(mockCanvas, 'getContext', {
  value: () => mockGL,
  writable: true,
});

describe('WebGLCompositor', () => {
  let compositor: WebGLCompositor;

  beforeEach(() => {
    // @ts-expect-error - we are mocking the global OffscreenCanvas
    global.OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return mockGL;
      }
    };
  });

  afterEach(() => {
    // @ts-expect-error - cleaning up
    delete global.OffscreenCanvas;
  });

  test('should initialize with default values', () => {
    compositor = new WebGLCompositor(1920, 1080);
    expect(compositor).toBeInstanceOf(WebGLCompositor);
    // Check that the colorGradeStore is writable and has initial values
    // We can subscribe to the store to check its value
    let currentValue: ColorGrade | null = null;
    const unsub = compositor.colorGradeStore.subscribe((value) => {
      currentValue = value;
    });
    expect(currentValue).toEqual({
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      temperature: 0,
      tint: 0,
      saturation: 0,
      vibrance: 0,
      vignette: 0,
      grain: 0,
      curves: [[0, 0], [0.5, 0.5], [1, 1]],
      lutTexture: null,
    });
    unsub();
  });

  test('should update color grade store when renderFrame is called', () => {
    compositor = new WebGLCompositor(1920, 1080);
    const newGrade: ColorGrade = {
      exposure: 1.0,
      contrast: 0.5,
      highlights: 0.2,
      shadows: -0.2,
      temperature: 0.1,
      tint: 0.0,
      saturation: 0.1,
      vibrance: 0.0,
      vignette: 0.2,
      grain: 0.1,
      curves: [[0, 0], [0.5, 0.5], [1, 1]],
      lutTexture: null,
    };
    // We don't have a real video element, but we can call renderFrame and check the store
    // @ts-expect-error - we are passing a mock video element
    compositor.renderFrame({}, newGrade);
    let currentValue: ColorGrade | null = null;
    const unsub = compositor.colorGradeStore.subscribe((value) => {
      currentValue = value;
    });
    // Note: the renderFrame method sets the store, so we expect the newGrade
    expect(currentValue).toEqual(newGrade);
    unsub();
  });
});