<script lang="ts">
	import { timelineActions, timelineStore } from '$lib/stores/timeline.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { type Clip } from '$lib/types/project';
	import {
		thumbnailCache,
		multiThumbnailCache,
		placeholderThumbnail,
		generateProceduralWaveform
	} from '$lib/utils/mediaUtils';
	import { waveformBars as resampleWaveform } from '$lib/utils/waveformBars';
	import { derived } from 'svelte/store';
	import { projectStore } from '$lib/stores/project.svelte';

	let {
		clip,
		trackType = 'video',
		left,
		width,
		onMousedown,
		onTouchstart,
		onEffectDrop
	} = $props<{
		clip: Clip;
		trackType?: 'video' | 'audio' | 'subtitle';
		left: number;
		width: number;
		onMousedown: (event: MouseEvent) => void;
		onTouchstart: (event: TouchEvent) => void;
		onEffectDrop?: (effectId: string) => void;
	}>();

	/** Set by the effects drawer; anything else dragged over a clip is not ours. */
	const EFFECT_MIME = 'application/x-rayshot-effect';
	let effectDragOver = $state(false);

	function carriesEffect(event: DragEvent): boolean {
		return !!event.dataTransfer?.types.includes(EFFECT_MIME);
	}

	function handleEffectDragOver(event: DragEvent) {
		if (!onEffectDrop || !carriesEffect(event)) return;
		// Both calls matter: preventDefault marks the clip a valid drop target,
		// stopPropagation keeps the lane underneath from treating it as an
		// import of media at this position.
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		effectDragOver = true;
	}

	function handleEffectDrop(event: DragEvent) {
		effectDragOver = false;
		if (!onEffectDrop || !carriesEffect(event)) return;
		event.preventDefault();
		event.stopPropagation();
		const effectId = event.dataTransfer?.getData(EFFECT_MIME);
		if (effectId) onEffectDrop(effectId);
	}

	const assets = derived(projectStore, ($project) => $project?.assets ?? new Map());
	const asset = derived([assets], ([$assets]) => $assets.get(clip.mediaAssetId));
	const assetName = derived(asset, ($asset) => $asset?.filename ?? 'Clip');
	const assetType = derived(asset, ($asset) => $asset?.type ?? trackType);
	const isSelected = derived(timelineStore, ($timeline) => $timeline.selectedClipId === clip.id);

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			timelineActions.selectClip(clip.id);
		}
	}

	// Calculate repeating thumbnail count based on clip width
	const FRAME_WIDTH = 56;
	const thumbnailFrames = $derived.by(() => {
		const count = Math.max(1, Math.ceil(width / FRAME_WIDTH));
		const multi = multiThumbnailCache.get(clip.mediaAssetId);
		const single = thumbnailCache.get(clip.mediaAssetId) ?? placeholderThumbnail;

		if (multi && multi.length > 0) {
			const frames: string[] = [];
			for (let i = 0; i < count; i++) {
				const idx = Math.floor((i / count) * multi.length);
				frames.push(multi[idx] || single);
			}
			return frames;
		}

		return Array(count).fill(single);
	});

	// Real decoded peaks when we have them (mediaUtils/mediaWorker cache them by
	// asset id), procedural stand-in only until decoding lands. Resampling to
	// the clip's own width lives in waveformBars.ts so it stays unit-testable.
	const waveformBars = $derived.by(() => {
		const assetDuration =
			$asset?.duration || (clip.sourceOut > 0 ? clip.sourceOut : clip.timelineDuration) || 10;
		let allPeaks =
			$timelineStore.waveformCache.get(clip.mediaAssetId) ||
			$timelineStore.waveformCache.get(clip.id);
		if (!allPeaks || allPeaks.length === 0) {
			allPeaks = generateProceduralWaveform(clip.mediaAssetId || clip.id, 120);
		}

		return resampleWaveform(allPeaks, clip.sourceIn, clip.sourceOut, assetDuration, width);
	});
</script>

