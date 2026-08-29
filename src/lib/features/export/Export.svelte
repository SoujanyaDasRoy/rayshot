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

	const presets = [
		{ name: '1080p Full HD (16:9)', width: 1920, height: 1080, fps: 30 },
		{ name: '720p HD (16:9)', width: 1280, height: 720, fps: 30 },
		{ name: 'Instagram Square (1:1)', width: 1080, height: 1080, fps: 30 },
		{ name: 'TikTok / Shorts (9:16)', width: 1080, height: 1920, fps: 30 }
	];

	let selectedPreset = $state(presets[0]);
	let isExporting = $state(false);
	let exportProgress = $state(0);
	let exportStatusText = $state('');

	function handleClose() {
		if (isExporting) return;
		onClose();
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
			const width = selectedPreset.width;
			const height = selectedPreset.height;
			const fps = selectedPreset.fps;

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d')!;

			const stream = canvas.captureStream(fps);
			let mimeType = 'video/webm;codecs=vp9';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'video/webm';
			}

			const recorder = new MediaRecorder(stream, {
				mimeType,
				videoBitsPerSecond: 8_000_000
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

			const totalFrames = Math.ceil(duration * fps);
			const frameDuration = 1 / fps;

			for (let frame = 0; frame < totalFrames; frame++) {
				const currentTime = frame * frameDuration;
				exportProgress = Math.round((frame / totalFrames) * 100);
				exportStatusText = `Rendering frame ${frame + 1} of ${totalFrames} (${exportProgress}%)...`;

				ctx.fillStyle = project.settings?.backgroundColor ?? '#000000';
				ctx.fillRect(0, 0, width, height);

				for (const track of sequence.tracks) {
					for (const clipId of track.clipInstances) {
						const clip = project.clips.get(clipId);
						if (!clip) continue;

						if (currentTime >= clip.timelineStart && currentTime < clip.timelineStart + clip.timelineDuration) {
							const elem = mediaElements.get(clip.mediaAssetId);
							if (!elem) continue;

							const timelineOffset = currentTime - clip.timelineStart;
							const sourceTime = clip.sourceIn + (timelineOffset / clip.timelineDuration) * (clip.sourceOut - clip.sourceIn);

							if (elem instanceof HTMLVideoElement) {
								elem.currentTime = sourceTime;
								await new Promise((r) => {
									elem.onseeked = () => r(true);
									setTimeout(r, 40);
								});
								ctx.save();
								if (clip.filters?.brightness) {
									ctx.filter = `brightness(${100 + clip.filters.brightness}%)`;
								}
								ctx.drawImage(elem, 0, 0, width, height);
								ctx.restore();
							} else if (elem instanceof HTMLImageElement) {
								ctx.save();
								if (clip.filters?.brightness) {
									ctx.filter = `brightness(${100 + clip.filters.brightness}%)`;
								}
								ctx.drawImage(elem, 0, 0, width, height);
								ctx.restore();
							}
						}
					}
				}

				if (frame % 5 === 0) {
					await new Promise((r) => setTimeout(r, 5));
				}
			}

			exportStatusText = 'Finalizing video...';
			recorder.stop();

			const finalBlob = await exportPromise;
			const downloadUrl = URL.createObjectURL(finalBlob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_export.webm`;
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
		} catch (err) {
			console.error('Export failed:', err);
			alert('Export error: ' + String(err));
			isExporting = false;
		}
	}
</script>

{#if open}
	<div class="modal-backdrop" onclick={handleClose} role="presentation">
		<div
			class="modal-card"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<span class="modal-title">Export Video</span>
				<button class="close-btn" disabled={isExporting} onclick={handleClose}>✕</button>
			</div>

			<div class="modal-body">
				{#if isExporting}
					<div class="export-status">
						<div class="status-label">{exportStatusText}</div>
						<div class="progress-track">
							<div class="progress-bar" style="width: {exportProgress}%;"></div>
						</div>
					</div>
				{:else}
					<div class="form-group">
						<label for="preset-select">Export Preset</label>
						<select id="preset-select" bind:value={selectedPreset}>
							{#each presets as preset}
								<option value={preset}>{preset.name}</option>
							{/each}
						</select>
					</div>

					<div class="preset-meta-grid">
						<div class="meta-item">
							<span class="meta-lbl">Resolution</span>
							<span class="meta-val font-mono">{selectedPreset.width} × {selectedPreset.height}</span>
						</div>
						<div class="meta-item">
							<span class="meta-lbl">Frame Rate</span>
							<span class="meta-val font-mono">{selectedPreset.fps} FPS</span>
						</div>
						<div class="meta-item">
							<span class="meta-lbl">Format</span>
							<span class="meta-val">WebM (VP9)</span>
						</div>
						<div class="meta-item">
							<span class="meta-lbl">Duration</span>
							<span class="meta-val font-mono">{$sequenceDuration.toFixed(1)}s</span>
						</div>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="cancel-btn" disabled={isExporting} onclick={handleClose}>Cancel</button>
				<button class="submit-btn" disabled={isExporting || $sequenceDuration <= 0} onclick={startExport}>
					{isExporting ? 'Exporting...' : 'Export'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-card {
		background: #111216;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		width: 400px;
		max-width: 90vw;
		box-shadow: 0 20px 48px rgba(0, 0, 0, 0.8);
		overflow: hidden;
		color: #e2e8f0;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #15161c;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.modal-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: #f8fafc;
	}

	.close-btn {
		background: none;
		border: none;
		color: #64748b;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 2px;
	}

	.close-btn:hover {
		color: #fff;
	}

	.modal-body {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.form-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #94a3b8;
	}

	.form-group select {
		background: #161820;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #f1f5f9;
		padding: 6px 10px;
		border-radius: 5px;
		font-size: 0.8rem;
		cursor: pointer;
		outline: none;
	}

	.preset-meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		background: #15161b;
		padding: 10px;
		border-radius: 5px;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.meta-lbl {
		font-size: 0.65rem;
		color: #64748b;
		text-transform: uppercase;
		font-weight: 600;
	}

	.meta-val {
		font-size: 0.75rem;
		color: #cbd5e1;
	}

	.font-mono {
		font-family: monospace;
	}

	.export-status {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 0;
	}

	.status-label {
		font-size: 0.75rem;
		color: #94a3b8;
	}

	.progress-track {
		width: 100%;
		height: 4px;
		background: #181920;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: #3b82f6;
		transition: width 0.15s ease;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 16px;
		background: #131418;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.cancel-btn {
		background: #1a1b22;
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #cbd5e1;
		padding: 5px 12px;
		border-radius: 5px;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.submit-btn {
		background: #2563eb;
		border: 1px solid #3b82f6;
		color: white;
		padding: 5px 14px;
		border-radius: 5px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.submit-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>