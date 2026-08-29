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
	import { derived } from 'svelte/store';
	import { projectStore } from '$lib/stores/project.svelte';

	let {
		clip,
		trackType = 'video',
		left,
		width,
		onMousedown,
		onTouchstart
	} = $props<{
		clip: Clip;
		trackType?: 'video' | 'audio';
		left: number;
		width: number;
		onMousedown: (event: MouseEvent) => void;
		onTouchstart: (event: TouchEvent) => void;
	}>();

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

	// Compute sliced waveform peaks matching sourceIn and sourceOut
	const waveformBars = $derived.by(() => {
		const assetDuration =
			$asset?.duration || (clip.sourceOut > 0 ? clip.sourceOut : clip.timelineDuration) || 10;
		let allPeaks =
			$timelineStore.waveformCache.get(clip.mediaAssetId) ||
			$timelineStore.waveformCache.get(clip.id);
		if (!allPeaks || allPeaks.length === 0) {
			allPeaks = generateProceduralWaveform(clip.mediaAssetId || clip.id, 120);
		}

		const startRatio = Math.max(0, Math.min(0.99, clip.sourceIn / assetDuration));
		const endRatio = Math.max(startRatio + 0.01, Math.min(1.0, clip.sourceOut / assetDuration));

		const startIdx = Math.floor(startRatio * allPeaks.length);
		const endIdx = Math.max(startIdx + 1, Math.ceil(endRatio * allPeaks.length));
		const sliced = allPeaks.slice(startIdx, endIdx);

		// Generate density of bars based on clip width (1 bar per ~3.5px)
		const targetBars = Math.max(6, Math.min(180, Math.floor(width / 3.5)));
		const bars: number[] = [];
		for (let i = 0; i < targetBars; i++) {
			const idx = Math.floor((i / targetBars) * sliced.length);
			bars.push(sliced[idx] !== undefined ? sliced[idx] : 0.2);
		}
		return bars;
	});
</script>

<div
	class="timeline-clip-block {trackType} {$assetType}"
	class:selected={$isSelected}
	data-clip-id={clip.id}
	role="button"
	aria-label={$assetName}
	style="left: {left}px; width: {Math.max(16, width)}px;"
	title="{$assetName} ({clip.timelineDuration.toFixed(2)}s)"
	onmousedown={onMousedown}
	ontouchstart={onTouchstart}
	onkeydown={handleKeydown}
	tabindex="0"
