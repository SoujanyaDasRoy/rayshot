import { describe, it, expect } from 'vitest';
import { detectSilenceFromPeaks } from '../silenceDetector';

describe('SilenceDetector', () => {
	it('detects no silence when all peaks are high', () => {
		const highPeaks = Array(100).fill(0.8);
		const result = detectSilenceFromPeaks(highPeaks, 10.0);
		expect(result).toHaveLength(0);
	});

	it('detects a silence segment in the middle of audio', () => {
		// 10s audio, 100 samples -> 0.1s per sample
		// Samples 0-30: 0.5 (speech 0s - 3s)
		// Samples 30-70: 0.01 (silence 3s - 7s = 4s)
		// Samples 70-100: 0.5 (speech 7s - 10s)
		const peaks = [
			...Array(30).fill(0.5),
			...Array(40).fill(0.01),
			...Array(30).fill(0.5)
		];
		const result = detectSilenceFromPeaks(peaks, 10.0, { threshold: 0.08, minDurationSeconds: 1.0 });
		expect(result.length).toBeGreaterThan(0);
		expect(result[0].start).toBeGreaterThanOrEqual(2.9);
		expect(result[0].end).toBeLessThanOrEqual(7.1);
		expect(result[0].duration).toBeGreaterThan(3.0);
	});

	it('handles empty peaks array gracefully', () => {
		expect(detectSilenceFromPeaks([], 0)).toEqual([]);
		expect(detectSilenceFromPeaks([], 10)).toEqual([]);
	});
});
