import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import type { Project } from '$lib/types/project';
import {
	MANIFEST_ENTRY,
	PROJECT_ENTRY,
	buildManifest,
	documentToProject,
	mediaPathFor,
	projectToDocument,
	readManifest
} from './rayshotFormat';

/**
 * Read and write .rayshot bundles.
 *
 * Separate from rayshotFormat.ts because this half touches fflate and Blobs;
 * the pure half stays unit-testable in the node Vitest project.
 */

/**
 * Browsers build the whole archive in memory, so a project past this size
 * cannot be bundled and the user is told rather than left with a dead tab.
 * ponytail: streaming via showSaveFilePicker would lift this, add it when a
 * real project actually hits the ceiling.
 */
export const MAX_BUNDLE_BYTES = 1_500_000_000;

/** TypeScript types Uint8Array as possibly SharedArrayBuffer-backed; Blob wants ArrayBuffer. */
function toBlobPart(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export interface BundleResult {
	blob: Blob;
	skipped: string[];
}

export async function createRayshotBundle(project: Project): Promise<BundleResult> {
	const files: Record<string, Uint8Array> = {};
	const skipped: string[] = [];
	let total = 0;

	for (const asset of project.assets.values()) {
		if (!asset.sourceBlob) {
			// Media that is already offline travels as metadata only; the
			// manifest still lists it so the other end can ask for a relink.
			skipped.push(asset.filename);
			continue;
		}
		total += asset.sourceBlob.size;
		if (total > MAX_BUNDLE_BYTES) {
			throw new Error(
				'This project is too large to bundle in the browser. Remove some media and try again.'
			);
		}
		const bytes = new Uint8Array(await asset.sourceBlob.arrayBuffer());
		files[mediaPathFor(asset.id, asset.filename)] = bytes;
	}

	files[PROJECT_ENTRY] = strToU8(JSON.stringify(projectToDocument(project)));
	files[MANIFEST_ENTRY] = strToU8(JSON.stringify(buildManifest(project), null, 2));

	const zipped = await new Promise<Uint8Array>((resolve, reject) => {
		// Level 0 for media: video and audio are already compressed, so
		// deflating them costs seconds and saves almost nothing.
		zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
	});

	return { blob: new Blob([toBlobPart(zipped)], { type: 'application/zip' }), skipped };
}

export interface OpenedBundle {
	project: Project;
	/** Asset id -> bytes, ready to go straight into the blob cache. */
	media: Map<string, Blob>;
	/** Assets the bundle referenced but did not carry. */
	missing: string[];
}

export async function readRayshotBundle(file: Blob): Promise<OpenedBundle> {
	const buf = new Uint8Array(await file.arrayBuffer());
	const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
		unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
	});

	const manifestRaw = entries[MANIFEST_ENTRY];
	const projectRaw = entries[PROJECT_ENTRY];
	if (!manifestRaw || !projectRaw) {
		throw new Error('That file is not a RayShot project.');
	}

	const manifest = readManifest(JSON.parse(strFromU8(manifestRaw)));
	if (!manifest) {
		throw new Error('This project was made with a newer version of RayShot.');
	}

	const project = documentToProject(JSON.parse(strFromU8(projectRaw)));
	if (!project) {
		throw new Error('This project was made with a newer version of RayShot.');
	}

	const media = new Map<string, Blob>();
	const missing: string[] = [];
	for (const entry of manifest.media) {
		const bytes = entries[entry.path];
		if (!bytes) {
			missing.push(entry.filename);
			continue;
		}
		media.set(
			entry.id,
			new Blob([toBlobPart(bytes)], { type: entry.mimeType || 'application/octet-stream' })
		);
	}

	return { project, media, missing };
}