>
	<!-- Left Trim Handle (Start boundary) -->
	<div class="trim-edge start" title="Drag to trim start">
		<div class="edge-bar"></div>
	</div>

	<!-- Clip Visual Body -->
	<div class="clip-visual-content">
		<!-- Video & Image Filmstrip Layer -->
		{#if $assetType === 'video' || $assetType === 'image'}
			{#if $uiStore.showThumbnails}
				<div class="clip-filmstrip" aria-hidden="true">
					{#each thumbnailFrames as thumbSrc}
						<div class="filmstrip-frame">
							<img
								src={thumbSrc}
								alt="frame"
								onerror={(e) => {
									(e.currentTarget as HTMLImageElement).src = placeholderThumbnail;
								}}
							/>
						</div>
					{/each}
				</div>
			{:else}
				<div class="mini-thumb-wrap">
					<img
						src={thumbnailCache.get(clip.mediaAssetId) ?? placeholderThumbnail}
						alt="thumb"
						onerror={(e) => {
							(e.currentTarget as HTMLImageElement).src = placeholderThumbnail;
						}}
					/>
				</div>
			{/if}
		{/if}

		<!-- Audio Waveform Layer -->
		{#if $assetType === 'audio'}
			{#if $uiStore.showWaveforms}
				<div class="audio-waveform-container" aria-hidden="true">
					<svg
						class="waveform-svg"
						viewBox="0 0 {Math.max(10, waveformBars.length * 4)} 40"
						preserveAspectRatio="none"
					>
						<defs>
							<linearGradient id="wave-grad-{clip.id}" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stop-color="#34d399" stop-opacity="0.95" />
								<stop offset="50%" stop-color="#10b981" stop-opacity="0.7" />
								<stop offset="100%" stop-color="#059669" stop-opacity="0.95" />
							</linearGradient>
						</defs>
						<!-- Center line -->
						<line
							x1="0"
							y1="20"
							x2={waveformBars.length * 4}
							y2="20"
							stroke="rgba(52, 211, 153, 0.3)"
							stroke-width="1"
						/>
						<!-- Waveform Bars -->
						{#each waveformBars as peak, i}
							{@const barHeight = Math.max(3, peak * 32)}
							{@const yPos = 20 - barHeight / 2}
							<rect
								x={i * 4 + 0.8}
								y={yPos}
								width="2.4"
								height={barHeight}
								rx="1"
								fill="url(#wave-grad-{clip.id})"
							/>
						{/each}
					</svg>
				</div>
			{:else}
				<div class="audio-waveform-decor">
					<div class="waveform-line"></div>
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
	<div class="trim-edge end" title="Drag to trim end">
		<div class="edge-bar"></div>
	</div>
</div>

<style>
	.timeline-clip-block {
		position: absolute;
		top: 4px;
		height: 40px;
		border-radius: 5px;
		color: white;
		display: flex;
		align-items: center;
		cursor: grab;
		user-select: none;
		box-sizing: border-box;
		border: 1px solid rgba(255, 255, 255, 0.16);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
		overflow: hidden;
	}

	.timeline-clip-block:active {
		cursor: grabbing;
	}

	.timeline-clip-block.video {
		background: #172554;
		border-color: #2563eb;
	}

	.timeline-clip-block.audio {
		background: #022c22;
		border-color: #059669;
	}

	.timeline-clip-block.image {
		background: #451a03;
		border-color: #d97706;
	}

	.timeline-clip-block.selected {
		border: 2px solid #d0bcff !important;
		box-shadow: 0 0 0 1px #d0bcff, 0 0 12px rgba(208, 188, 255, 0.45);
		z-index: 20;
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

	/* Video Filmstrip */
	.clip-filmstrip {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		overflow: hidden;
		opacity: 0.72;
		pointer-events: none;
	}

	.filmstrip-frame {
		flex: 0 0 56px;
		height: 100%;
		border-right: 1px solid rgba(0, 0, 0, 0.45);
		overflow: hidden;
		background: #000;
	}

	.filmstrip-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.mini-thumb-wrap {
		width: 32px;
		height: 28px;
		border-radius: 2px;
		overflow: hidden;
		flex-shrink: 0;
		background: #000;
		margin-left: 4px;
	}

	.mini-thumb-wrap img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* Audio Waveform */
	.audio-waveform-container {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		pointer-events: none;
		overflow: hidden;
		opacity: 0.9;
		padding: 2px 0;
	}

	.waveform-svg {
		width: 100%;
		height: 100%;
	}

	.audio-waveform-decor {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			90deg,
			transparent,
			transparent 3px,
			rgba(52, 211, 153, 0.3) 3px,
			rgba(52, 211, 153, 0.3) 5px
		);
		opacity: 0.5;
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
		color: #ffffff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
	}

	.clip-len {
		font-size: 0.6rem;
		font-weight: 500;
		color: #e2e8f0;
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

	/* Trim Handles */
	.trim-edge {
		width: 8px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: col-resize;
		background: rgba(0, 0, 0, 0.3);
		transition: background 0.15s ease;
		flex-shrink: 0;
		z-index: 10;
	}

	.trim-edge:hover {
		background: rgba(56, 189, 248, 0.55);
	}

	.trim-edge.start {
		border-right: 1px solid rgba(255, 255, 255, 0.08);
	}

	.trim-edge.end {
		border-left: 1px solid rgba(255, 255, 255, 0.08);
	}

	.edge-bar {
		width: 2px;
		height: 16px;
		background: rgba(255, 255, 255, 0.85);
		border-radius: 1px;
	}
</style>
