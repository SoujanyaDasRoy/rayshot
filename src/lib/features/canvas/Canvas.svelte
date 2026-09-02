<script lang="ts">
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { derived } from 'svelte/store';
	import { onDestroy, untrack } from 'svelte';
	import type { Clip, MediaAsset } from '$lib/types/project';
	import { audioEngine } from '$lib/core/audioEngine';
	import { WebGLCompositor } from '$lib/core/rendering/webglCompositor';
	import { toShaderUniforms } from '$lib/core/rendering/colorGradeUniforms';
	// Shared with the exporter so preview and output cannot drift.
	import { getLayerFilter } from '$lib/core/rendering/layerCompositing';
	import { getLayerOpacity } from '$lib/utils/canvasUtils';

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

	// One compositor for the whole component, not one per clip: each is a live
	// WebGL context and browsers cap those around 16. Canvas elements are
	// registered per clip and the compositor renders into whichever is active.
	let compositor: WebGLCompositor | null = null;
	let webglUnavailable = $state(false);
	const glCanvases = new Map<string, HTMLCanvasElement>();
	// Clips the shader has actually painted at least once. Until then CSS keeps
	// carrying the grade, so there is never a frame where neither path applies
	// it — which is what happens for media that never decodes.
	let glRendered = $state<Set<string>>(new Set());

	$effect(() => {
		const layers = $activeLayers;
		const currentMap = untrack(() => new Map(objectUrls));
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
					renderWebgl(layer.clip.id, el as HTMLVideoElement, layer.clip);
				}
			}
		}
	});

	onDestroy(() => {
		for (const url of objectUrls.values()) {
			URL.revokeObjectURL(url);
		}
		mediaElements.clear();
		compositor?.destroy();
		compositor = null;
		glCanvases.clear();
	});

	function getLayerTransform(clip: Clip): string {
		const x = clip.transform?.x ?? 0;
		const y = clip.transform?.y ?? 0;
		const scale = clip.transform?.scale ?? 1;
		const rotation = clip.transform?.rotation ?? 0;
		return `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`;
	}


	/**
	 * Register the visible <canvas> a clip renders into. The compositor draws
	 * straight to it — the old path went OffscreenCanvas -> convertToBlob ->
	 * object URL -> <img>, i.e. a full-resolution PNG encode per layer per
	 * frame, into a $state(new Map()) that Svelte 5 does not proxy, so the
	 * result never displayed anyway.
	 */
	function glCanvas(node: HTMLCanvasElement, clipId: string) {
		glCanvases.set(clipId, node);
		return {
			destroy() {
					glCanvases.delete(clipId);
				if (glRendered.has(clipId)) {
					const next = new Set(glRendered);
					next.delete(clipId);
					glRendered = next;
				}
			}
		};
	}

	/**
	 * Drive GL renders from the decoder, not from the store.
	 *
	 * Setting video.currentTime and rendering in the same tick paints the
	 * *previous* frame, because the decoder has not produced the new one yet.
	 * That is invisible while a <video> paints itself, but very visible once
	 * we are copying its texture. requestVideoFrameCallback fires exactly when
	 * a new frame is ready; 'seeked' covers paused scrubbing.
	 */
	function glSource(node: HTMLVideoElement, params: { clipId: string; clip: Clip }) {
		let current = params;
		let handle = 0;
		type RVFC = HTMLVideoElement & {
			requestVideoFrameCallback?: (cb: () => void) => number;
			cancelVideoFrameCallback?: (h: number) => void;
		};
		const v = node as RVFC;

		const draw = () => renderWebgl(current.clipId, node, current.clip);

		const pump = () => {
			draw();
			if (v.requestVideoFrameCallback) handle = v.requestVideoFrameCallback(pump);
		};

		if (v.requestVideoFrameCallback) {
			handle = v.requestVideoFrameCallback(pump);
		}
		node.addEventListener('seeked', draw);
		node.addEventListener('loadeddata', draw);

		return {
			update(next: { clipId: string; clip: Clip }) {
				current = next;
				draw();
			},
			destroy() {
				if (handle && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
				node.removeEventListener('seeked', draw);
				node.removeEventListener('loadeddata', draw);
			}
		};
	}

	function renderWebgl(clipId: string, videoEl: HTMLVideoElement, clip: Clip): void {
		if (webglUnavailable) return;
		const target = glCanvases.get(clipId);
		if (!target || videoEl.readyState < 2) return;

		try {
			if (!compositor) {
				const res = $activeSequence?.resolution;
				compositor = new WebGLCompositor(res?.width ?? 1920, res?.height ?? 1080, target);
			}
			compositor.renderFrame(videoEl, toShaderUniforms(clip.colorGrade));
			if (!glRendered.has(clipId)) {
				glRendered = new Set(glRendered).add(clipId);
			}
		} catch (e) {
			// No WebGL2, or the context was lost: fall back to the CSS path,
			// which is a real path in its own right (it serves image layers too).
			console.warn('WebGL compositing unavailable, using CSS filters', e);
			webglUnavailable = true;
			compositor = null;
			glRendered = new Set();
		}
	}
</script>

<div class="video-canvas-stage" role="region" aria-label="Video Canvas Stage">
	<!-- 16:9 Viewport Stage Frame -->
	<div class="stage-viewport-16-9">
		{#if $visualLayers.length > 0}
			{#each $visualLayers as layer (layer.clip.id)}
				{@const url = objectUrls.get(layer.asset.id)}
				{@const gradeInCss =
					webglUnavailable ||
					layer.asset.type !== 'video' ||
					!glRendered.has(layer.clip.id)}
				<div
					class="canvas-layer"
					style="transform: {getLayerTransform(layer.clip)}; filter: {getLayerFilter(layer.clip, { colorGradeInCss: gradeInCss })}; opacity: {getLayerOpacity(layer.clip)}; z-index: {layer.trackOrder};"
				>
					{#if !layer.asset.sourceBlob}
						<!-- Bytes are gone (imported on another device, or evicted from
						     the cache). Say so instead of rendering an empty frame. -->
						<div class="media-offline">
							<span class="media-offline-title">Media offline</span>
							<span class="media-offline-name">{layer.asset.filename}</span>
						</div>
					{:else if layer.asset.type === 'video'}
						{#if webglUnavailable}
							<!-- Genuine fallback: no WebGL2, or the context was lost.
							     CSS filters carry the expressible part of the grade. -->
							<video
								use:mediaSync={{ clip: layer.clip, sourceTime: layer.sourceTime }}
								class="canvas-media-element"
								src={url}
								playsinline
								muted={$playbackStore.isMuted || layer.clip.audioParameters?.mute}
							>
								<track kind="captions" />
							</video>
						{:else}
							<canvas class="canvas-media-element" use:glCanvas={layer.clip.id}></canvas>
							<!-- Decodes and drives audio; the canvas above is what you see. -->
							<video
								style="display: none;"
								use:mediaSync={{ clip: layer.clip, sourceTime: layer.sourceTime }}
								use:glSource={{ clipId: layer.clip.id, clip: layer.clip }}
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
					<span class="audio-icon"><span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg></span></span>
				</div>
				<div class="audio-meta">
					<span class="audio-track-name">{$audioLayers[0].asset.filename}</span>
					<span class="audio-track-status font-mono">Audio Active</span>
				</div>
			</div>
		{:else}
			<div class="empty-stage-state">
				<div class="empty-stage-icon"><span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="m3 11 18 0M7 7 5 11M12 7l-2 4M17 7l-2 4"/></svg></span></div>
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
	/* Emoji are not an icon set: they render differently per platform and
	   carry colour we do not want. Inline SVG on the same 24x24 grid. */
	.ui-glyph {
		display: inline-flex;
		width: 1em;
		height: 1em;
		vertical-align: -0.125em;
	}

	.ui-glyph svg {
		width: 100%;
		height: 100%;
	}

	.video-canvas-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: var(--ms-void);
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
		border: 1px solid var(--ms-edge);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--ms-edge);
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

	/* Monochrome and quiet — a missing file is a state to report, not an alarm. */
	.media-offline {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 14px 20px;
		border: 1px dashed var(--ms-edge-strong);
		border-radius: var(--ms-radius);
		background: var(--ms-material);
		font-family: var(--ms-font);
		text-align: center;
	}

	.media-offline-title {
		font-size: 12px;
		font-weight: 590;
		color: var(--ms-text-secondary);
	}

	.media-offline-name {
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11px;
		color: var(--ms-text-tertiary);
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
		color: var(--ms-text-secondary);
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
		color: var(--ms-text-secondary);
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
		color: var(--ms-text);
	}

	.audio-track-status {
		font-size: 0.7rem;
		color: var(--ms-text-secondary);
		letter-spacing: 0.04em;
	}

	.empty-stage-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		user-select: none;
		color: var(--ms-edge-strong);
	}

	.empty-stage-icon {
		font-size: 2rem;
		opacity: 0.45;
	}

	.empty-stage-heading {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--ms-text-tertiary);
		letter-spacing: 0.02em;
	}

	.empty-stage-subtext {
		font-size: 0.7rem;
		color: var(--ms-edge-strong);
	}

	.font-mono {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
	}
</style>