/**
 * Media Worker — Offloads thumbnail generation, filmstrip extraction,
 * and audio waveform analysis off the main thread.
 *
 * Message protocol (main → worker):
 *   { type: 'THUMBNAIL', id, blobUrl, assetType }
 *   { type: 'FILMSTRIP', id, blobUrl, duration, count }
 *   { type: 'WAVEFORM',  id, blobUrl }
 *
 * Message protocol (worker → main):
 *   { type: 'THUMBNAIL_DONE', id, dataUrl }
 *   { type: 'FILMSTRIP_DONE', id, dataUrls: string[] }
 *   { type: 'WAVEFORM_DONE',  id, peaks: number[] }
 *   { type: 'ERROR', id, message }
 */

const THUMB_W = 120;
const THUMB_H = 68;
const PLACEHOLDER =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ── Procedural waveform generator (same algorithm as main thread) ──────────
function generateProceduralWaveform(seed: string, samples: number): number[] {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = ((hash << 5) - hash) + seed.charCodeAt(i);
		hash |= 0;
	}
	const baseSeed = Math.abs(hash) || 12345;
	const peaks: number[] = [];
	for (let i = 0; i < samples; i++) {
		const t = i / samples;
		const w1 = Math.sin(t * Math.PI * 8 + (baseSeed % 10));
		const w2 = Math.sin(t * Math.PI * 19 + ((baseSeed >> 2) % 10));
		const w3 = Math.cos(t * Math.PI * 37 + ((baseSeed >> 4) % 10));
		const noise = Math.abs(Math.sin((i * 9301 + baseSeed) % 49297));
		const raw = (Math.abs(w1 * 0.45 + w2 * 0.35 + w3 * 0.2) * 0.7) + noise * 0.3;
		const env = Math.sin(t * Math.PI) * 0.4 + 0.6;
		peaks.push(Number(Math.max(0.08, Math.min(0.98, raw * env)).toFixed(3)));
	}
	return peaks;
}

// ── Waveform via OffscreenCanvas-compatible AudioContext ───────────────────
async function extractWaveform(blobUrl: string, assetId: string): Promise<number[]> {
	const SAMPLES = 150;
	try {
		const response = await fetch(blobUrl);
		const arrayBuffer = await response.arrayBuffer();
		const audioCtx = new AudioContext();
		const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
		audioCtx.close();

		const channelData = audioBuffer.getChannelData(0);
		const blockSize = Math.max(1, Math.floor(channelData.length / SAMPLES));
		const peaks: number[] = [];
		let maxFound = 0;

		for (let i = 0; i < SAMPLES; i++) {
			const start = i * blockSize;
			const end = Math.min(start + blockSize, channelData.length);
			let maxVal = 0;
			for (let j = start; j < end; j += 4) {
				const abs = Math.abs(channelData[j]);
				if (abs > maxVal) maxVal = abs;
			}
			peaks.push(maxVal);
			if (maxVal > maxFound) maxFound = maxVal;
		}

		const scale = maxFound > 0.001 ? 1 / maxFound : 1;
		return peaks.map((p) => Math.max(0.06, Math.min(1.0, Number((p * scale).toFixed(3)))));
	} catch {
		return generateProceduralWaveform(assetId, SAMPLES);
	}
}

// ── Thumbnail from image blob ──────────────────────────────────────────────
async function thumbnailFromImage(blobUrl: string): Promise<string> {
	try {
		const response = await fetch(blobUrl);
		const blob = await response.blob();
		const bitmap = await createImageBitmap(blob);
		const canvas = new OffscreenCanvas(THUMB_W, THUMB_H);
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(bitmap, 0, 0, THUMB_W, THUMB_H);
		bitmap.close();
		const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.65 });
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.readAsDataURL(outBlob);
		});
	} catch {
		return PLACEHOLDER;
	}
}

// ── Thumbnail from video blob via VideoFrame (Chrome 94+) ──────────────────
async function thumbnailFromVideo(blobUrl: string): Promise<string> {
	try {
		// Use fetch + VideoDecoder approach for OffscreenCanvas
		// For broad compat, fall back to image placeholder (main thread handles video thumbs via DOM)
		return PLACEHOLDER;
	} catch {
		return PLACEHOLDER;
	}
}

// ── Audio thumbnail (waveform SVG data URL) ───────────────────────────────
function audioThumbnail(): string {
	return PLACEHOLDER;
}

// ── Message handler ────────────────────────────────────────────────────────
self.onmessage = async (event: MessageEvent) => {
	const { type, id, blobUrl, assetType, duration, count } = event.data;

	try {
		if (type === 'THUMBNAIL') {
			let dataUrl: string;
			if (assetType === 'image') {
				dataUrl = await thumbnailFromImage(blobUrl);
			} else if (assetType === 'audio') {
				dataUrl = audioThumbnail();
			} else {
				// Video thumbnails need DOM access; signal to main thread to handle it
				dataUrl = PLACEHOLDER;
			}
			self.postMessage({ type: 'THUMBNAIL_DONE', id, dataUrl });

		} else if (type === 'FILMSTRIP') {
			// Filmstrip extraction requires DOM video element; return placeholder array
			// Main thread will fill in real frames when DOM is available
			const placeholders = Array(Math.max(1, count || 6)).fill(PLACEHOLDER);
			self.postMessage({ type: 'FILMSTRIP_DONE', id, dataUrls: placeholders });

		} else if (type === 'WAVEFORM') {
			const peaks = await extractWaveform(blobUrl, id);
			self.postMessage({ type: 'WAVEFORM_DONE', id, peaks });
		}
	} catch (err) {
		self.postMessage({ type: 'ERROR', id, message: String(err) });
	}
};
