import type { MediaAsset } from '$lib/types/project';
import type { PersistedAsset } from './assetCache';

/**
 * Reattach cached media bytes to a project restored from OPFS.
 *
 * The autosave deliberately strips `sourceBlob` (IndexedDB owns the bytes),
 * but nothing ever read them back — so a restored project looked correct and
 * was unplayable. This is the missing half.
 *
 * Dependency-free (type-only imports) so it is unit-testable in the node
 * Vitest project, which cannot resolve bare `$lib` specifiers.
 */

export interface MergeResult {
	assets: Map<string, MediaAsset>;
	/** How many assets got their bytes back. */
	restored: number;
	/** Asset ids still without bytes — the "media offline" set. */
	missing: string[];
}

export function mergePersistedBlobs(
	assets: Map<string, MediaAsset>,
	persisted: PersistedAsset[]
): MergeResult {
	const byId = new Map(persisted.map((p) => [p.id, p]));
	const merged = new Map<string, MediaAsset>();
	const missing: string[] = [];
	let restored = 0;

	for (const [id, asset] of assets) {
		if (asset.sourceBlob) {
			merged.set(id, asset);
			continue;
		}

		const cached = byId.get(id);
		if (!cached) {
			// Bytes are genuinely gone (imported on another device, or evicted).
			merged.set(id, asset);
			missing.push(id);
			continue;
		}

		merged.set(id, {
			...asset,
			sourceBlob: cached.blob,
			// The import path historically wrote these onto the IDB record only,
			// so the restored asset can be richer than what the autosave held.
			mimeType: asset.mimeType ?? cached.mimeType,
			width: asset.width ?? cached.width,
			height: asset.height ?? cached.height
		});
		restored++;
	}

	// Assets present only in IDB belong to other projects — importing them here
	// would resurrect media the user removed.
	return { assets: merged, restored, missing };
}
