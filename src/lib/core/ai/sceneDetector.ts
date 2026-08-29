/**
 * Scene Detection Engine
 * Analyzes video frame differences to detect cut points, shot transitions,
 * and visual changes for automatic split suggestions.
 */

export interface SceneCut {
	timestamp: number; // in seconds
	confidence: number; // 0.0 to 1.0
}

export interface SceneDetectionOptions {
	/** Minimum difference between consecutive frames to consider a cut [0.0 - 1.0]. Default: 0.35 */
	sensitivity?: number;
	/** Minimum duration in seconds between consecutive detected cuts. Default: 1.0s */
	minSceneDuration?: number;
	/** Number of frames per second to sample. Default: 2 fps */
	sampleFps?: number;
}

/**
 * Calculate grayscale difference between two ImageData buffers
 */
export function calculateFrameDifference(a: ImageData, b: ImageData): number {
	const dataA = a.data;
	const dataB = b.data;
	const length = dataA.length;
	let totalDiff = 0;
	let sampleCount = 0;

	// Stride by 8 (every 2nd pixel) for speed
	for (let i = 0; i < length; i += 8) {
		// Luminance: 0.299 R + 0.587 G + 0.114 B
		const lumA = 0.299 * dataA[i] + 0.587 * dataA[i + 1] + 0.114 * dataA[i + 2];
		const lumB = 0.299 * dataB[i] + 0.587 * dataB[i + 1] + 0.114 * dataB[i + 2];
		totalDiff += Math.abs(lumA - lumB);
		sampleCount++;
	}

	return sampleCount > 0 ? totalDiff / (sampleCount * 255) : 0;
}

/**
 * Detect scene cuts in a video file / blob using OffscreenCanvas / HTML5 Video
 */
export async function detectSceneCuts(
	source: Blob,
	duration: number,
	options: SceneDetectionOptions = {}
): Promise<SceneCut[]> {
	if (!source || duration <= 0) return [];

	const sensitivity = options.sensitivity ?? 0.32;
	const minDuration = options.minSceneDuration ?? 1.0;
	const sampleFps = options.sampleFps ?? 2;

	// In browser with DOM / Video support
	if (typeof window !== 'undefined' && typeof document !== 'undefined') {
		return new Promise((resolve) => {
			const video = document.createElement('video');
			const url = URL.createObjectURL(source);
			video.muted = true;
			video.playsInline = true;
			video.preload = 'auto';

			const cuts: SceneCut[] = [];
			const canvas = document.createElement('canvas');
			canvas.width = 64; // Low-res thumbnail for high-speed analysis
			canvas.height = 36;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });

			if (!ctx) {
				URL.revokeObjectURL(url);
				resolve([]);
				return;
			}

			const step = 1 / sampleFps;
			let currentTime = 0;
			let lastCutTime = -minDuration;
			let prevFrameData: ImageData | null = null;

			const timeoutId = setTimeout(() => {
				URL.revokeObjectURL(url);
				resolve(cuts);
			}, 10000); // 10s max analysis timeout

			function analyzeNext() {
				if (currentTime >= duration) {
					clearTimeout(timeoutId);
					URL.revokeObjectURL(url);
					resolve(cuts);
					return;
				}
				video.currentTime = currentTime;
			}

			video.onloadedmetadata = () => {
				analyzeNext();
			};

			video.onseeked = () => {
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height);

				if (prevFrameData) {
					const diff = calculateFrameDifference(prevFrameData, currentFrameData);
					if (diff >= sensitivity && currentTime - lastCutTime >= minDuration) {
						cuts.push({
							timestamp: Number(currentTime.toFixed(2)),
							confidence: Number(Math.min(1.0, diff / 0.8).toFixed(2))
						});
						lastCutTime = currentTime;
					}
				}

				prevFrameData = currentFrameData;
				currentTime += step;
				analyzeNext();
			};

			video.onerror = () => {
				clearTimeout(timeoutId);
				URL.revokeObjectURL(url);
				resolve(cuts);
			};

			video.src = url;
		});
	}

	// Fallback for non-browser/test environments
	return [];
}

