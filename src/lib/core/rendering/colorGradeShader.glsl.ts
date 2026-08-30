export const colorGradeShader = `#version 300 es
precision highp float;

// Input from vertex shader
in vec2 v_texCoord;
out vec4 fragColor;

// Uniforms
uniform sampler2D u_video;
uniform sampler2D u_lut;
uniform sampler2D u_curves; // 1D texture for curves (width=256, height=1)

// Color grading parameters
uniform float u_exposure;      // -10 to 10 (stops)
uniform float u_contrast;      // -1 to 1
uniform float u_highlights;    // -1 to 1
uniform float u_shadows;       // -1 to 1
uniform float u_temperature;   // -1 to 1
uniform float u_tint;          // -1 to 1
uniform float u_saturation;    // -1 to 1
uniform float u_vibrance;      // -1 to 1
uniform float u_vignette;      // 0 to 1
uniform float u_grain;         // 0 to 1

// Helper functions

// Convert temperature to Kelvin
float tempToKelvin(float temp) {
  // Map -1 to 1 to 2000K to 15000K
  return mix(2000.0, 15000.0, (temp + 1.0) * 0.5);
}

// Simple white balance using temperature and tint
vec3 whiteBalance(vec3 color, float temp, float tint) {
  float kelvin = tempToKelvin(temp);

  // Approximate black body RGB for given kelvin
  float temp = kelvin / 100.0;
  float r, g, b;

  if (temp <= 66) {
    r = 255;
    g = temp;
    g = 99.4708025861 * log(g) - 161.1195681661;
    if (temp <= 19) {
      b = 0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * log(b) - 305.0447927307;
    }
  } else {
    r = temp - 60;
    r = 329.698727446 * pow(r, -0.1332047592);
    g = temp - 60;
    g = 288.1221695283 * pow(g, -0.0755148492);
    b = 255;
  }

  vec3 whiteBalanceColor = vec3(r/255.0, g/255.0, b/255.0);

  // Apply tint (green-magenta)
  float tintAdjust = mix(0.0, 0.2, (tint + 1.0) * 0.5); // -1 to 1 -> 0 to 0.2
  vec3 tintColor = vec3(1.0 - tintAdjust, 1.0, 1.0 - tintAdjust);

  return color * whiteBalanceColor * tintColor;
}

// S-curve contrast
float contrastAdjust(float value, float contrast) {
  // S-curve: contrast in range [-1, 1]
  // 0 = no change, negative = decrease contrast, positive = increase
  return 0.5 + (value - 0.5) * (1.0 + contrast * 2.0);
}

// Vibrance (saturation that protects skin tones)
vec3 vibranceAdjust(vec3 color, float vibrance) {
  float avg = dot(color, vec3(1.0/3.0));
  float max = max(color.r, max(color.g, color.b));
  float saturation = max - avg;

  // Less saturation means more vibrance effect
  float vibranceFactor = saturate(saturation * vibrance);

  return mix(color, avg, 1.0 - vibranceFactor);
}

// Vignette effect
float vignette(vec2 texCoord, float amount) {
  vec2 center = vec2(0.5);
  float dist = distance(texCoord, center);
  float vignette = smoothstep(0.8, 0.2, dist);
  return mix(1.0, vignette, amount);
}

// Film grain
float grain(vec2 texCoord, float amount) {
  // Simple hash-based noise
  float noise = fract(sin(dot(texCoord * vec2(12.9898, 78.233), vec2(43758.5453, 12345.6789))) * 43758.5453);
  return noise * amount;
}

// RGB to HSL conversion
vec3 rgb2hsl(vec3 c) {
  vec3 K = vec3(0.0, -1.0 / 3.0, 2.0 / 3.0);
  vec3 p = mix(vec3(c.bg, c.wz), vec3(c.gb, c.xy), step(c.b, c.g));
  vec3 q = mix(vec3(p.xyw, c.r), vec3(c.r, p.yzx), step(p.x, c.r));

  float d = q.x - min(q.y, q.z);
  float e = 1.0e-10;
  float l = (q.y + q.z) * 0.5;
  float s = d / (l + e);

  return vec3(abs(q.z + (q.x - q.y) / (6.0 * d + e)), s, l);
}

// HSL to RGB conversion
vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  rgb = rgb * (1.0 - clamp(c.y, 0.0, 1.0)) + c.z;
  return rgb;
}

void main() {
  // Sample input video
  vec4 color = texture(u_video, v_texCoord);

  // Early exit for transparent pixels
  if (color.a < 0.01) {
    fragColor = vec4(0.0);
    return;
  }

  // Apply exposure
  vec3 exposed = color.rgb * pow(2.0, u_exposure);

  // Apply white balance (temperature/tint)
  vec3 balanced = whiteBalance(exposed, u_temperature, u_tint);

  // Apply contrast via S-curve
  vec3 contrasted;
  contrasted.r = contrastAdjust(balanced.r, u_contrast);
  contrasted.g = contrastAdjust(balanced.g, u_contrast);
  contrasted.b = contrastAdjust(balanced.b, u_contrast);

  // Apply highlights/shadows selective lift
  vec3 lifted = contrasted;
  lifted.r += u_highlights * (1.0 - contrasted.r) * contrasted.r; // Lift highlights
  lifted.g += u_highlights * (1.0 - contrasted.g) * contrasted.g;
  lifted.b += u_highlights * (1.0 - contrasted.b) * contrasted.b;

  lifted.r -= u_shadows * contrasted.r * (1.0 - contrasted.r); // Lift shadows
  lifted.g -= u_shadows * contrasted.g * (1.0 - contrasted.g);
  lifted.b -= u_shadows * contrasted.b * (1.0 - contrasted.b);

  // Apply saturation
  float saturation = clamp(u_saturation, -1.0, 1.0);
  float avg = dot(lifted, vec3(1.0/3.0));
  vec3 saturated = mix(vec3(avg), lifted, 1.0 + saturation);

  // Apply vibrance
  vec3 vibrant = vibranceAdjust(saturated, u_vibrance);

  // Apply curves (using 1D texture lookup)
  vec3 curved;
  curved.r = texture(u_curves, vec2(vibrant.r, 0.5)).r;
  curved.g = texture(u_curves, vec2(vibrant.g, 0.5)).g;
  curved.b = texture(u_curves, vec2(vibrant.b, 0.5)).b;

  // Apply LUT if provided
  vec3 finalColor = curved;
  if (texture(u_lut, vec2(0.0, 0.0)).r > 0.0) { // Check if LUT is valid
    // Sample LUT using RGB as coordinates
    vec3 lutCoord = vibrant.rgb;
    vec3 lutColor = texture(u_lut, lutCoord).rgb;
    // Blend between original and LUT color
    finalColor = mix(vibrant.rgb, lutColor, 0.5); // Parameter for LUT strength would go here
  }

  // Apply vignette
  float vignetteAmount = vignette(v_texCoord, u_vignette);
  finalColor *= vignetteAmount;

  // Apply grain
  float grainAmount = grain(v_texCoord, u_grain);
  finalColor += vec3(grainAmount * 0.1); // Scale grain appropriately

  // Clamp and output
  fragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}`;