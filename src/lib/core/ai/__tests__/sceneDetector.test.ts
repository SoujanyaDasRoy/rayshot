import { describe, it, expect } from 'vitest';
import { calculateFrameDifference } from '../sceneDetector';

describe('SceneDetector', () => {
	it('calculates zero difference for identical frames', () => {
		// Mock ImageData (4x4 pixels, 64 bytes)
		const dataA = new Uint8ClampedArray(64).fill(128);
		const dataB = new Uint8ClampedArray(64).fill(128);
		const imgA = { data: dataA, width: 4, height: 4, colorSpace: 'srgb' as PredefinedColorSpace };
		const imgB = { data: dataB, width: 4, height: 4, colorSpace: 'srgb' as PredefinedColorSpace };

		const diff = calculateFrameDifference(imgA, imgB);
		expect(diff).toBe(0);
	});

	it('calculates maximum difference between black and white frames', () => {
		const dataBlack = new Uint8ClampedArray(64).fill(0);
		const dataWhite = new Uint8ClampedArray(64).fill(255);
		const imgBlack = { data: dataBlack, width: 4, height: 4, colorSpace: 'srgb' as PredefinedColorSpace };
		const imgWhite = { data: dataWhite, width: 4, height: 4, colorSpace: 'srgb' as PredefinedColorSpace };

		const diff = calculateFrameDifference(imgBlack, imgWhite);
		expect(diff).toBeCloseTo(1.0, 1);
	});
});
