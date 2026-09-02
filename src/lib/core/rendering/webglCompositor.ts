import { colorGradeShader } from './colorGradeShader.glsl.ts';
import type { ShaderUniforms } from './colorGradeUniforms';

export class WebGLCompositor {
  private canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private texture!: WebGLTexture;
  private width: number;
  private height: number;

  constructor(width: number = 1920, height: number = 1080) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);
    this.gl = this.canvas.getContext('webgl2') as WebGL2RenderingContext;

    if (!this.gl) {
      throw new Error('WebGL2 not supported');
    }

    this.initGL();
    this.initShaders();
    this.initBuffers();
  }

  private initGL(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, this.width, this.height);
  }

  private initShaders(): void {
    const gl = this.gl;
    const vertexShaderSource = `
      #version 300 es
      in vec2 position;
      in vec2 texCoord;
      out vec2 v_texCoord;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        v_texCoord = texCoord;
      }
    `;

    const fragmentShaderSource = colorGradeShader;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Could not initialize shader program: ${gl.getProgramInfoLog(this.program)}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }

  private compileShader(type: GLenum, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  private initBuffers(): void {
    const gl = this.gl;
    // Create VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Create buffer for quad vertices (positions and texcoords)
    const vertices = new Float32Array([
      // Position      // TexCoord
      -1.0,  -1.0,   0.0, 0.0,
       1.0,  -1.0,   1.0, 0.0,
      -1.0,   1.0,   0.0, 1.0,
       1.0,   1.0,   1.0, 1.0,
    ]);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Position attribute
    const positionLoc = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);

    // TexCoord attribute
    const texCoordLoc = gl.getAttribLocation(this.program, 'texCoord');
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);

    // Create texture for video
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindVertexArray(null);
  }

  public renderFrame(videoEl: HTMLVideoElement, colorGrade: ShaderUniforms): void {
    const gl = this.gl;

    // Update video texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);

    // Clear and render
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set uniforms
    const uVideoLoc = gl.getUniformLocation(this.program, 'u_video');
    gl.uniform1i(uVideoLoc, 0);

    const uLutLoc = gl.getUniformLocation(this.program, 'u_lut');
    gl.uniform1i(uLutLoc, 1); // Texture unit 1

    const uCurvesLoc = gl.getUniformLocation(this.program, 'u_curves');
    gl.uniform1i(uCurvesLoc, 2); // Texture unit 2

    // Color grading parameters
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_exposure'), colorGrade.exposure);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_contrast'), colorGrade.contrast);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_highlights'), colorGrade.highlights);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_shadows'), colorGrade.shadows);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_temperature'), colorGrade.temperature);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_tint'), colorGrade.tint);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_saturation'), colorGrade.saturation);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_vibrance'), colorGrade.vibrance);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_vignette'), colorGrade.vignette);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_grain'), colorGrade.grain);

    // For curves and LUT textures, we would need to create and bind them
    // For now, we'll use default values (empty textures)
    // In a full implementation, these would be properly initialized

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Cleanup
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  public getCanvas(): OffscreenCanvas {
    return this.canvas;
  }

  public destroy(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
  }
}