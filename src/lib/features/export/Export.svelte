<script lang="ts">
	import { projectStore } from '$lib/stores/project.svelte';
	import { derived } from 'svelte/store';

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
	let resolutionMode = $state<'1080p' | '4k' | 'custom'>('1080p');
	let exportFormat = $state('webm');
	let frameRate = $state(30);
	let bitrateQuality = $state(80);

	let isExporting = $state(false);
	let exportProgress = $state(0);
	let exportStatusText = $state('');

	const computedWidth = $derived(resolutionMode === '4k' ? 3840 : 1920);
	const computedHeight = $derived(resolutionMode === '4k' ? 2160 : 1080);
	const estimatedMB = $derived(Math.max(5, Math.round(($sequenceDuration * (bitrateQuality / 100) * 15))));

	function formatTimecode(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	function handleClose() {
		if (isExporting) return;
		onClose();
	}

	// Helper function to compute source time from timeline time (same as in Canvas.svelte)
	function getSourceTime(clip: any, timelineTime: number): number {
		const timelineOffset = timelineTime - clip.timelineStart;
		const sourceDuration = clip.sourceOut - clip.sourceIn;
		const timelineDuration = clip.timelineDuration;
		if (timelineDuration <= 0) return clip.sourceIn;
		return clip.sourceIn + (timelineOffset / timelineDuration) * sourceDuration;
	}

	// Helper function to wait for a video to seek to a target time (with timeout)
	function waitForSeek(video: HTMLVideoElement, targetTime: number, timeout = 200): Promise<void> {
		return new Promise((resolve, reject) => {
			const start = performance.now();
			const check = () => {
				if (Math.abs(video.currentTime - targetTime) < 0.15) {
					resolve();
					return;
				}
				if (performance.now() - start > timeout) {
					reject(new Error('Seek timeout'));
					return;
				}
				requestAnimationFrame(check);
			};
			check();
		});
	}

	async function startExport() {
		const project = $projectStore;
		const sequence = $activeSequence;
		const duration = $sequenceDuration;

		if (!project || !sequence || duration <= 0) {
			alert('No clips on timeline to export.');
			return;
		}

		isExporting = true;
		exportProgress = 0;
		exportStatusText = 'Preparing canvas & encoders...';

		try {
			const width = computedWidth;
			const height = computedHeight;
			const fps = frameRate;

			const canvas = document.createElement('canvas');
			canvas.width = width;
			// Removed erroneous assignment
			// Fixing it:
			canvas.height = height;
			const ctx = canvas.getContext('2d')!;

			const stream = canvas.captureStream(fps);
			let mimeType = 'video/webm;codecs=vp9';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'video/webm';
			}

			const recorder = new MediaRecorder(stream, {
				mimeType,
				videoBitsPerSecond: Math.round((bitrateQuality / 100) * 12_000_000)
			});

			const recordedChunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordedChunks.push(e.data);
			};

			const exportPromise = new Promise<Blob>((resolve, reject) => {
				recorder.onstop = () => {
					const blob = new Blob(recordedChunks, { type: mimeType });
					resolve(blob);
				};
				recorder.onerror = (e) => reject(e);
			});

			recorder.start();

			// Prepare media elements in memory
			const mediaElements = new Map<string, HTMLVideoElement | HTMLImageElement>();
			for (const [assetId, asset] of project.assets) {
				if (asset.sourceBlob) {
					const url = URL.createObjectURL(asset.sourceBlob);
					if (asset.type === 'video') {
						const video = document.createElement('video');
						video.src = url;
						video.muted = true;
						video.playsInline = true;
						await new Promise((r) => {
							video.onloadedmetadata = () => r(true);
							video.onerror = () => r(false);
						});
						mediaElements.set(assetId, video);
					} else if (asset.type === 'image') {
						const img = new Image();
						img.src = url;
						await new Promise((r) => {
							img.onload = () => r(true);
							img.onerror = () => r(false);
						});
						mediaElements.set(assetId, img);
					}
				}
			}

			// Map for WebGLCompositors (keyed by clip id)
			const compositors = new Map<string, any>(); // We'll import the type later if needed, but for now use any

			const totalFrames = Math.ceil(duration * fps);
			const frameDuration = 1 / fps;

			for (let frame = 0; frame < totalFrames; frame++) {
				const currentTime = frame * frameDuration;
				exportProgress = Math.round((frame / totalFrames) * 100);
				exportStatusText = `Rendering frame ${frame + 1} of ${totalFrames} (${exportProgress}%)...`;

				// Clear canvas with background color
				ctx.fillStyle = project.settings?.backgroundColor ?? '#000000';
				ctx.fillRect(0, 0, width, height);

				// Process each track in order of track.order (ascending)
				const sortedTracks = [...sequence.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
				for (const track of sortedTracks) {
					for (const clipId of track.clipInstances) {
						const clip = project.clips.get(clipId);
						if (!clip) continue;

						if (currentTime >= clip.timelineStart && currentTime < clip.timelineStart + clip.timelineDuration) {
							const sourceTime = getSourceTime(clip, currentTime);
							const elem = mediaElements.get(clip.mediaAssetId);
							if (!elem) continue;

							try {
								if (elem instanceof HTMLVideoElement) {
									// Get or create WebGLCompositor for this clip
									let compositor = compositors.get(clip.id);
									if (!compositor) {
										// Dynamically import the WebGLCompositor class
										const { WebGLCompositor } = await import('$lib/core/rendering/webglCompositor');
										compositor = new WebGLCompositor(width, height);
										compositor.resize(width, height); // Ensure it matches export size
										compositors.set(clip.id, compositor);
									}

									// Set video current time and wait for seek
									elem.currentTime = sourceTime;
									await waitForSeek(elem, sourceTime);

									// Build color grade from clip filters (matching Canvas.svelte)
									const colorGrade = {
										exposure: 0,
										contrast: ((clip.filters?.contrast ?? 0) / 100.0) - 1.0,
										highlights: 0,
										shadows: 0,
										temperature: 0,
										tint: 0,
										saturation: ((clip.filters?.saturate ?? 0) / 100.0) - 1.0,
										vibrance: 0,
										vignette: 0,
										grain: 0,
										curves: clip.filters?.curves ?? [[0, 0], [0.5, 0.5], [1, 1]],
										lutTexture: null
									};

									// Render frame with WebGLCompositor
									compositor.renderFrame(elem, colorGrade);
									const offscreen = compositor.getCanvas();
									const imageBitmap = await offscreen.transferToImageBitmap();

									// Draw the ImageBitmap onto the export canvas
									ctx.drawImage(imageBitmap, 0, 0, width, height);
								} else if (elem instanceof HTMLImageElement) {
									// For images, draw directly (no WebGL processing)
									ctx.drawImage(elem, 0, 0, width, height);
								}
							} catch (err) {
								console.warn('WebGL processing failed, falling back to 2D canvas:', err);
								// Fallback to original 2D drawing method for this frame
								ctx.fillStyle = project.settings?.backgroundColor ?? '#000000';
								ctx.fillRect(0, 0, width, height);
								// Redraw all layers up to this point using the original method?
							 // For simplicity, we'll just redraw this layer in 2D and continue
								if (elem instanceof HTMLVideoElement) {
									elem.currentTime = sourceTime;
									await waitForSeek(elem, sourceTime);
									ctx.save();
									if (clip.filters?.brightness) {
										ctx.filter = `brightness(${100 + clip.filters.brightness}%)`;
									}
									ctx.drawImage(elem, 0, 0, width, height);
									ctx.restore();
								} else if (elem instanceof HTMLImageElement) {
									ctx.drawImage(elem, 0, 0, width, height);
								}
							}
						}
					}
				}

				// Yield occasionally to avoid blocking the main thread too long
				if (frame % 5 === 0) {
					await new Promise((r) => setTimeout(r, 5));
				}
			}

			exportStatusText = 'Finalizing video file...';
			recorder.stop();

			const finalBlob = await exportPromise;
			const downloadUrl = URL.createObjectURL(finalBlob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			const sanitizedName = (fileName || 'rayshot_export').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
			a.download = `${sanitizedName}.${exportFormat}`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(downloadUrl);

			exportStatusText = 'Export complete!';
			exportProgress = 100;
			setTimeout(() => {
				isExporting = false;
				onClose();
			}, 800);

			// Clean up WebGLCompositors
			compositors.forEach(comp => comp.destroy());
			compositors.clear();
		} catch (err) {
			console.error('Export failed:', err);
			alert('Export error: ' + String(err));
			isExporting = false;
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
		onclick={handleClose}
		role="presentation"
	>
		<div
			class="bg-surface-container/95 border border-outline-variant/60 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden text-on-surface"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<!-- Modal Header -->
			<div class="px-6 py-4 border-b border-outline-variant/60 flex justify-between items-center bg-surface-container-high/40">
				<div class="flex items-center gap-2">
					<span class="material-symbols-outlined text-primary">movie</span>
					<h2 class="text-lg font-bold text-on-surface">Export Project</h2>
				</div>
				<button
					class="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-md hover:bg-surface-container-highest"
					disabled={isExporting}
					onclick={handleClose}
				>
					<span class="material-symbols-outlined text-xl">close</span>
				</button>
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
						<label class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
							Resolution
						</label>
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								class="py-2 rounded-lg text-xs font-medium border transition-colors {resolutionMode === '1080p'
									? 'bg-primary-container/20 border-primary text-primary font-bold'
									: 'bg-surface-container-highest border-outline-variant hover:bg-surface-bright'}"
								disabled={isExporting}
								onclick={() => (resolutionMode = '1080p')}
							>
								1080p
							</button>
							<button
								type="button"
								class="py-2 rounded-lg text-xs font-medium border transition-colors {resolutionMode === '4k'
									? 'bg-primary-container/20 border-primary text-primary font-bold'
									: 'bg-surface-container-highest border-outline-variant hover:bg-surface-bright'}"
								disabled={isExporting}
								onclick={() => (resolutionMode = '4k')}
							>
								4K UHD
							</button>
							<button
								type="button"
								class="py-2 rounded-lg text-xs font-medium border transition-colors {resolutionMode === 'custom'
									? 'bg-primary-container/20 border-primary text-primary font-bold'
									: 'bg-surface-container-highest border-outline-variant hover:bg-surface-bright'}"
								disabled={isExporting}
								onclick={() => (resolutionMode = 'custom')}
							>
								Custom
							</button>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<label for="export-format" class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
								Format
							</label>
							<select
								id="export-format"
								class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
								bind:value={exportFormat}
								disabled={isExporting}
							>
								<option value="webm">WEBM (VP9)</option>
								<option value="mp4">MP4 (H.264)</option>
							</select>
						</div>
						<div class="space-y-2">
							<label for="export-fps" class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
								Frame Rate
							</label>
							<select
								id="export-fps"
								class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
								bind:value={frameRate}
								disabled={isExporting}
							>
								<option value={60}>60 fps</option>
								<option value={30}>30 fps</option>
								<option value={24}>24 fps</option>
							</select>
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
						input
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
					<!-- Preview Thumbnail card -->
					<div class="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden relative p-4 flex flex-col items-center justify-center min-h-[160px]">
						<span class="material-symbols-outlined text-4xl text-primary/70 mb-2">video_library</span>
						<div class="flex items-center gap-2 text-xs text-on-surface-variant font-mono">
							<span class="material-symbols-outlined text-sm">schedule</span>
							<span>{formatTimecode($sequenceDuration)}</span>
							<span class="mx-1">•</span>
							<span>~{estimatedMB} MB</span>
						</div>
						<div class="text-[11px] text-outline mt-1 font-mono">
							{computedWidth} × {computedHeight} @ {frameRate}fps
						</div>
					</div>

					<!-- Status & Actions -->
					{#if isExporting}
						<div class="bg-surface-container-highest/60 rounded-lg p-4 border border-outline-variant/60 space-y-2">
							<div class="flex justify-between items-center text-xs font-semibold">
								<span class="text-primary animate-pulse">{exportStatusText}</span>
								<span class="text-primary font-mono">{exportProgress}%</span>
							</div>
							<div class="w-full bg-surface-container rounded-full h-2 overflow-hidden">
								<div
									class="bg-primary h-full rounded-full transition-all duration-200"
									style="width: {exportProgress}%"
								></div>
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
								<span class="material-symbols-outlined text-base">download</span>
								Export Video
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}