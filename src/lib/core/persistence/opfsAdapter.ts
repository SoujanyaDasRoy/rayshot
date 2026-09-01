/**
 * OPFS Auto-Save Adapter
 *
 * Saves the full project JSON to the Origin Private File System so it
 * survives browser refresh and tab close.
 *
 * File layout in OPFS:
 *   /rayshot/autosave.json      — latest project snapshot
 *   /rayshot/autosave.meta.json — metadata (savedAt timestamp, projectName)
 */

import { migrateProject } from './migrateProject';
import type { Project } from '$lib/types/project';

const OPFS_DIR = 'rayshot';
const AUTOSAVE_FILE = 'autosave.json';
const META_FILE = 'autosave.meta.json';

// ── OPFS availability check ────────────────────────────────────────────────
export function isOpfsAvailable(): boolean {
	return (
		typeof window !== 'undefined' &&
		'storage' in navigator &&
		'getDirectory' in navigator.storage
	);
}

// ── Serialize project (Maps → plain objects) ───────────────────────────────
function serializeForOpfs(project: Record<string, unknown>): string {
	const { assets, clips, ...rest } = project as {
		assets: Map<string, unknown>;
		clips: Map<string, unknown>;
		[key: string]: unknown;
	};

	// Replace Map values — blobs are NOT stored in OPFS (stored in IDB instead)
	// We only store the asset metadata (without sourceBlob)
	const assetsObj: Record<string, unknown> = {};
	if (assets instanceof Map) {
		assets.forEach((asset: unknown, key: string) => {
			const { sourceBlob: _blob, ...meta } = asset as { sourceBlob?: Blob; [k: string]: unknown };
			assetsObj[key] = meta;
		});
	}

	const clipsObj: Record<string, unknown> = {};
	if (clips instanceof Map) {
		clips.forEach((clip: unknown, key: string) => {
			clipsObj[key] = clip;
		});
	}

	return JSON.stringify({
		...rest,
		assets: assetsObj,
		clips: clipsObj
	});
}

// ── Write file helper ──────────────────────────────────────────────────────
async function writeOpfsFile(
	dir: FileSystemDirectoryHandle,
	filename: string,
	content: string
): Promise<void> {
	const handle = await dir.getFileHandle(filename, { create: true });
	const writable = await handle.createWritable();
	await writable.write(content);
	await writable.close();
}

// ── Read file helper ───────────────────────────────────────────────────────
async function readOpfsFile(
	dir: FileSystemDirectoryHandle,
	filename: string
): Promise<string | null> {
	try {
		const handle = await dir.getFileHandle(filename);
		const file = await handle.getFile();
		return file.text();
	} catch {
		return null;
	}
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface OpfsAutoSaveMeta {
	savedAt: number;
	projectName: string;
	projectId: string;
}

/**
 * Save a project snapshot to OPFS (call debounced after each command).
 */
export async function opfsAutoSave(project: Record<string, unknown>): Promise<void> {
	if (!isOpfsAvailable()) return;
	try {
		const dir = await getRayhotDir();
		const json = serializeForOpfs(project);
		const meta: OpfsAutoSaveMeta = {
			savedAt: Date.now(),
			projectName: (project.name as string) ?? 'Untitled',
			projectId: (project.id as string) ?? ''
		};
		await Promise.all([
			writeOpfsFile(dir, AUTOSAVE_FILE, json),
			writeOpfsFile(dir, META_FILE, JSON.stringify(meta))
		]);
	} catch (err) {
		// Non-fatal — silently skip if OPFS quota is full or unavailable
		console.warn('[OPFS] auto-save failed:', err);
	}
}

/**
 * Read auto-save metadata (savedAt, projectName) without loading full project.
 * Returns null if no auto-save exists.
 */
export async function opfsGetAutoSaveMeta(): Promise<OpfsAutoSaveMeta | null> {
	if (!isOpfsAvailable()) return null;
	try {
		const dir = await getRayhotDir();
		const text = await readOpfsFile(dir, META_FILE);
		if (!text) return null;
		return JSON.parse(text) as OpfsAutoSaveMeta;
	} catch {
		return null;
	}
}

/**
 * Load the full auto-saved project JSON. Returns null if none exists.
 */
export async function opfsLoadAutoSave(): Promise<Project | null> {
	if (!isOpfsAvailable()) return null;
	try {
		const dir = await getRayhotDir();
		const text = await readOpfsFile(dir, AUTOSAVE_FILE);
		if (!text) return null;
		// migrateProject rehydrates the Maps, backfills legacy clips, and
		// refuses a payload written by a newer build. Blobs are not here —
		// they come from the IDB asset cache (see rehydrateAssetBlobs).
		return migrateProject(JSON.parse(text));
	} catch {
		return null;
	}
}

/**
 * Delete the OPFS auto-save (called when user explicitly starts a new project).
 */
export async function opfsClearAutoSave(): Promise<void> {
	if (!isOpfsAvailable()) return;
	try {
		const dir = await getRayhotDir();
		await dir.removeEntry(AUTOSAVE_FILE).catch(() => {});
		await dir.removeEntry(META_FILE).catch(() => {});
	} catch {
		// Ignore
	}
}

// Internal helper
async function getRayhotDir(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle(OPFS_DIR, { create: true });
}
