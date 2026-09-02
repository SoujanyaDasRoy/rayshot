<script lang="ts">
	import { playbackStore, playbackActions, setMaxDuration } from '$lib/stores/playback.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { derived } from 'svelte/store';

	const activeSequence = derived(projectStore, ($project) => {
		if (!$project || !$project.activeSequenceId) return null;
		return $project.sequences.find((s) => s.id === $project.activeSequenceId) ?? null;
	});

	const durationStore = derived([activeSequence, projectStore], ([$activeSequence, $project]) => {
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

	$effect(() => {
		setMaxDuration($durationStore);
	});

	// Friendly time readout formatted as 00:04 / 00:30 (clean minutes:seconds without noisy SMPTE frame counts by default)
	function formatFriendlyTime(seconds: number): string {
		const totalSecs = Math.max(0, Math.floor(seconds));
		const hrs = Math.floor(totalSecs / 3600);
		const mins = Math.floor((totalSecs % 3600) / 60);
		const secs = totalSecs % 60;
		const pad = (n: number) => n.toString().padStart(2, '0');
		if (hrs > 0) {
			return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
		}
		return `${pad(mins)}:${pad(secs)}`;
	}

	function handleSeek(e: Event) {
		const val = parseFloat((e.target as HTMLInputElement).value);
		playbackActions.setCurrentTime(val);
	}

	function handleVolumeChange(e: Event) {
		const val = parseFloat((e.target as HTMLInputElement).value);
		playbackActions.setMasterVolume(val);
		if ($playbackStore.isMuted && val > 0) {
			playbackActions.setMuted(false);
		}
	}

	let isFullscreen = $state(false);

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			const container = document.querySelector('.center-canvas-col') || document.documentElement;
			container.requestFullscreen().then(() => {
				isFullscreen = true;
			}).catch(() => {
				isFullscreen = false;
			});
		} else {
			document.exitFullscreen().then(() => {
				isFullscreen = false;
			}).catch(() => {});
		}
	}

	let showVolumeSlider = $state(false);

	const progressPercent = derived([playbackStore, durationStore], ([$playback, $duration]) => {
		if ($duration <= 0) return 0;
		return Math.min(100, Math.max(0, ($playback.currentTime / $duration) * 100));
	});
</script>

