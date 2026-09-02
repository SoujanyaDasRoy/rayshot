import type { MediaAsset } from '$lib/types/project';

/**
 * Kept separate from mediaUtils.ts (which pulls in projectStore, commandProcessor,
 * and IndexedDB persistence) so this stays dependency-free and trivially testable
 * pure functions — needed for folder import, where the browser hands back every
 * file in the tree, junk included (.DS_Store, thumbs.db, project files, etc.).
 */
export function filterMediaFiles(files: File[]): File[] {
	return files.filter(
		(file) =>
			file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/')
	);
}

/**
 * webkitdirectory gives each file's path relative to the picked folder, e.g.
 * "MyFootage/clips/a.mp4" — the first segment is the folder the user actually
 * picked, regardless of how deep the real file sits inside it.
 */
export function folderNameFromRelativePath(relativePath: string): string | undefined {
	const slashIndex = relativePath.indexOf('/');
	if (slashIndex === -1) return undefined;
	const first = relativePath.slice(0, slashIndex).trim();
	return first ? first : undefined;
}

export interface ImportedFolder {
	name: string;
	count: number;
}

/**
 * The one place both the sidebar and the media library read "what folders
 * exist" from — real imported folders only. A folder with 0 assets doesn't
 * exist as far as the UI is concerned (no manual create-empty-folder flow).
 */
export function getImportedFolders(assets: Iterable<MediaAsset>): ImportedFolder[] {
	const counts = new Map<string, number>();
	for (const asset of assets) {
		if (!asset.folder) continue;
		counts.set(asset.folder, (counts.get(asset.folder) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