<div
	class="timeline-clip-block {trackType} {$assetType}"
	class:selected={$isSelected}
	class:effect-drag-over={effectDragOver}
	data-clip-id={clip.id}
	role="button"
	aria-label={$assetName}
	style="left: {left}px; width: {Math.max(16, width)}px;"
	title="{$assetName} ({clip.timelineDuration.toFixed(2)}s)"
	onmousedown={onMousedown}
	ontouchstart={onTouchstart}
	onkeydown={handleKeydown}
	ondragover={handleEffectDragOver}
	ondragleave={() => (effectDragOver = false)}
	ondrop={handleEffectDrop}
	onfocus={($event) => $event.currentTarget.classList.add('focus-visible')}
	onblur={($event) => $event.currentTarget.classList.remove('focus-visible')}
	tabindex="0"
	class:focus-visible={false}
>
	<!-- Left Trim Handle (Start boundary) -->
	<div class="trim-handle start" title="Drag to trim start">
			</div>

	<!-- Clip Visual Body -->
	<div class="clip-visual-content">
		<!-- Video & Image Clip -->
		{#if $assetType === 'video' || $assetType === 'image'}
			<!-- Filename Bar -->
			<div class="clip-filename-bar">
				<span class="clip-filename-text font-mono-label text-[9px] truncate">{$assetName}</span>
					{#if $isSelected}
						<span class="clip-speed-icon">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
							</svg>
						</span>
					{/if}
			</div>

			<!-- Thumbnail Representations -->
			<div class="clip-thumbnails flex-1 flex space-x-0.5 px-1 py-1">
				{#if $uiStore.showThumbnails}
					{#each thumbnailFrames as thumbSrc, i (i)}
						<div class="clip-thumbnail" style="background-image: url({thumbSrc});"></div>
					{/each}
				{:else}
					<div class="clip-thumbnail"></div>
					<div class="clip-thumbnail"></div>
					<div class="clip-thumbnail"></div>
				{/if}
			</div>
		{/if}

		<!-- Audio Clip -->
		{#if $assetType === 'audio'}
			<!-- Filename Bar -->
			<div class="clip-filename-bar">
				<span class="clip-filename-text font-mono-label text-[9px] text-secondary truncate">{$assetName}</span>
			</div>

			<!-- Waveform. Heights are inline styles, never Tailwind arbitrary values:
			     Tailwind scans source text statically, so a class built by Svelte
			     interpolation (h-[{n}%]) is never generated. -->
			{#if $uiStore.showWaveforms}
				<div class="clip-waveform flex-1 w-full relative opacity-70">
					<div class="absolute inset-0 flex items-end justify-around px-1 pb-1">
						{#each waveformBars as bar, i (i)}
							<div class="clip-waveform-bar" style="height: {Math.max(2, bar * 100)}%;"></div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Dark Legibility Overlay -->
		<div class="clip-text-overlay"></div>

		<!-- Clip Information Pill (Name + Duration) -->
		<div class="clip-label-pill">
			<span class="clip-text-name">{$assetName}</span>
			<span class="clip-len font-mono">{clip.timelineDuration.toFixed(1)}s</span>
		</div>
	</div>

	<!-- Right Trim Handle (End boundary) -->
	<div class="trim-handle end" title="Drag to trim end">
			</div>
</div>

<style>
	.timeline-clip-block {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		cursor: pointer;
		/* Height will be controlled by the track lane */
		transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.timeline-clip-block:active {
		cursor: grabbing;
	}

	.timeline-clip-block.video {
		background-color: var(--ms-raised); /* bg-surface-container-high */
		border: 1px solid transparent;
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); /* inner border */
	}

	.timeline-clip-block.video.selected {
		border: 2px solid var(--ms-text); /* border-2 border-primary */
		box-shadow: 0 0 8px rgba(208, 188, 255, 0.3); /* shadow-[0_0_8px_rgba(208,188,255,0.3)] */
		z-index: 10;
	}

	.timeline-clip-block.audio {
		background-color: var(--ms-text-secondary); /* secondary cyan */
		border: 1px solid transparent;
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); /* inner border */
	}

	.timeline-clip-block.image {
		background-color: var(--ms-raised);
		border: 1px solid transparent;
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); /* inner border */
	}

	.timeline-clip-block.adjustment {
		background-color: var(--ms-text); /* primary purple */
		border: 1px solid transparent;
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); /* inner border */
	}

	/* Focus visible styles for keyboard navigation */
	.timeline-clip-block.focus-visible {
		border-color: var(--ms-text) !important;
		box-shadow: 0 0 0 2px var(--ms-text), 0 0 0 4px rgba(208, 188, 255, 0.2), 0 0 12px rgba(208, 188, 255, 0.45);
	}

	/* Reduce motion support - disable animations for users who prefer reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.timeline-clip-block {
			transition: none !important;
		}

		.timeline-clip-block.focus-visible {
			transition: none !important;
		}
	}

	.clip-visual-content {
		flex: 1;
		display: flex;
		align-items: center;
		height: 100%;
		position: relative;
		min-width: 0;
		overflow: hidden;
	}

	/* Text overlay gradient for crisp typography */
	.clip-text-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(9, 10, 15, 0.75) 0%, rgba(9, 10, 15, 0.3) 60%, rgba(9, 10, 15, 0.1) 100%);
		pointer-events: none;
		z-index: 2;
	}

	/* Clip Labels */
	.clip-label-pill {
		position: relative;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
		width: 100%;
		min-width: 0;
		pointer-events: none;
	}

	.clip-text-name {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--ms-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
	}

	.clip-len {
		font-size: 0.6rem;
		font-weight: 500;
		color: var(--ms-text-secondary);
		background: rgba(0, 0, 0, 0.6);
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		flex-shrink: 0;
		backdrop-filter: blur(2px);
	}

	.font-mono {
		font-family: 'JetBrains Mono', monospace;
	}

	/* Clip Internal Structure */
	.clip-filename-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 4px;
		padding: 0 1px;
		font-size: 9px;
	}

	.timeline-clip-block.video .clip-filename-bar {
		background-color: rgba(0, 0, 0, 0.5); /* bg-surface-container-lowest/50 */
		color: var(--ms-text); /* text-on-surface-variant */
	}

	.timeline-clip-block.video.selected .clip-filename-bar {
		background-color: rgba(208, 188, 255, 0.2); /* bg-primary/20 */
		color: var(--ms-text); /* text-primary */
		justify-content: space-between;
		padding: 0 1px;
		display: flex;
		align-items: center;
	}

	.timeline-clip-block.video.selected .clip-filename-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 9px;
		color: var(--ms-text);
	}

	.timeline-clip-block.video.selected .clip-speed-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 12px;
	}

	.timeline-clip-block.audio .clip-filename-bar {
		background-color: var(--ms-material);
		color: var(--ms-text-secondary);
	}

	.clip-thumbnails {
		display: flex;
		flex: 1;
		gap: 0.5px;
		padding: 1px 1px;
	}

	.clip-thumbnail {
		background-color: var(--ms-raised);
		background-size: cover;
		background-position: center;
		border-radius: 2px;
		flex: 1;
		min-width: 0;
	}

	.clip-waveform {
		position: relative;
		height: 100%;
	}

	/* Static flex children — the parent is `flex items-end`, so they bottom-align
	   on their own. Absolute positioning here collapsed all bars to x=0. */
	.clip-waveform-bar {
		width: 2px;
		flex-shrink: 0;
		background-color: var(--ms-text-secondary);
		border-radius: 1px 1px 0 0;
	}

	/* Trim handles (positioned absolutely by parent) */
	.timeline-clip-block.effect-drag-over {
		outline: 2px dashed var(--ms-text);
		outline-offset: -2px;
	}

	.trim-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background-color: rgba(208, 188, 255, 0.5); /* bg-primary/50 */
		cursor: ew-resize;
		z-index: 5;
	}

	.trim-handle.start {
		left: 0;
	}

	.trim-handle.end {
		right: 0;
	}
</style>