<div class="player-controls-container" role="toolbar" aria-label="Video Player Controls">
	<!-- Interactive Blue Scrub Bar (var(--ms-text)) with Drag-to-Seek -->
	<div class="progress-bar-wrapper">
		<input
			type="range"
			min="0"
			max={$durationStore > 0 ? $durationStore : 10}
			step="0.01"
			value={$playbackStore.currentTime}
			oninput={handleSeek}
			aria-label="Seek Video"
			class="video-seek-slider"
			style="--progress-percent: {$progressPercent}%;"
		/>
	</div>

	<!-- Floating Transport Bar Strip -->
	<div class="player-bottom-strip">
		<!-- Left: Friendly Time Readout (00:04 / 00:30) -->
		<div class="timecode-readout font-mono">
			<span class="curr-time">{formatFriendlyTime($playbackStore.currentTime)}</span>
			<span class="time-sep">/</span>
			<span class="total-dur">{formatFriendlyTime($durationStore)}</span>
		</div>

		<!-- Center: Primary Playback & Frame Stepping Controls -->
		<div class="transport-buttons">
			<button
				class="ctrl-icon-btn"
				title="Jump to Start (Home)"
				onclick={() => playbackActions.setCurrentTime(0)}
				aria-label="Jump to Start"
			>
				⏮
			</button>

			<button
				class="ctrl-icon-btn"
				title="Previous Frame (◀)"
				onclick={() => playbackActions.stepFrames(-1)}
				aria-label="Previous Frame"
			>
				◀
			</button>

			<!-- Primary Play/Pause Toggle with Smooth Transition -->
			<button
				class="master-play-btn"
				class:playing={$playbackStore.isPlaying}
				title={$playbackStore.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
				onclick={() => playbackActions.togglePlayback()}
				aria-label={$playbackStore.isPlaying ? 'Pause' : 'Play'}
			>
				<span class="play-icon">
					{#if $playbackStore.isPlaying}
						⏸
					{:else}
						▶
					{/if}
				</span>
			</button>

			<button
				class="ctrl-icon-btn"
				title="Next Frame (▶)"
				onclick={() => playbackActions.stepFrames(1)}
				aria-label="Next Frame"
			>
				▶
			</button>

			<button
				class="ctrl-icon-btn"
				title="Jump to End (End)"
				onclick={() => playbackActions.setCurrentTime($durationStore)}
				aria-label="Jump to End"
			>
				⏭
			</button>
		</div>

		<!-- Right: Speed, Volume Popover/Slider & Fullscreen Toggle -->
		<div class="player-right-group">
			<select
				class="speed-dropdown font-mono"
				value={$playbackStore.playbackSpeed}
				onchange={(e) => playbackActions.setPlaybackSpeed(parseFloat((e.target as HTMLSelectElement).value))}
				title="Playback Speed"
				aria-label="Playback Speed"
			>
				<option value={0.5}>0.5x</option>
				<option value={1.0}>1.0x</option>
				<option value={1.25}>1.25x</option>
				<option value={1.5}>1.5x</option>
				<option value={2.0}>2.0x</option>
			</select>

			<!-- Volume Controls with Popover / Inline Slider -->
			<div
				class="volume-control-group"
				onmouseenter={() => (showVolumeSlider = true)}
				onmouseleave={() => (showVolumeSlider = false)}
				role="group"
				aria-label="Volume Control"
			>
				<button
					class="ctrl-icon-btn volume-btn"
					title={$playbackStore.isMuted ? 'Unmute' : 'Mute'}
					onclick={() => playbackActions.toggleMute()}
					aria-label={$playbackStore.isMuted ? 'Unmute' : 'Mute'}
				>
					{#if $playbackStore.isMuted || $playbackStore.masterVolume === 0}
						<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg></span>
					{:else if $playbackStore.masterVolume < 0.5}
						<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/></svg></span>
					{:else}
						<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M18 7a8 8 0 0 1 0 10"/></svg></span>
					{/if}
				</button>

				{#if showVolumeSlider}
					<div class="volume-slider-popup">
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={$playbackStore.isMuted ? 0 : ($playbackStore.masterVolume ?? 1)}
							oninput={handleVolumeChange}
							class="volume-slider"
							aria-label="Volume Level"
						/>
						<span class="volume-percent font-mono">{Math.round(($playbackStore.isMuted ? 0 : ($playbackStore.masterVolume ?? 1)) * 100)}%</span>
					</div>
				{/if}
			</div>

			<!-- Fullscreen Toggle -->
			<button
				class="ctrl-icon-btn fullscreen-btn"
				title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
				onclick={toggleFullscreen}
				aria-label="Toggle Fullscreen"
			>
				<span class="ui-glyph" aria-hidden="true">
					{#if isFullscreen}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
							<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
							<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
						</svg>
					{/if}
				</span>
			</button>
		</div>
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

	.player-controls-container {
		display: flex;
		flex-direction: column;
		background: var(--ms-void);
		border-top: 1px solid var(--ms-edge);
		padding: 6px 14px 8px;
		user-select: none;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.progress-bar-wrapper {
		width: 100%;
		display: flex;
		align-items: center;
		margin-bottom: 6px;
		position: relative;
	}

	.video-seek-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		background: linear-gradient(
			to right,
			var(--ms-text) 0%,
			var(--ms-text) var(--progress-percent, 0%),
			var(--ms-edge) var(--progress-percent, 0%),
			var(--ms-edge) 100%
		);
		border-radius: 2px;
		cursor: pointer;
		outline: none;
		transition: height 0.15s ease;
	}

	.video-seek-slider:hover {
		height: 6px;
	}

	.video-seek-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ms-text);
		border: 2px solid var(--ms-text);
		box-shadow: 0 0 6px rgba(56, 189, 248, 0.7);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.video-seek-slider:hover::-webkit-slider-thumb {
		transform: scale(1.25);
	}

	.video-seek-slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ms-text);
		border: 2px solid var(--ms-text);
		box-shadow: 0 0 6px rgba(56, 189, 248, 0.7);
		cursor: pointer;
	}

	.player-bottom-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 32px;
	}

	.timecode-readout {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 0.75rem;
		min-width: 90px;
	}

	.curr-time {
		color: var(--ms-text);
		font-weight: 600;
	}

	.time-sep {
		color: var(--ms-text-tertiary);
	}

	.total-dur {
		color: var(--ms-text-secondary);
		font-weight: 500;
	}

	.font-mono {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
	}

	.transport-buttons {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ctrl-icon-btn {
		background: transparent;
		border: 1px solid transparent;
		color: var(--ms-text-secondary);
		font-size: 0.85rem;
		padding: 4px 6px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.ctrl-icon-btn:hover {
		background: var(--ms-edge);
		color: var(--ms-text);
		border-color: var(--ms-edge);
	}

	.master-play-btn {
		background: var(--ms-raised);
		border: 1px solid rgba(255, 255, 255, 0.27);
		color: var(--ms-text);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	.master-play-btn:hover {
		background: var(--ms-text);
		color: var(--ms-void);
		transform: scale(1.1);
		box-shadow: 0 0 12px rgba(56, 189, 248, 0.45);
	}

	.master-play-btn.playing {
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.master-play-btn.playing:hover {
		background: var(--ms-text-secondary);
		color: var(--ms-text);
	}

	.play-icon {
		font-size: 0.95rem;
		line-height: 1;
		margin-left: 1px;
	}

	.master-play-btn.playing .play-icon {
		margin-left: 0;
	}

	.player-right-group {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 90px;
		justify-content: flex-end;
	}

	.speed-dropdown {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		color: var(--ms-text-secondary);
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 4px;
		cursor: pointer;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.speed-dropdown:hover {
		border-color: var(--ms-text);
	}

	.volume-control-group {
		position: relative;
		display: flex;
		align-items: center;
	}

	.volume-btn {
		font-size: 0.85rem;
	}

	.volume-slider-popup {
		position: absolute;
		bottom: 34px;
		right: 0;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
		border-radius: 6px;
		padding: 6px 10px;
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 100;
		width: 120px;
	}

	.volume-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 3px;
		background: var(--ms-edge);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
		accent-color: var(--ms-text);
	}

	.volume-percent {
		font-size: 0.65rem;
		color: var(--ms-text-secondary);
		min-width: 28px;
		text-align: right;
	}

	.fullscreen-btn {
		font-size: 0.95rem;
	}
</style>

