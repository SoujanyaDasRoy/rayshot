import { projectStore } from '$lib/stores/project.svelte';
import { timelineStore } from '$lib/stores/timeline.svelte';
import { commandProcessor } from '$lib/core/commands/processor';
import { AddClipCommand } from '$lib/core/commands/addClip';
import { get } from 'svelte/store';
import type { MediaAsset, Project } from '$lib/types/project';
import {
	persistAsset,
	persistThumbnail,
	persistWaveform,
	loadAllThumbnails,
	loadAllWaveforms
} from '../core/persistence/assetCache';

export const placeholderThumbnail =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Global thumbnail caches across sessions/components
export const thumbnailCache = new Map<string, string>();
export const multiThumbnailCache = new Map<string, string[]>();

/**
 * Procedural waveform generator for fallback & instant rendering
 * Generates natural-looking audio envelope peaks in range [0.05, 1.0]
 */
export function generateProceduralWaveform(seed: string | number = 'audio-waveform', samples: number = 100): number[] {
	let hash = 0;
	const seedStr = String(seed);
	for (let i = 0; i < seedStr.length; i++) {
		hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
		hash |= 0;
	}

	const peaks: number[] = [];
	const baseSeed = Math.abs(hash) || 12345;

	for (let i = 0; i < samples; i++) {
		const t = i / samples;
		// Combine harmonic frequencies + pseudo-random envelope modulation
		const wave1 = Math.sin(t * Math.PI * 8 + (baseSeed % 10));
		const wave2 = Math.sin(t * Math.PI * 19 + ((baseSeed >> 2) % 10));
		const wave3 = Math.cos(t * Math.PI * 37 + ((baseSeed >> 4) % 10));
		const noise = Math.abs(Math.sin((i * 9301 + baseSeed) % 49297));

		const rawAmplitude = (Math.abs(wave1 * 0.45 + wave2 * 0.35 + wave3 * 0.2) * 0.7) + (noise * 0.3);
		// Apply dynamic envelope curve (taper at ends, natural audio swell)
		const envelope = Math.sin(t * Math.PI) * 0.4 + 0.6;
		const peak = Math.max(0.08, Math.min(0.98, rawAmplitude * envelope));
		peaks.push(Number(peak.toFixed(3)));
	}

	return peaks;
}

/**
 * Extract audio waveform peaks using Web Audio API decodeAudioData with procedural fallback
 */
export async function extractAudioWaveform(
	source: Blob | File | ArrayBuffer,
	assetId?: string,
	samples: number = 150
): Promise<number[]> {
	if (assetId) {
		const currentStore = get(timelineStore);
		if (currentStore && currentStore.waveformCache && currentStore.waveformCache.has(assetId)) {
			const cached = currentStore.waveformCache.get(assetId)!;
			if (cached && cached.length > 0) return cached;
		}
	}

	// In browser environment with Web Audio API support
	if (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) {
		try {
			const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			const audioCtx = new AudioContextClass();

			let arrayBuffer: ArrayBuffer;
			if (source instanceof ArrayBuffer) {
				arrayBuffer = source;
			} else if (source instanceof Blob) {
				arrayBuffer = await source.arrayBuffer();
			} else {
				throw new Error('Unsupported audio source format');
			}

			const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
			const channelData = audioBuffer.getChannelData(0);
			const totalLength = channelData.length;
			const blockSize = Math.max(1, Math.floor(totalLength / samples));
			const peaks: number[] = [];

			let maxFound = 0;
			for (let i = 0; i < samples; i++) {
				const start = i * blockSize;
				const end = Math.min(start + blockSize, totalLength);
				let maxVal = 0;
				for (let j = start; j < end; j += 4) { // stride by 4 for high-speed peak detection
					const abs = Math.abs(channelData[j]);
					if (abs > maxVal) maxVal = abs;
				}
				peaks.push(maxVal);
				if (maxVal > maxFound) maxFound = maxVal;
			}

			// Close audio context cleanly
			audioCtx.close().catch(() => {});

			// Normalize peaks
			const scale = maxFound > 0.001 ? 1 / maxFound : 1;
			const normalizedPeaks = peaks.map((p) => Math.max(0.06, Math.min(1.0, Number((p * scale).toFixed(3)))));

			if (assetId) {
				timelineStore.update((state) => {
					state.waveformCache.set(assetId, normalizedPeaks);
					return state;
				});
			}

			return normalizedPeaks;
		} catch {
			// Fall through to procedural fallback
		}
	}

	// Fallback for tests, unsupported codecs, or Node environment
	const fallbackPeaks = generateProceduralWaveform(assetId ?? 'audio-fallback', samples);
	if (assetId) {
		timelineStore.update((state) => {
			state.waveformCache.set(assetId, fallbackPeaks);
			return state;
		});
	}
	return fallbackPeaks;
}

