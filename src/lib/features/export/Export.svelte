<script lang="ts">
	import Icon from '$lib/features/shell/Icon.svelte';
	import { WebGLCompositor } from '$lib/core/rendering/webglCompositor';
	import { toShaderUniforms } from '$lib/core/rendering/colorGradeUniforms';
	import { getLayerFilter, getLayerDrawRect } from '$lib/core/rendering/layerCompositing';
	import { getLayerOpacity } from '$lib/utils/canvasUtils';
	import { Dialog } from 'bits-ui';
	import { projectStore } from '$lib/stores/project.svelte';
	import { exportStore, exportActions } from '$lib/stores/export.svelte';
	import { estimateFileSize, formatFileSize, downloadBlob, sanitizeExportFilename } from '$lib/utils/exportUtils';
	import { derived } from 'svelte/store';
	import type { Clip } from '$lib/types/project';

	let { open = false, onClose = () => {} } = $props<{
		open: boolean;
		onClose: () => void;
	}>();

	const activeSequence = derived(projectStore, ($project) => {
		if (!$project || !$project.activeSequenceId) return null;
		return $project.sequences.find((s) => s.id === $project.activeSequenceId) ?? null;
	});

	const sequenceDuration = derived([activeSequence, projectStore], ([$activeSequence, $project]) => {
		if (!$activeSequence || !$project) return 0;
		let maxEnd = 0;
		for (const track of $activeSequence.tracks) {
			for (const clipId of track.clipInstances) {
				const clip = $project.clips.get(clipId);
				if (clip) {
					const end = clip.timelineStart + clip.timelineDuration;
					if (end > maxEnd) maxEnd = end;
				}
			}
		}
		return maxEnd;
	});

	let fileName = $state('Rayshot_Export_Video');
	let selectedPresetId = $state('1080p30');
	let bitrateQuality = $state(80);

	// Progress/status live in exportStore (not local state) so the sidebar's
	// Export button can show them too, even while this dialog is closed.
	const isExporting = $derived($exportStore.currentExport?.status === 'exporting');
	const exportProgress = $derived($exportStore.currentExport?.progress ?? 0);
	let exportStatusText = $state('');

	const selectedPreset = $derived(
		$exportStore.presets.find((p) => p.id === selectedPresetId) ?? $exportStore.presets[0]
	);
	const estimatedBytes = $derived(estimateFileSize($sequenceDuration, selectedPreset.settings));

	function formatTimecode(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	function handleClose() {
		if (isExporting) return;
		onClose();
	}

	function handleOpenChange(next: boolean) {
		if (!next) handleClose();
	}

	// Same source-time mapping Canvas.svelte uses for live preview.
	function getSourceTime(clip: Clip, timelineTime: number): number {
		const timelineOffset = timelineTime - clip.timelineStart;
		const sourceDuration = clip.sourceOut - clip.sourceIn;
		const timelineDuration = clip.timelineDuration;
		if (timelineDuration <= 0) return clip.sourceIn;
		return clip.sourceIn + (timelineOffset / timelineDuration) * sourceDuration;
	}

	async function startExport() {
		const project = $projectStore;
		const sequence = $activeSequence;
		const duration = $sequenceDuration;

		if (!project || !sequence || duration <= 0) {
			alert('No clips on timeline to export.');
			return;
		}

		const preset = selectedPreset;
		const { width, height, frameRate: fps } = preset.settings;

		exportActions.setCurrentExport(preset.id, project);
		exportActions.setExportStatus('exporting');
		exportStatusText = 'Preparing media...';

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d')!;

		const exportAudioCtx = new AudioContext();
		const audioDestination = exportAudioCtx.createMediaStreamDestination();

		type ElementInfo = { el: HTMLMediaElement | HTMLImageElement; kind: 'video' | 'audio' | 'image' };
		const mediaElements = new Map<string, ElementInfo>();
		const objectUrls: string[] = [];

		try {
			for (const [assetId, asset] of project.assets) {
				if (!asset.sourceBlob) continue;
				const url = URL.createObjectURL(asset.sourceBlob);
				objectUrls.push(url);

				if (asset.type === 'video') {
					const video = document.createElement('video');
					video.src = url;
					video.muted = true; // audio is routed through Web Audio below, not element playback
					video.playsInline = true;
					await new Promise((resolve) => {
						video.onloadedmetadata = () => resolve(true);
						video.onerror = () => resolve(false);
					});
					try {
						exportAudioCtx.createMediaElementSource(video).connect(audioDestination);
					} catch {
						/* ignore — this clip's audio just won't be in the export */
					}
					mediaElements.set(assetId, { el: video, kind: 'video' });
				} else if (asset.type === 'audio') {
					const audioEl = document.createElement('audio');
					audioEl.src = url;
					await new Promise((resolve) => {
						audioEl.onloadedmetadata = () => resolve(true);
						audioEl.onerror = () => resolve(false);
					});
					try {
						exportAudioCtx.createMediaElementSource(audioEl).connect(audioDestination);
					} catch {
						/* ignore */
					}
					mediaElements.set(assetId, { el: audioEl, kind: 'audio' });
				} else if (asset.type === 'image') {
					const img = new Image();
					img.src = url;
					await new Promise((resolve) => {
						img.onload = () => resolve(true);
						img.onerror = () => resolve(false);
					});
					mediaElements.set(assetId, { el: img, kind: 'image' });
				}
			}

			const videoStream = canvas.captureStream(fps);
			const combinedStream = new MediaStream([
				...videoStream.getVideoTracks(),
				...audioDestination.stream.getAudioTracks()
			]);

			let mimeType = 'video/webm;codecs=vp9';
			if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

			const recorder = new MediaRecorder(combinedStream, {
				mimeType,
				videoBitsPerSecond: Math.round(preset.settings.bitrate * 1000 * (bitrateQuality / 100))
			});

			const recordedChunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordedChunks.push(e.data);
			};
			const stopped = new Promise<Blob>((resolve) => {
				recorder.onstop = () => resolve(new Blob(recordedChunks, { type: mimeType }));
			});

			exportStatusText = 'Recording...';
			// Sized to the export preset: a 1920x1080 default would mean scaling
			// every frame of a smaller render, and per-frame cost here is baked
			// into the file as stutter, not just a slower export.
			let exportCompositor: WebGLCompositor | null = null;
			try {
				exportCompositor = new WebGLCompositor(width, height);
			} catch {
				exportCompositor = null;
			}

			recorder.start();

			// Export plays the sequence in real time (like the live preview) so the
			// recorded audio and video share one clock. A dedicated frame-stepped
			// render loop can't do this — real-time playback is what makes a single
			// MediaRecorder capture of canvas + audio stay in sync.
			const sortedTracks = [...sequence.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
			const startPerf = performance.now();

			await new Promise<void>((resolve) => {
				function tick() {
					const currentTime = (performance.now() - startPerf) / 1000;
					if (currentTime >= duration) {
						resolve();
						return;
					}

					exportActions.setExportProgress(Math.min(99, Math.round((currentTime / duration) * 100)));
					exportStatusText = `Recording ${formatTimecode(currentTime)} / ${formatTimecode(duration)}...`;

					ctx.fillStyle = project!.settings?.backgroundColor ?? '#000000';
					ctx.fillRect(0, 0, width, height);

					const activeAssetIds = new Set<string>();
					for (const track of sortedTracks) {
						for (const clipId of track.clipInstances) {
							const clip = project!.clips.get(clipId);
							if (!clip) continue;
							if (currentTime < clip.timelineStart || currentTime >= clip.timelineStart + clip.timelineDuration) {
								continue;
							}

							const info = mediaElements.get(clip.mediaAssetId);
							if (!info) continue;
							activeAssetIds.add(clip.mediaAssetId);

							const sourceTime = getSourceTime(clip, currentTime);
							// 150ms drift tolerance matches Canvas.svelte's live-preview sync.
							if (info.kind === 'video' || info.kind === 'audio') {
								const el = info.el as HTMLMediaElement;
								if (Math.abs(el.currentTime - sourceTime) > 0.15) el.currentTime = sourceTime;
								if (el.paused) el.play().catch(() => {});
							}

							if (info.kind === 'video' || info.kind === 'image') {
								// Same parameters the preview uses, so what you saw is what gets
								// encoded. This was a bare drawImage: no transform, opacity,
								// filter or colour grade reached the exported file at all.
								const rect = getLayerDrawRect(clip, width, height);
								// Video goes through the shader so curves, vignette, grain and
								// per-channel white balance are baked in, not just the CSS subset.
								let source = info.el as CanvasImageSource;
								let gradeInCss = true;
								if (info.kind === 'video' && exportCompositor) {
									try {
										exportCompositor.renderFrame(
											info.el as HTMLVideoElement,
											toShaderUniforms(clip.colorGrade)
										);
										source = exportCompositor.getCanvas() as CanvasImageSource;
										gradeInCss = false;
									} catch {
										// Fall back to the CSS subset rather than dropping the frame.
										exportCompositor = null;
									}
								}
								const cssFilter = getLayerFilter(clip, { colorGradeInCss: gradeInCss });
								ctx.save();
								ctx.globalAlpha = getLayerOpacity(clip);
								ctx.filter = cssFilter;
								if (rect.rotationRad !== 0) {
									ctx.translate(rect.dx + rect.dw / 2, rect.dy + rect.dh / 2);
									ctx.rotate(rect.rotationRad);
									ctx.drawImage(source, -rect.dw / 2, -rect.dh / 2, rect.dw, rect.dh);
								} else {
									ctx.drawImage(source, rect.dx, rect.dy, rect.dw, rect.dh);
								}
								ctx.restore();
							}
						}
					}

					for (const [assetId, info] of mediaElements) {
						if (activeAssetIds.has(assetId) || info.kind === 'image') continue;
						const el = info.el as HTMLMediaElement;
						if (!el.paused) el.pause();
					}

					requestAnimationFrame(tick);
				}
				requestAnimationFrame(tick);
			});

			exportCompositor?.destroy();
			exportCompositor = null;

			exportStatusText = 'Finalizing video file...';
			recorder.stop();
			const finalBlob = await stopped;

			downloadBlob(finalBlob, `${sanitizeExportFilename(fileName)}.webm`);

			exportStatusText = 'Export complete!';
			exportActions.setExportProgress(100);
			exportActions.setExportStatus('completed');
			setTimeout(() => {
				exportActions.clearExport();
				onClose();
			}, 800);
		} catch (err) {
			console.error('Export failed:', err);
			alert('Export error: ' + String(err));
			exportActions.setExportStatus('failed');
			exportActions.clearExport();
		} finally {
			for (const url of objectUrls) URL.revokeObjectURL(url);
			exportAudioCtx.close().catch(() => {});
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-md" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-outline-variant/60 bg-surface-container/95 shadow-2xl flex flex-col overflow-hidden text-on-surface"
		>
			<!-- Modal Header -->
			<div class="px-6 py-4 border-b border-outline-variant/60 flex justify-between items-center bg-surface-container-high/40">
				<div class="flex items-center gap-2">
					<Icon name="library" size={16} />
					<Dialog.Title class="text-lg font-bold text-on-surface">Export Project</Dialog.Title>
				</div>
				<Dialog.Close
					class="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-md hover:bg-surface-container-highest disabled:opacity-40"
					disabled={isExporting}
				>
					<Icon name="close" size={20} />
				</Dialog.Close>
			</div>

			<!-- Modal Body -->
			<div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Left Column: Settings -->
				<div class="space-y-5">
					<div class="space-y-2">
						<label for="export-filename" class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
							File Name
						</label>
						<input
							id="export-filename"
							class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-all"
							type="text"
							bind:value={fileName}
							disabled={isExporting}
						/>
					</div>

					<div class="space-y-2">
						<span class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
							Resolution
						</span>
						<div class="grid grid-cols-3 gap-2">
							{#each $exportStore.presets as preset (preset.id)}
								<button
									type="button"
									class="py-2 rounded-lg text-xs font-medium border transition-colors {selectedPresetId === preset.id
										? 'bg-primary-container/20 border-primary text-primary font-bold'
										: 'bg-surface-container-highest border-outline-variant hover:bg-surface-bright'}"
									disabled={isExporting}
									onclick={() => (selectedPresetId = preset.id)}
								>
									{preset.name}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-2">
						<span class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
							Format
						</span>
						<div class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface-variant">
							WebM (VP9) — the only format browsers can reliably produce client-side
						</div>
					</div>

					<div class="space-y-2">
						<div class="flex justify-between items-center">
							<label for="export-bitrate" class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
								Quality (Bitrate)
							</label>
							<span class="text-xs font-mono text-primary font-bold">
								{bitrateQuality > 75 ? 'High' : bitrateQuality > 40 ? 'Medium' : 'Low'}
							</span>
						</div>
						<input
							id="export-bitrate"
							type="range"
							min="10"
							max="100"
							bind:value={bitrateQuality}
							disabled={isExporting}
							class="w-full accent-primary bg-surface-container-highest"
						/>
						<div class="flex justify-between text-[10px] text-on-surface-variant opacity-70">
							<span>Smaller File</span>
							<span>Better Quality</span>
						</div>
					</div>
				</div>

				<!-- Right Column: Preview & Status -->
				<div class="flex flex-col justify-between">
					<div class="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden relative p-4 flex flex-col items-center justify-center min-h-40">
						<Icon name="library" size={36} />
						<div class="flex items-center gap-2 text-xs text-on-surface-variant font-mono">
							<Icon name="clock" size={14} />
							<span>{formatTimecode($sequenceDuration)}</span>
							<span class="mx-1">•</span>
							<span>~{formatFileSize(estimatedBytes)}</span>
						</div>
						<div class="text-[11px] text-outline mt-1 font-mono">
							{selectedPreset.settings.width} × {selectedPreset.settings.height} @ {selectedPreset.settings.frameRate}fps
						</div>
					</div>

					{#if isExporting}
						<div class="bg-surface-container-highest/60 rounded-lg p-4 border border-outline-variant/60 space-y-2">
							<div class="flex justify-between items-center text-xs font-semibold">
								<span class="text-primary animate-pulse">{exportStatusText}</span>
								<span class="text-primary font-mono">{exportProgress}%</span>
							</div>
							<div class="w-full bg-surface-container rounded-full h-2 overflow-hidden">
								<div class="bg-primary h-full rounded-full transition-all duration-200" style="width: {exportProgress}%"></div>
							</div>
						</div>
					{:else}
						<div class="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/40">
							<button
								type="button"
								class="px-4 py-2 rounded-lg text-xs font-medium border border-outline-variant hover:bg-surface-container-highest text-on-surface-variant transition-colors"
								onclick={handleClose}
							>
								Cancel
							</button>
							<button
								type="button"
								class="px-5 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-fixed-dim transition-colors shadow-lg shadow-primary/20 flex items-center gap-1.5 disabled:opacity-40"
								disabled={$sequenceDuration <= 0}
								onclick={startExport}
							>
								<Icon name="import" size={16} />
								Export Video
							</button>
						</div>
					{/if}
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
