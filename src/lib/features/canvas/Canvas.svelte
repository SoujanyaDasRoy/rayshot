<script lang="ts">
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { derived } from 'svelte/store';
	import { onDestroy } from 'svelte';
	import type { Clip, MediaAsset } from '$lib/types/project';
	import { audioEngine } from '$lib/core/audioEngine';
	import { WebGLCompositor } from '$lib/core/rendering/webglCompositor';

	interface LayerClipInfo {
		clip: Clip;
		asset: MediaAsset;
		sourceTime: number;
		trackOrder: number;
	}

	const activeSequence = derived(projectStore, ($project) => {
		if (!$project || !$project.activeSequenceId) return null;
		return $project.sequences.find((s) => s.id === $project.activeSequenceId) ?? null;
	});

	function getSourceTime(clip: Clip, timelineTime: number): number {
		const timelineOffset = timelineTime - clip.timelineStart;
		const sourceDuration = clip.sourceOut - clip.sourceIn;
		const timelineDuration = clip.timelineDuration;
		if (timelineDuration <= 0) return clip.sourceIn;
		return clip.sourceIn + (timelineOffset / timelineDuration) * sourceDuration;
	}

	const activeLayers = derived(
		[projectStore, playbackStore],
		([$project, $playback]) => {
			if (!$project || !$project.activeSequenceId) return [];
			const sequence = $project.sequences.find((s) => s.id === $project.activeSequenceId);
			if (!sequence) return [];

			const time = $playback.currentTime;
			const layers: LayerClipInfo[] = [];

			for (let i = 0; i < sequence.tracks.length; i++) {
				const track = sequence.tracks[i];
				for (const clipId of track.clipInstances) {
					const clip = $project.clips.get(clipId);
					if (!clip) continue;
					if (time >= clip.timelineStart && time < clip.timelineStart + clip.timelineDuration) {
						const asset = $project.assets.get(clip.mediaAssetId);
						if (asset) {
							layers.push({
								clip,
								asset,
								sourceTime: getSourceTime(clip, time),
								trackOrder: track.order ?? i
							});
						}
					}
				}
			}

			// Sort by track order ascending: higher track order overlays lower track order
			layers.sort((a, b) => a.trackOrder - b.trackOrder);
			return layers;
		}
	);

	const visualLayers = derived(activeLayers, ($layers) =>
		$layers.filter((l) => l.asset.type === 'video' || l.asset.type === 'image')
	);

	const audioLayers = derived(activeLayers, ($layers) =>
		$layers.filter((l) => l.asset.type === 'audio' || (l.asset.type === 'video' && !l.clip.audioParameters?.mute))
	);

	// Map of assetId -> objectUrl
	let objectUrls = $state<Map<string, string>>(new Map());
	const mediaElements = new Map<string, HTMLMediaElement>();

	// WebGL compositors for video layers: keyed by clip ID
	const compositors = new Map<string, WebGLCompositor>();
	// Object URLs for WebGL output images
	const webglUrls = $state<Map<string, string>>(new Map());

	$effect(() => {
		const layers = $activeLayers;
		const currentMap = new Map(objectUrls);
		const activeAssetIds = new Set<string>();

		for (const l of layers) {
			activeAssetIds.add(l.asset.id);
			if (!currentMap.has(l.asset.id) && l.asset.sourceBlob) {
				try {
					const url = URL.createObjectURL(l.asset.sourceBlob);
					currentMap.set(l.asset.id, url);
				} catch (e) {
					console.error('Failed to create object URL for asset:', l.asset.id, e);
				}
			}
		}

		// Revoke unused URLs
		for (const [assetId, url] of currentMap) {
			if (!activeAssetIds.has(assetId)) {
				URL.revokeObjectURL(url);
				currentMap.delete(assetId);
			}
		}

		objectUrls = currentMap;
	});

	function syncElement(el: HTMLMediaElement, clip: Clip, sourceTime: number) {
		if (!el) return;
		const targetTime = sourceTime;
		if (Math.abs(el.currentTime - targetTime) > 0.15 || !$playbackStore.isPlaying) {
			try {
				el.currentTime = targetTime;
			} catch (_) {}
		}
		el.playbackRate = ($playbackStore.playbackSpeed || 1) * (clip.playbackRate || 1);
		el.volume = $playbackStore.isMuted
			? 0
			: ($playbackStore.masterVolume ?? 1) * (clip.audioParameters?.mute ? 0 : (clip.audioParameters?.volume ?? 1));

		if ($playbackStore.isPlaying && el.paused) {
			el.play().catch(() => {});
		} else if (!$playbackStore.isPlaying && !el.paused) {
			el.pause();
		}
	}

	function mediaSync(node: HTMLMediaElement, params: { clip: Clip; sourceTime: number }) {
		mediaElements.set(params.clip.id, node);
		syncElement(node, params.clip, params.sourceTime);

		// Register with audio engine mixing graph (initializes AudioContext on first user gesture)
		audioEngine.init();
		audioEngine.registerClip(
			params.clip.id,
			node,
			params.clip.audioParameters?.volume ?? 1,
			0 // pan center
		);

		return {
			update(newParams: { clip: Clip; sourceTime: number }) {
				syncElement(node, newParams.clip, newParams.sourceTime);
			},
			destroy() {
				node.pause();
				mediaElements.delete(params.clip.id);
				audioEngine.unregisterClip(params.clip.id);
			}
		};
	}

	// Reactive sync whenever playbackStore state changes
	$effect(() => {
		const isPlaying = $playbackStore.isPlaying;
		const playbackSpeed = $playbackStore.playbackSpeed;
		const isMuted = $playbackStore.isMuted;
		const masterVolume = $playbackStore.masterVolume;
		const currentTime = $playbackStore.currentTime;
		const layers = $activeLayers;

		// Update audio engine master state
		if (audioEngine.isInitialized) {
			audioEngine.setMasterVolume(masterVolume);
			audioEngine.setMuted(isMuted);
			if (isPlaying) audioEngine.resume(); else audioEngine.suspend();
		}

		for (const layer of layers) {
			const el = mediaElements.get(layer.clip.id);
			if (el) {
				syncElement(el, layer.clip, layer.sourceTime);
				// If it's a video layer, update the WebGL output
				if (layer.asset.type === 'video') {
					const colorGrade = {
						exposure: 0,
						contrast: ((layer.clip.filters?.contrast ?? 0) / 100.0) - 1.0,
						highlights: 0,
						shadows: 0,
						temperature: 0,
						tint: 0,
						saturation: ((layer.clip.filters?.saturate ?? 0) / 100.0) - 1.0,
						vibrance: 0,
						vignette: 0,
						grain: 0,
						curves: layer.clip.filters?.curves ?? [[0, 0], [0.5, 0.5], [1, 1]],
						lutTexture: null
					};
					updateWebglOutput(layer.clip.id, el as HTMLVideoElement, colorGrade);
				}
			}
		}
	});

	onDestroy(() => {
		for (const url of objectUrls.values()) {
			URL.revokeObjectURL(url);
		}
		for (const url of webglUrls.values()) {
			URL.revokeObjectURL(url);
		}
		mediaElements.clear();
		compositors.forEach(comp => comp.destroy());
		compositors.clear();
	});

	function getLayerTransform(clip: Clip): string {
		const x = clip.transform?.x ?? 0;
		const y = clip.transform?.y ?? 0;
		const scale = clip.transform?.scale ?? 1;
		const rotation = clip.transform?.rotation ?? 0;
		return `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`;
	}

	function getLayerFilter(clip: Clip): string {
		const filterParts: string[] = [];
		if (clip.filters) {
			if (clip.filters.brightness !== undefined && clip.filters.brightness !== 0) {
				filterParts.push(`brightness(${100 + Number(clip.filters.brightness)}%)`);
			}
			if (clip.filters.contrast !== undefined && clip.filters.contrast !== 0) {
				filterParts.push(`contrast(${100 + Number(clip.filters.contrast)}%)`);
			}
			if (clip.filters.saturate !== undefined && clip.filters.saturate !== 0) {
				filterParts.push(`saturate(${100 + Number(clip.filters.saturate)}%)`);
			}
			if (clip.filters.lut && clip.filters.lut !== 'none') {
				// Inline fast LUT lookup
				const lutFilters: Record<string, string> = {
					teal_orange: 'contrast(1.18) saturate(1.25) hue-rotate(-8deg) sepia(0.12)',
					vintage_film: 'sepia(0.28) contrast(0.95) brightness(1.04) saturate(0.85)',
					cinema_noir: 'grayscale(1) contrast(1.35) brightness(0.92)',
					golden_hour: 'sepia(0.2) saturate(1.3) hue-rotate(-5deg) brightness(1.05)',
					cyber_matrix: 'saturate(1.6) hue-rotate(18deg) contrast(1.22)'
				};
				if (lutFilters[clip.filters.lut]) {
					filterParts.push(lutFilters[clip.filters.lut]);
				}
			}
			if (clip.filters.blur !== undefined && clip.filters.blur !== 0) {
				filterParts.push(`blur(${Number(clip.filters.blur)}px)`);
			}
			if (clip.filters.grayscale !== undefined && clip.filters.grayscale !== 0) {
				filterParts.push(`grayscale(${Number(clip.filters.grayscale)}%)`);
			}
			if (clip.filters.sepia !== undefined && clip.filters.sepia !== 0) {
				filterParts.push(`sepia(${Number(clip.filters.sepia)}%)`);
			}
			if (clip.filters.hueRotate !== undefined && clip.filters.hueRotate !== 0) {
				filterParts.push(`hue-rotate(${Number(clip.filters.hueRotate)}deg)`);
			}
		}
		return filterParts.length > 0 ? filterParts.join(' ') : 'none';
	}

	function getLayerOpacity(clip: Clip): number {
		return clip.filters?.opacity ?? (clip.filters?.alpha ?? 1);
	}

	// Function to create or get a WebGL compositor for a video clip
	function getVideoCompositor(clipId: string): WebGLCompositor {
		if (!compositors.has(clipId)) {
			// Create a new compositor with default size (will be resized later)
			const compositor = new WebGLCompositor();
			compositors.set(clipId, compositor);
		}
		return compositors.get(clipId)!;
	}

	// Function to update the WebGL output URL for a video clip
	async function updateWebglOutput(clipId: string, videoEl: HTMLVideoElement, colorGrade: any): Promise<void> {
		// Revoke the previous URL for this clipId if exists
		const oldUrl = webglUrls.get(clipId);
		if (oldUrl) {
			URL.revokeObjectURL(oldUrl);
		}

		try {
			const compositor = getVideoCompositor(clipId);
			compositor.renderFrame(videoEl, colorGrade);
			const offscreen = compositor.getCanvas() as OffscreenCanvas;
			// Convert OffscreenCanvas to Blob and create object URL
			const blob: Blob = await offscreen.convertToBlob({ type: 'image/png' });
			const url = URL.createObjectURL(blob);
			// Update the reactive map
			webglUrls.set(clipId, url);
		} catch (err) {
			// If WebGL2 is not available, fallback will be used
			console.warn('WebGL2 not available or failed, falling back to CSS filters:', err);
		}
	}
