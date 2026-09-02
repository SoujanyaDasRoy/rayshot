<script lang="ts">
	import Icon from '$lib/features/shell/Icon.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { importMediaFiles } from '$lib/utils/mediaUtils';

	let recordMode = $state<'screen' | 'camera' | 'both'>('screen');
	let isRecording = $state(false);
	let recordSeconds = $state(0);
	let recordTimer: ReturnType<typeof setInterval> | null = null;
	let mediaStream = $state<MediaStream | null>(null);
	let mediaRecorder = $state<MediaRecorder | null>(null);
	let recordedChunks: Blob[] = [];
	let videoPreviewEl = $state<HTMLVideoElement | null>(null);
	let audioMuted = $state(false);
	let selectedResolution = $state<'1080p' | '4k' | '720p'>('1080p');

	async function startPreview() {
		stopStream();
		try {
			if (recordMode === 'camera') {
				mediaStream = await navigator.mediaDevices.getUserMedia({
					video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
					audio: !audioMuted
				});
			} else {
				mediaStream = await navigator.mediaDevices.getDisplayMedia({
					video: { frameRate: 60 },
					audio: !audioMuted
				});
			}
			if (videoPreviewEl && mediaStream) {
				videoPreviewEl.srcObject = mediaStream;
				videoPreviewEl.play().catch(() => {});
			}
		} catch (err) {
			console.warn('Could not start preview:', err);
		}
	}

	function stopStream() {
		if (mediaStream) {
			mediaStream.getTracks().forEach((track) => track.stop());
			mediaStream = null;
		}
		if (videoPreviewEl) {
			videoPreviewEl.srcObject = null;
		}
	}

	async function startRecording() {
		if (!mediaStream) {
			await startPreview();
		}
		if (!mediaStream) return;

		recordedChunks = [];
		try {
			mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm;codecs=vp9,opus' });
		} catch {
			mediaRecorder = new MediaRecorder(mediaStream);
		}

		mediaRecorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) {
				recordedChunks.push(e.data);
			}
		};

		mediaRecorder.onstop = async () => {
			if (recordedChunks.length > 0) {
				const blob = new Blob(recordedChunks, { type: 'video/webm' });
				const file = new File([blob], `RayShot_Recording_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`, {
					type: 'video/webm'
				});
				await importMediaFiles([file], true);
			}
		};

		mediaRecorder.start(1000);
		isRecording = true;
		recordSeconds = 0;
		recordTimer = setInterval(() => {
			recordSeconds++;
		}, 1000);
	}

	function stopRecording() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
		}
		isRecording = false;
		if (recordTimer) {
			clearInterval(recordTimer);
			recordTimer = null;
		}
		stopStream();
	}

	onDestroy(() => {
		stopRecording();
		stopStream();
	});

	function formatTime(s: number): string {
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
	}
</script>