/**
 * Extract multi-frame video thumbnails for filmstrips
 */
export async function extractVideoThumbnails(
	fileOrBlob: Blob,
	assetId: string,
	duration: number,
	count: number = 6
): Promise<string[]> {
	if (multiThumbnailCache.has(assetId)) {
		const cached = multiThumbnailCache.get(assetId)!;
		if (cached.length >= count) return cached;
	}

	if (typeof window === 'undefined' || typeof document === 'undefined') {
		const single = thumbnailCache.get(assetId) ?? placeholderThumbnail;
		const fallbackList = Array(count).fill(single);
		multiThumbnailCache.set(assetId, fallbackList);
		return fallbackList;
	}

	return new Promise((resolve) => {
		const url = URL.createObjectURL(fileOrBlob);
		const video = document.createElement('video');
		video.preload = 'auto';
		video.muted = true;
		video.playsInline = true;

		const thumbs: string[] = [];
		let currentIndex = 0;
		const validCount = Math.max(1, count);

		const timeoutId = setTimeout(() => {
			URL.revokeObjectURL(url);
			const fallbackThumb = thumbnailCache.get(assetId) ?? placeholderThumbnail;
			const filled = thumbs.length > 0 ? thumbs : Array(validCount).fill(fallbackThumb);
			multiThumbnailCache.set(assetId, filled);
			resolve(filled);
		}, 4000);

		const canvas = document.createElement('canvas');
		canvas.width = 120;
		canvas.height = 68;
		const ctx = canvas.getContext('2d');

		function captureNextFrame() {
			if (currentIndex >= validCount) {
				clearTimeout(timeoutId);
				URL.revokeObjectURL(url);
				multiThumbnailCache.set(assetId, thumbs);
				if (!thumbnailCache.has(assetId) && thumbs.length > 0) {
					thumbnailCache.set(assetId, thumbs[0]);
				}
				resolve(thumbs);
				return;
			}

			const targetTime = Math.max(0.1, Math.min(duration - 0.1, ((currentIndex + 0.5) / validCount) * duration));
			video.currentTime = targetTime;
		}

		video.onloadedmetadata = () => {
			captureNextFrame();
		};

		video.onseeked = () => {
			if (ctx) {
				try {
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
					thumbs.push(dataUrl);
				} catch {
					thumbs.push(placeholderThumbnail);
				}
			} else {
				thumbs.push(placeholderThumbnail);
			}
			currentIndex++;
			captureNextFrame();
		};

		video.onerror = () => {
			clearTimeout(timeoutId);
			URL.revokeObjectURL(url);
			const fallbackThumb = thumbnailCache.get(assetId) ?? placeholderThumbnail;
			const filled = Array(validCount).fill(fallbackThumb);
			multiThumbnailCache.set(assetId, filled);
			resolve(filled);
		};

		video.src = url;
	});
}

/**
 * Generate a thumbnail from a file (video, audio, image)
 */