</script>

<div class="video-canvas-stage" role="region" aria-label="Video Canvas Stage">
	<!-- 16:9 Viewport Stage Frame -->
	<div class="stage-viewport-16-9">
		{#if $visualLayers.length > 0}
			{#each $visualLayers as layer (layer.clip.id)}
				{@const url = objectUrls.get(layer.asset.id)}
				{@const webglUrl = webglUrls.get(layer.clip.id)}
				<div
					class="canvas-layer"
					style="transform: {getLayerTransform(layer.clip)}; filter: {getLayerFilter(layer.clip)}; opacity: {getLayerOpacity(layer.clip)}; z-index: {layer.trackOrder};"
				>
					{#if layer.asset.type === 'video'}
						{#if webglUrl}
							<!-- Use WebGL output -->
							<img
								class="canvas-media-element"
								src={webglUrl}
								alt={layer.asset.filename}
							/>
							<!-- Hidden video element for playback and texture source -->
							<video
								style="display: none;"
								use:mediaSync={{ clip: layer.clip, sourceTime: layer.sourceTime }}
								class="canvas-media-element"
								src={url}
								playsinline
								muted={$playbackStore.isMuted || layer.clip.audioParameters?.mute}
							>
								<track kind="captions" />
							</video>
						{:else}
							<!-- Fallback to video element with CSS filters -->
							<video
								use:mediaSync={{ clip: layer.clip, sourceTime: layer.sourceTime }}
								class="canvas-media-element"
								src={url}
								playsinline
								muted={$playbackStore.isMuted || layer.clip.audioParameters?.mute}
							>
								<track kind="captions" />
							</video>
						{/if}
					{:else if layer.asset.type === 'image' && url}
						<img
							class="canvas-media-element"
							src={url}
							alt={layer.asset.filename}
						/>
					{/if}
				</div>
			{/each}
		{:else if $audioLayers.length > 0}
			<div class="audio-stage-visualizer">
				<div class="audio-pulse-ring">
					<span class="audio-icon">🎵</span>
				</div>
				<div class="audio-meta">
					<span class="audio-track-name">{$audioLayers[0].asset.filename}</span>
					<span class="audio-track-status font-mono">Audio Active</span>
				</div>
			</div>
		{:else}
			<div class="empty-stage-state">
				<div class="empty-stage-icon">🎬</div>
				<div class="empty-stage-heading">16:9 Viewport</div>
				<div class="empty-stage-subtext font-mono">
					{$activeSequence ? `${$activeSequence.resolution.width} × ${$activeSequence.resolution.height}` : '1920 × 1080'} • {$activeSequence?.frameRate ?? 30} FPS
				</div>
			</div>
		{/if}

		<!-- Background audio playback for pure audio clips -->
		{#each $audioLayers as audioLayer (audioLayer.clip.id)}
			{@const audioUrl = objectUrls.get(audioLayer.asset.id)}
			{#if audioUrl && audioLayer.asset.type === 'audio'}
				<audio
					use:mediaSync={{ clip: audioLayer.clip, sourceTime: audioLayer.sourceTime }}
					src={audioUrl}
				></audio>
			{/if}
		{/each}
	</div>
</div>

<style>
	.video-canvas-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: #090a0d;
		padding: 12px;
		box-sizing: border-box;
		overflow: hidden;
		position: relative;
	}

	.stage-viewport-16-9 {
		position: relative;
		aspect-ratio: 16 / 9;
		width: 100%;
		max-width: 100%;
		max-height: 100%;
		background: #000000;
		border: 1px solid #1a1d28;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.9), 0 0 0 1px #232738;
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.canvas-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		transform-origin: center center;
	}

	.canvas-media-element {
		max-width: 100%;
		max-height: 100%;
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		user-select: none;
	}

	.audio-stage-visualizer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		color: #94a3b8;
	}

	.audio-pulse-ring {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: rgba(16, 185, 129, 0.12);
		border: 1px solid rgba(16, 185, 129, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
	}

	.audio-icon {
		font-size: 1.75rem;
		color: #10b981;
	}

	.audio-meta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}

	.audio-track-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: #f1f5f9;
	}

	.audio-track-status {
		font-size: 0.7rem;
		color: #34d399;
		letter-spacing: 0.04em;
	}

	.empty-stage-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		user-select: none;
		color: #475569;
	}

	.empty-stage-icon {
		font-size: 2rem;
		opacity: 0.45;
	}

	.empty-stage-heading {
		font-size: 0.82rem;
		font-weight: 600;
		color: #64748b;
		letter-spacing: 0.02em;
	}

	.empty-stage-subtext {
		font-size: 0.7rem;
		color: #475569;
	}

	.font-mono {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
	}
</style>