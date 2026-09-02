import type { Project, MediaAsset } from '$lib/types/project';
import { migrateProject, CURRENT_PROJECT_VERSION } from './migrateProject';

/**
 * The .rayshot bundle format.
 *
 * A .rayshot file is a ZIP holding project.json, manifest.json and the real
 * media files under media/ — the same shape .docx and .kra use. Media travels
 * as bytes, not base64, because base64 inflates by a third and a video project
 * cannot afford that.
 *
 * This module is the pure half: paths, manifest and document shape. Zipping
 * and unzipping live in rayshotFile.ts so this stays testable in the node
 * Vitest project.
 */

export const RAYSHOT_FORMAT_VERSION = 1;

export const PROJECT_ENTRY = 'project.json';
export const MANIFEST_ENTRY = 'manifest.json';
export const MEDIA_DIR = 'media';

export interface RayshotManifestEntry {
	id: string;
	filename: string;
	path: string;
	mimeType?: string;
	bytes?: number;
}

export interface RayshotManifest {
	formatVersion: number;
	projectVersion: number;
	projectName: string;
	createdAt: number;
	media: RayshotManifestEntry[];
}

/** Filenames come off the user's disk; never let one steer where a file lands. */
function safeSegment(value: string): string {
	return value
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		// Collapse dot runs: '..' must not survive in any form, even without a
		// separator, so no reader can reconstruct a traversal from it.
		.replace(/\.{2,}/g, '_')
		.replace(/^[._-]+/, '');
}

function extensionOf(filename: string): string {
	const base = filename.split(/[\/]/).pop() ?? '';
	const dot = base.lastIndexOf('.');
	if (dot <= 0 || dot === base.length - 1) return '';
	return base.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '');
}

/** Bytes are keyed by asset id, so two files of the same name never collide. */
export function mediaPathFor(assetId: string, filename: string): string {
	const ext = extensionOf(filename);
	const id = safeSegment(assetId);
	return ext ? `${MEDIA_DIR}/${id}.${ext}` : `${MEDIA_DIR}/${id}`;
}

export function buildManifest(project: Project): RayshotManifest {
	const media: RayshotManifestEntry[] = [];
	for (const asset of project.assets.values()) {
		media.push({
			id: asset.id,
			filename: asset.filename,
			path: mediaPathFor(asset.id, asset.filename),
			mimeType: asset.mimeType,
			bytes: asset.sourceBlob?.size
		});
	}
	return {
		formatVersion: RAYSHOT_FORMAT_VERSION,
		projectVersion: CURRENT_PROJECT_VERSION,
		projectName: project.name,
		createdAt: Date.now(),
		media
	};
}

/** Returns null for junk, or for a bundle a newer build wrote. */
export function readManifest(raw: unknown): RayshotManifest | null {
	if (!raw || typeof raw !== 'object') return null;
	const m = raw as Partial<RayshotManifest>;
	if (typeof m.formatVersion !== 'number') return null;
	if (m.formatVersion > RAYSHOT_FORMAT_VERSION) return null;
	if (!Array.isArray(m.media)) return null;
	return {
		formatVersion: m.formatVersion,
		projectVersion: typeof m.projectVersion === 'number' ? m.projectVersion : 1,
		projectName: typeof m.projectName === 'string' ? m.projectName : 'Untitled Project',
		createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
		media: m.media.filter((e) => e && typeof e.id === 'string' && typeof e.path === 'string')
	};
}

/** Project -> JSON-safe document. Blobs are omitted; they ship as real files. */
export function projectToDocument(project: Project): Record<string, unknown> {
	const { assets, clips, ...rest } = project;

	const assetsObj: Record<string, unknown> = {};
	for (const [id, asset] of assets) {
		const { sourceBlob: _blob, ...meta } = asset as MediaAsset;
		assetsObj[id] = meta;
	}

	const clipsObj: Record<string, unknown> = {};
	for (const [id, clip] of clips) clipsObj[id] = clip;

	return { ...rest, assets: assetsObj, clips: clipsObj };
}

/**
 * Document -> Project, through the same version gate the autosave uses, so a
 * bundle from a newer build is refused rather than half-read.
 */
export function documentToProject(doc: unknown): Project | null {
	return migrateProject(doc);
}
