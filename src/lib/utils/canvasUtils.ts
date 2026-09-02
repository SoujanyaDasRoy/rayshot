import type { Clip } from '$lib/types/project';

export function getLayerOpacity(clip: Clip): number {
	const opacity = clip.filters?.opacity ?? 100;
	return opacity / 100;
}