export async function createThumbnailFromFile(file: File): Promise<string> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);

		if (file.type.startsWith('audio/')) {
			URL.revokeObjectURL(url);
			resolve(generateAudioThumbnail());
			return;
		}

		const isImage = file.type.startsWith('image/');
		const mediaElement: HTMLVideoElement | HTMLImageElement = isImage
			? new Image()
			: document.createElement('video');

		const timeoutId = setTimeout(() => {
			URL.revokeObjectURL(url);
			resolve(placeholderThumbnail);
		}, 2500);

		const cleanupAndDraw = (source: CanvasImageSource) => {
			clearTimeout(timeoutId);
			const canvas = document.createElement('canvas');
			const width = 160;
			const height = 100;
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				URL.revokeObjectURL(url);
				resolve(placeholderThumbnail);
				return;
			}
			ctx.fillStyle = '#1e1f2b';
			ctx.fillRect(0, 0, width, height);
			try {
				ctx.drawImage(source, 0, 0, width, height);
				const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
				URL.revokeObjectURL(url);
				resolve(dataUrl);
			} catch {
				URL.revokeObjectURL(url);
				resolve(placeholderThumbnail);
			}
		};

		if (isImage) {
			const img = mediaElement as HTMLImageElement;
			img.onload = () => cleanupAndDraw(img);
			img.onerror = () => {
				clearTimeout(timeoutId);
				URL.revokeObjectURL(url);
				resolve(placeholderThumbnail);
			};
			img.src = url;
		} else {
			const video = mediaElement as HTMLVideoElement;
			video.preload = 'metadata';
			video.muted = true;
			video.playsInline = true;

			video.onloadedmetadata = () => {
				video.currentTime = Math.min(video.duration * 0.1, 1);
			};

			video.onseeked = () => cleanupAndDraw(video);

			video.onerror = () => {
				clearTimeout(timeoutId);
				URL.revokeObjectURL(url);
				resolve(placeholderThumbnail);
			};

			video.src = url;
		}
	});
}

function generateAudioThumbnail(): string {
	if (typeof document === 'undefined') return placeholderThumbnail;
	const canvas = document.createElement('canvas');
	const width = 160;
	const height = 100;
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return placeholderThumbnail;
	ctx.fillStyle = '#0e241d';
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = '#10b981';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(0, height / 2);
	for (let x = 0; x <= width; x += 8) {
		const y = height / 2 + Math.sin(x * 0.2) * (height * 0.35);
		ctx.lineTo(x, y);
	}
	ctx.stroke();
	return canvas.toDataURL('image/png');
}

/**
 * Get media duration safely with a fallback timeout
 */
export async function getFileDuration(file: File): Promise<number> {
	if (file.type.startsWith('image/')) return 5.0; // standard image duration in seconds

	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const isAudio = file.type.startsWith('audio/');
		const mediaElement: HTMLMediaElement = isAudio ? new Audio() : document.createElement('video');

		const timeoutId = setTimeout(() => {
			URL.revokeObjectURL(url);
			resolve(5.0); // fallback 5s
		}, 2000);

		mediaElement.preload = 'metadata';

		mediaElement.onloadedmetadata = () => {
			clearTimeout(timeoutId);
			const dur = mediaElement.duration && !isNaN(mediaElement.duration) && mediaElement.duration > 0
				? mediaElement.duration
				: 5.0;
			URL.revokeObjectURL(url);
			resolve(dur);
		};

		mediaElement.onerror = () => {
			clearTimeout(timeoutId);
			URL.revokeObjectURL(url);
			resolve(5.0);
		};

		mediaElement.src = url;
	});
}

/**
 * Main import workflow for one or more files
 */