<div class="record-view-container">
	<div class="record-header">
		<div>
			<h1 class="record-title">Recording Studio</h1>
			<p class="record-subtitle">Capture screen recordings, webcam footage, and system audio directly to your media library.</p>
		</div>

		<div class="record-mode-toggle">
			<button
				type="button"
				class="mode-btn"
				class:active={recordMode === 'screen'}
				onclick={() => { recordMode = 'screen'; if (!isRecording) startPreview(); }}
			>
				<Icon name="screen" size={14} />
				<span>Screen</span>
			</button>
			<button
				type="button"
				class="mode-btn"
				class:active={recordMode === 'camera'}
				onclick={() => { recordMode = 'camera'; if (!isRecording) startPreview(); }}
			>
				<Icon name="record" size={14} />
				<span>Camera</span>
			</button>
		</div>
	</div>

	<div class="record-main-workspace">
		<!-- Live Preview Monitor -->
		<div class="preview-monitor-card">
			<div class="monitor-screen">
				{#if mediaStream}
					<video bind:this={videoPreviewEl} autoplay playsinline muted class="video-element"></video>
				{:else}
					<div class="empty-preview">
						<div class="pulse-ring">
							<Icon name={recordMode === 'screen' ? 'screen' : 'record'} size={36} />
						</div>
						<span class="text-sm font-semibold text-white mt-3">
							Ready to record {recordMode === 'screen' ? 'Screen' : 'Camera'}
						</span>
						<span class="text-xs text-on-surface-variant max-w-xs text-center mt-1">
							Click "Start Recording" or preview source to begin capturing footage.
						</span>
					</div>
				{/if}

				{#if isRecording}
					<div class="recording-badge animate-pulse">
						<span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
						<span>REC {formatTime(recordSeconds)}</span>
					</div>
				{/if}
			</div>

			<!-- Recording Controls Toolbar -->
			<div class="recording-controls-bar">
				<div class="flex items-center gap-3">
					<button
						type="button"
						class="mic-toggle-btn"
						class:muted={audioMuted}
						onclick={() => (audioMuted = !audioMuted)}
						title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
					>
						<Icon name={audioMuted ? 'mic-off' : 'mic'} size={18} />
					</button>

					<div class="resolution-select-box">
						<select bind:value={selectedResolution} class="resolution-select">
							<option value="1080p">1080p Full HD (60fps)</option>
							<option value="4k">4K Ultra HD</option>
							<option value="720p">720p HD</option>
						</select>
					</div>
				</div>

				<!-- Main Record Action Button -->
				{#if !isRecording}
					<button type="button" class="btn-start-record" onclick={startRecording}>
						<div class="record-inner-dot"></div>
						<span>Start Recording</span>
					</button>
				{:else}
					<button type="button" class="btn-stop-record" onclick={stopRecording}>
						<div class="stop-inner-square"></div>
						<span>Stop & Save to Library</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.record-view-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: var(--ms-void);
		color: var(--ms-text);
		padding: 24px 32px;
		overflow-y: auto;
		box-sizing: border-box;
	}

	.record-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--ms-material);
		padding-bottom: 16px;
	}

	.record-title {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0 0 4px 0;
	}

	.record-subtitle {
		font-size: 0.8rem;
		color: var(--ms-text-secondary);
		margin: 0;
	}

	.record-mode-toggle {
		display: flex;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 8px;
		padding: 4px;
		gap: 4px;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--ms-text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-btn.active {
		background: var(--ms-text);
		color: var(--ms-void);
		box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
	}

	.record-main-workspace {
		display: flex;
		flex: 1;
		justify-content: center;
		align-items: center;
		min-height: 400px;
	}

	.preview-monitor-card {
		width: 100%;
		max-width: 960px;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
		display: flex;
		flex-direction: column;
	}

	.monitor-screen {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: var(--ms-void);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.video-element {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.empty-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 32px;
	}

	.pulse-ring {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: rgba(139, 92, 246, 0.12);
		border: 1px solid rgba(139, 92, 246, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.recording-badge {
		position: absolute;
		top: 16px;
		left: 16px;
		background: rgba(220, 38, 38, 0.85);
		backdrop-filter: blur(4px);
		color: var(--ms-text);
		padding: 4px 12px;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.recording-controls-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		background: var(--ms-material);
		border-top: 1px solid var(--ms-raised);
	}

	.mic-toggle-btn {
		width: 38px;
		height: 38px;
		border-radius: 8px;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		color: var(--ms-text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mic-toggle-btn.muted {
		color: var(--ms-text-tertiary);
		border-color: rgba(255, 255, 255, 0.27);
	}

	.resolution-select {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		color: var(--ms-text-secondary);
		font-size: 0.8rem;
		padding: 8px 12px;
		outline: none;
		cursor: pointer;
	}

	.btn-start-record {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		background: var(--ms-text);
		border: none;
		border-radius: 8px;
		color: var(--ms-void);
		font-size: 0.85rem;
		font-weight: 700;
		padding: 10px 24px;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4);
	}

	.btn-start-record:hover {
		background: rgba(255, 255, 255, 0.88);
		transform: scale(1.02);
	}

	.record-inner-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ms-text);
	}

	.btn-stop-record {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		background: var(--ms-text);
		border: none;
		border-radius: 8px;
		color: var(--ms-void);
		font-size: 0.85rem;
		font-weight: 700;
		padding: 10px 24px;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
	}

	.stop-inner-square {
		width: 12px;
		height: 12px;
		border-radius: 2px;
		background: var(--ms-text);
	}
</style>
