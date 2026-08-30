import { colorGradeShader } from '../colorGradeShader.glsl.ts';
import { describe, test, expect } from 'vitest';

describe('colorGradeShader', () => {
  test('should be a non-empty string', () => {
    expect(typeof colorGradeShader).toBe('string');
    expect(colorGradeShader.length).toBeGreaterThan(0);
  });
});