export async function importMediaFiles(files: File[], autoPlaceOnTimeline: boolean = true) {
	if (!files || files.length === 0) return;

	for (const file of files) {
		let type: 'video' | 'audio' | 'image' = 'video';
		if (file.type.startsWith('audio/')) type = 'audio';
		else if (file.type.startsWith('image/')) type = 'image';

		const duration = await getFileDuration(file);
		const mediaAssetId = crypto.randomUUID();

		const mediaAsset: MediaAsset = {
			id: mediaAssetId,
			filename: file.name,
			sourceBlob: file,
			type,
			duration,
			createdAt: Date.now(),
			modifiedAt: Date.now()
		};

		// 1. Add Asset to Project Store
		projectStore.update((project) => {
			if (!project) return project;
			const assetsMap = new Map(project.assets);
			assetsMap.set(mediaAssetId, mediaAsset);
			return {
				...project,
				assets: assetsMap,
				modifiedAt: Date.now()
			};
		});

		// 2. Generate thumbnail, waveform, and multi-thumbnails (non-blocking)
		// Thumbnail — main thread DOM (video requires <video> element)
		createThumbnailFromFile(file).then(async (thumb) => {
			thumbnailCache.set(mediaAssetId, thumb);
			// Persist to IDB in background
			persistThumbnail(mediaAssetId, thumb).catch(() => {});
		});

		if (type === 'audio' || type === 'video') {
			// Waveform extraction — offloaded: try Worker first, fall back to main thread
			(async () => {
				try {
					const { getMediaWorker } = await import('./mediaWorkerManager');
					const worker = getMediaWorker();
					if (worker) {
						const blobUrl = URL.createObjectURL(file);
						const peaks = await worker.extractWaveform(mediaAssetId, blobUrl);
						URL.revokeObjectURL(blobUrl);
						timelineStore.update((state) => {
							state.waveformCache.set(mediaAssetId, peaks);
							return state;
						});
						persistWaveform(mediaAssetId, peaks).catch(() => {});
					} else {
						// Fallback: main thread
						extractAudioWaveform(file, mediaAssetId).then((peaks) => {
							persistWaveform(mediaAssetId, peaks).catch(() => {});
						});
					}
				} catch {
					extractAudioWaveform(file, mediaAssetId).then((peaks) => {
						persistWaveform(mediaAssetId, peaks).catch(() => {});
					});
				}
			})();
		}

		if (type === 'video') {
			extractVideoThumbnails(file, mediaAssetId, duration, 6);
		}

		// Persist asset blob + metadata to IDB (enables cross-refresh restore)
		persistAsset({
			id: mediaAssetId,
			filename: file.name,
			blob: file,
			type,
			duration,
			mimeType: file.type || `${type}/*`,
			createdAt: Date.now()
		}).catch(() => {}); // Non-fatal

		// 3. Auto-place clip on timeline if requested or if timeline has space
		if (autoPlaceOnTimeline) {
			const project = get(projectStore);
			if (project && project.activeSequenceId) {
				const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
				if (sequence) {
					// Find target track (matching type or first available)
					let targetTrack = sequence.tracks.find((t) => t.type === (type === 'audio' ? 'audio' : 'video'));
					if (!targetTrack && sequence.tracks.length > 0) {
						targetTrack = sequence.tracks[0];
					}

					if (targetTrack) {
						// Calculate end position of current track
						let endPosition = 0;
						for (const cId of targetTrack.clipInstances) {
							const c = project.clips.get(cId);
							if (c) {
								const clipEnd = c.timelineStart + c.timelineDuration;
								if (clipEnd > endPosition) endPosition = clipEnd;
							}
						}

						const addClipCmd = new AddClipCommand({
							mediaAssetId,
							trackId: targetTrack.id,
							position: endPosition
						});
						commandProcessor.execute(addClipCmd);
					}
				}
			}
		}
	}
}

/**
 * Restore thumbnails and waveforms from IDB into in-memory caches on app startup.
 * Call once in the root layout / +page.svelte onMount.
 */
export async function restoreCachedAssets(): Promise<void> {
	try {
		const [thumbMap, waveMap] = await Promise.all([loadAllThumbnails(), loadAllWaveforms()]);

		// Restore thumbnails
		thumbMap.forEach((dataUrl, id) => {
			if (!thumbnailCache.has(id)) {
				thumbnailCache.set(id, dataUrl);
			}
		});

		// Restore waveforms into timeline store
		if (waveMap.size > 0) {
			timelineStore.update((state) => {
				waveMap.forEach((peaks, id) => {
					if (!state.waveformCache.has(id)) {
						state.waveformCache.set(id, peaks);
					}
				});
				return state;
			});
		}
	} catch {
		// Non-fatal — caches will be regenerated on demand
	}
}
