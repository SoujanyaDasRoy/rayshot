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

	// A name on a 40px clip is a smear across the only thing you were looking
	// at. Below these widths the clip is its content and nothing else.
	const showName = $derived(width > 88);
	const showDuration = $derived(width > 168);

	const captionText = $derived(clip.text?.content?.trim() || $assetName);
	const isTextClip = $derived(!!clip.text || $assetType === 'text');

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
	<div class="trim-handle start" title="Drag to trim start"></div>

	<div class="clip-body">
		{#if $assetType === 'video' || $assetType === 'image'}
			<!-- Edge to edge, no padding and no gaps: a filmstrip reads as one
			     continuous piece of footage, which is the thing being represented.
			     Boxed thumbnails with gutters read as a row of icons. -->
			<div class="clip-filmstrip">
				{#if $uiStore.showThumbnails}
					{#each thumbnailFrames as thumbSrc, i (i)}
						<div class="clip-frame" style="background-image: url({thumbSrc});"></div>
					{/each}
				{/if}
			</div>
		{:else if $assetType === 'audio'}
			{#if $uiStore.showWaveforms}
				<!-- Heights are inline styles, never Tailwind arbitrary values:
				     Tailwind scans source text statically, so a class built by
				     Svelte interpolation (h-[{n}%]) is never generated. -->
				<div class="clip-wave">
					{#each waveformBars as bar, i (i)}
						<div class="clip-waveform-bar" style="height: {Math.max(2, bar * 100)}%;"></div>
					{/each}
				</div>
			{/if}
		{:else if isTextClip || trackType === 'subtitle'}
			<!-- A caption clip should read as its own words. Falls back to the
			     filename, because real text clips do not exist yet — titles are
			     rasterised at insert. -->
			<p class="clip-caption">{captionText}</p>
		{/if}

		{#if showName}
			<div class="clip-meta">
				<span class="clip-kind-glyph" aria-hidden="true">
					{#if $assetType === 'audio'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
							<path d="M9 18V6l10-2v12" />
							<circle cx="6.5" cy="18" r="2.5" />
							<circle cx="16.5" cy="16" r="2.5" />
						</svg>
					{:else if isTextClip}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
							<path d="M5 6h14M12 6v13" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<rect x="2" y="5" width="20" height="14" rx="2" />
							<path d="M7 5v14M17 5v14" />
						</svg>
					{/if}
				</span>
				<span class="clip-name">{$assetName}</span>
			</div>
		{/if}
	</div>

	<!-- Right Trim Handle (End boundary) -->
	<div class="trim-handle end" title="Drag to trim end"></div>
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

	.clip-body {
		position: relative;
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: hidden;
		/* The lane sets --track-color; the clip is tinted by the kind of thing
		   it holds, so a glance at the timeline says picture, sound or caption
		   before you read a single label. */
		background: color-mix(in srgb, var(--track-color) 22%, transparent);
		box-shadow: inset 2px 0 0 var(--track-color);
	}

	.clip-filmstrip {
		display: flex;
		height: 100%;
		width: 100%;
	}

	.clip-frame {
		flex: 1;
		min-width: 0;
		background-size: cover;
		background-position: center;
	}

	.clip-wave {
		display: flex;
		align-items: center;
		justify-content: space-around;
		height: 100%;
		width: 100%;
		padding: 0 2px;
	}

	/* Static flex children — the parent centres them, so a bar grows from the
	   middle out. Absolute positioning here collapsed every bar to x=0. */
	.clip-waveform-bar {
		width: 2px;
		flex-shrink: 0;
		border-radius: 1px;
		background: color-mix(in srgb, var(--track-color) 70%, white);
	}

	.clip-caption {
		display: flex;
		align-items: center;
		height: 100%;
		margin: 0;
		padding: 0 8px;
		font-size: 11px;
		line-height: 1.2;
		color: var(--ms-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* One name, in one place. It used to appear in a bar at the top, again in a
	   pill at the bottom, and a third time in the title attribute. */
	/* A solid bar along the foot of the clip, icon then name — the NLE
	   convention, and legible over any frame beneath it. A gradient wash left
	   the name fighting whatever the footage happened to be doing. */
	.clip-meta {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 5px;
		height: 15px;
		padding: 0 6px;
		pointer-events: none;
		background: color-mix(in srgb, var(--track-color) 55%, rgba(0, 0, 0, 0.82));
	}

	.clip-kind-glyph {
		display: flex;
		flex-shrink: 0;
		width: 10px;
		height: 10px;
		color: var(--ms-text);
		opacity: 0.85;
	}

	.clip-kind-glyph svg {
		width: 100%;
		height: 100%;
	}

	/* A title's words are the label; a filename underneath it would be noise. */
	.timeline-clip-block.subtitle .clip-meta,
	.timeline-clip-block.text .clip-meta {
		display: none;
	}

	.clip-name {
		flex: 1;
		min-width: 0;
		font-size: 10px;
		font-weight: 590;
		color: var(--ms-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.clip-dur {
		flex-shrink: 0;
		font-size: 9.5px;
		color: var(--ms-text-secondary);
	}

	.font-mono {
		font-family: 'JetBrains Mono', monospace;
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