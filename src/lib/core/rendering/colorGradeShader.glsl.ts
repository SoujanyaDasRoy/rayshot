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
uniform float u_whites;        // -1 to 1
uniform float u_blacks;        // -1 to 1
uniform float u_temperature;   // -1 to 1
uniform float u_tint;          // -1 to 1
uniform float u_saturation;    // -1 to 1
uniform float u_vibrance;      // -1 to 1
uniform float u_vignette;      // 0 to 1
uniform float u_grain;         // 0 to 1

// Helper functions

// Blackbody colour for a colour temperature, as linear-ish RGB.
vec3 kelvinRGB(float kelvin) {
  float t = kelvin / 100.0;
  float r, g, b;

  if (t <= 66.0) {
    r = 255.0;
    g = 99.4708025861 * log(max(t, 1.0)) - 161.1195681661;
    b = t <= 19.0 ? 0.0 : 138.5177312231 * log(max(t - 10.0, 1.0)) - 305.0447927307;
  } else {
    r = 329.698727446 * pow(t - 60.0, -0.1332047592);
    g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
    b = 255.0;
  }

  return clamp(vec3(r, g, b) / 255.0, vec3(0.0), vec3(1.0));
}

// Map -1..1 onto 2000K..15000K with 0 anchored at the 6500K neutral point.
// It used to map 0 to 8500K, so an ungraded clip was permanently cooled.
float tempToKelvin(float temp) {
  return temp < 0.0 ? mix(2000.0, 6500.0, temp + 1.0) : mix(6500.0, 15000.0, temp);
}

// White balance, normalised so temp = 0 and tint = 0 are exactly identity.
vec3 whiteBalance(vec3 color, float temp, float tint) {
  vec3 target = kelvinRGB(tempToKelvin(temp));
  vec3 neutral = kelvinRGB(6500.0);
  vec3 balance = target / max(neutral, vec3(0.0001));

  // Green <-> magenta. Zero means zero; this previously biased by 0.1 at rest.
  float g = 1.0 - tint * 0.1;
  vec3 tintColor = vec3(1.0 + tint * 0.05, g, 1.0 + tint * 0.05);

  return color * balance * tintColor;
}

// S-curve contrast
float contrastAdjust(float value, float contrast) {
  // S-curve: contrast in range [-1, 1]
  // 0 = no change, negative = decrease contrast, positive = increase
  return 0.5 + (value - 0.5) * (1.0 + contrast * 2.0);
}

// Vibrance: saturation weighted towards already-muted colours.
vec3 vibranceAdjust(vec3 color, float vibrance) {
  float avg = dot(color, vec3(1.0/3.0));
  float mx = max(color.r, max(color.g, color.b));
  float sat = clamp((mx - avg) * 2.0, 0.0, 1.0);

  // Muted pixels move more than saturated ones. At vibrance = 0 this is
  // exactly identity — it used to collapse every pixel to its own average,
  // i.e. the shader greyed the picture at its default setting.
  float amount = vibrance * (1.0 - sat);
  return mix(vec3(avg), color, 1.0 + amount);
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

  // Whites and blacks act on the extremes rather than the mid-tones. These
  // uniforms were declared in the Clip type and written by the panel, but
  // did not exist in the shader at all.
  vec3 c2 = contrasted * contrasted;
  vec3 inv = 1.0 - contrasted;
  lifted += u_whites * c2;
  lifted -= u_blacks * inv * inv;

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

  // LUT sampling isn't wired from JS yet (u_lut is always an empty texture) — deferred, not a P0 concern
  vec3 finalColor = curved;

  // Apply vignette
  float vignetteAmount = vignette(v_texCoord, u_vignette);
  finalColor *= vignetteAmount;

  // Apply grain
  float grainAmount = grain(v_texCoord, u_grain);
  finalColor += vec3(grainAmount * 0.1); // Scale grain appropriately

  // Clamp and output
  fragColor = vec4(clamp(finalColor, 0.0, 1.0), color.a);
}`;