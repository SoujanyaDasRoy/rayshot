/**
 * Media Worker Singleton — manages the mediaWorker lifecycle and
 * provides a clean Promise-based API for the main thread.
 */

import MediaWorker from '$workers/mediaWorker?worker';

type WorkerCallback = (result: unknown) => void;

class MediaWorkerManager {
	private worker: Worker | null = null;
	private pending = new Map<string, WorkerCallback>();

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new MediaWorker();
			this.worker.onmessage = (e: MessageEvent) => {
				const { type, id, ...rest } = e.data;
				const cb = this.pending.get(`${type}:${id}`);
				if (cb) {
					this.pending.delete(`${type}:${id}`);
					cb(rest);
				}
			};
			this.worker.onerror = (err) => {
				console.error('[MediaWorker] error:', err);
			};
		}
		return this.worker;
	}

	private post<T>(msgType: string, doneType: string, id: string, extra: Record<string, unknown>): Promise<T> {
		return new Promise((resolve) => {
			this.pending.set(`${doneType}:${id}`, (result) => resolve(result as T));
			this.getWorker().postMessage({ type: msgType, id, ...extra });
		});
	}

	async extractWaveform(id: string, blobUrl: string): Promise<number[]> {
		const result = await this.post<{ peaks: number[] }>('WAVEFORM', 'WAVEFORM_DONE', id, { blobUrl });
		return result.peaks;
	}

	async extractThumbnail(id: string, blobUrl: string, assetType: string): Promise<string> {
		const result = await this.post<{ dataUrl: string }>('THUMBNAIL', 'THUMBNAIL_DONE', id, { blobUrl, assetType });
		return result.dataUrl;
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
		this.pending.clear();
	}
}

// Singleton — only available client-side
let _instance: MediaWorkerManager | null = null;
export function getMediaWorker(): MediaWorkerManager | null {
	if (typeof window === 'undefined') return null;
	if (!_instance) _instance = new MediaWorkerManager();
	return _instance;
}
