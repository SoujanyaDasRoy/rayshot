/**
 * Asset Cache — IndexedDB-backed persistence for media blobs, thumbnails, and waveforms.
 * Extends the existing RayShotDB with additional object stores.
 *
 * Object stores:
 *   rayshot_assets      — { id, blob, filename, type, duration, mimeType, createdAt }
 *   rayshot_thumbnails  — { id, dataUrl }
 *   rayshot_waveforms   — { id, peaks: number[] }
 */

const DB_NAME = 'RayShotDB';
const DB_VERSION = 2; // Bump from 1 to add new stores
const STORE_ASSETS = 'rayshot_assets';
const STORE_THUMBNAILS = 'rayshot_thumbnails';
const STORE_WAVEFORMS = 'rayshot_waveforms';
const STORE_PROJECTS = 'projects';
const STORE_CHECKPOINTS = 'checkpoints';

// ── DB open ────────────────────────────────────────────────────────────────
function openAssetDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			// Keep existing stores intact
			if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
				db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
				db.createObjectStore(STORE_CHECKPOINTS, { keyPath: 'id' });
			}
			// New stores
			if (!db.objectStoreNames.contains(STORE_ASSETS)) {
				db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
				db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(STORE_WAVEFORMS)) {
				db.createObjectStore(STORE_WAVEFORMS, { keyPath: 'id' });
			}
		};
	});
}

function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
	return new Promise(async (resolve, reject) => {
		try {
			const db = await openAssetDB();
			const tx = db.transaction(storeName, 'readonly');
			const req = tx.objectStore(storeName).get(key);
			req.onsuccess = () => resolve(req.result as T | undefined);
			req.onerror = () => reject(req.error);
		} catch (e) {
			reject(e);
		}
	});
}

function idbPut(storeName: string, value: Record<string, unknown>): Promise<void> {
	return new Promise(async (resolve, reject) => {
		try {
			const db = await openAssetDB();
			const tx = db.transaction(storeName, 'readwrite');
			const req = tx.objectStore(storeName).put(value);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		} catch (e) {
			reject(e);
		}
	});
}

function idbDelete(storeName: string, key: string): Promise<void> {
	return new Promise(async (resolve, reject) => {
		try {
			const db = await openAssetDB();
			const tx = db.transaction(storeName, 'readwrite');
			const req = tx.objectStore(storeName).delete(key);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		} catch (e) {
			reject(e);
		}
	});
}

function idbGetAll<T>(storeName: string): Promise<T[]> {
	return new Promise(async (resolve, reject) => {
		try {
			const db = await openAssetDB();
			const tx = db.transaction(storeName, 'readonly');
			const req = tx.objectStore(storeName).getAll();
			req.onsuccess = () => resolve(req.result as T[]);
			req.onerror = () => reject(req.error);
		} catch (e) {
			reject(e);
		}
	});
}

// ── Asset persistence ──────────────────────────────────────────────────────

export interface PersistedAsset {
	id: string;
	filename: string;
	blob: Blob;
	// No 'text' here on purpose: this store holds bytes, and a title has none.
	// Callers guard on sourceBlob before reaching it.
	type: 'video' | 'audio' | 'image';
	duration: number;
	mimeType: string;
	width?: number;
	height?: number;
	createdAt: number;
}

export async function persistAsset(asset: PersistedAsset): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	await idbPut(STORE_ASSETS, asset as unknown as Record<string, unknown>);
}

export async function loadPersistedAssets(): Promise<PersistedAsset[]> {
	if (typeof indexedDB === 'undefined') return [];
	try {
		return await idbGetAll<PersistedAsset>(STORE_ASSETS);
	} catch {
		return [];
	}
}

export async function removePersistedAsset(id: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	await Promise.all([
		idbDelete(STORE_ASSETS, id),
		idbDelete(STORE_THUMBNAILS, id),
		idbDelete(STORE_WAVEFORMS, id)
	]);
}

// ── Thumbnail persistence ──────────────────────────────────────────────────

export async function persistThumbnail(id: string, dataUrl: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	await idbPut(STORE_THUMBNAILS, { id, dataUrl });
}

export async function loadThumbnail(id: string): Promise<string | undefined> {
	if (typeof indexedDB === 'undefined') return undefined;
	const record = await idbGet<{ id: string; dataUrl: string }>(STORE_THUMBNAILS, id);
	return record?.dataUrl;
}

export async function loadAllThumbnails(): Promise<Map<string, string>> {
	if (typeof indexedDB === 'undefined') return new Map();
	const records = await idbGetAll<{ id: string; dataUrl: string }>(STORE_THUMBNAILS);
	return new Map(records.map((r) => [r.id, r.dataUrl]));
}

// ── Waveform persistence ───────────────────────────────────────────────────

export async function persistWaveform(id: string, peaks: number[]): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	await idbPut(STORE_WAVEFORMS, { id, peaks });
}

export async function loadWaveform(id: string): Promise<number[] | undefined> {
	if (typeof indexedDB === 'undefined') return undefined;
	const record = await idbGet<{ id: string; peaks: number[] }>(STORE_WAVEFORMS, id);
	return record?.peaks;
}

export async function loadAllWaveforms(): Promise<Map<string, number[]>> {
	if (typeof indexedDB === 'undefined') return new Map();
	const records = await idbGetAll<{ id: string; peaks: number[] }>(STORE_WAVEFORMS);
	return new Map(records.map((r) => [r.id, r.peaks]));
}

// ── Project-level serialization helpers ──────────────────────────────────
// Shared by idbAdapter and opfsAdapter to serialize/deserialize Maps

export function serializeProject(project: Record<string, unknown>): Record<string, unknown> {
	const { assets, clips, ...rest } = project as {
		assets: Map<string, unknown>;
		clips: Map<string, unknown>;
		[key: string]: unknown;
	};
	return {
		...rest,
		assets: assets instanceof Map ? Object.fromEntries(assets) : assets,
		clips: clips instanceof Map ? Object.fromEntries(clips) : clips ?? {}
	};
}

export function deserializeProject(raw: Record<string, unknown>): Record<string, unknown> {
	return {
		...raw,
		assets: new Map(Object.entries((raw.assets as Record<string, unknown>) ?? {})),
		clips: new Map(Object.entries((raw.clips as Record<string, unknown>) ?? {}))
	};
}
