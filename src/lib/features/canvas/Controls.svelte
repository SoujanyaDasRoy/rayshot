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
	<!-- Interactive Blue Scrub Bar (#38bdf8) with Drag-to-Seek -->
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
						🔇
					{:else if $playbackStore.masterVolume < 0.5}
						🔉
					{:else}
						🔊
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
				{isFullscreen ? '⤦' : '⛶'}
			</button>
		</div>
	</div>
</div>

<style>
	.player-controls-container {
		display: flex;
		flex-direction: column;
		background: #121319;
		border-top: 1px solid #1a1d28;
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
			#38bdf8 0%,
			#38bdf8 var(--progress-percent, 0%),
			#232738 var(--progress-percent, 0%),
			#232738 100%
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
		background: #ffffff;
		border: 2px solid #38bdf8;
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
		background: #ffffff;
		border: 2px solid #38bdf8;
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
		color: #f1f5f9;
		font-weight: 600;
	}

	.time-sep {
		color: #64748b;
	}

	.total-dur {
		color: #94a3b8;
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
		color: #94a3b8;
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
		background: #1a1d28;
		color: #ffffff;
		border-color: #232738;
	}

	.master-play-btn {
		background: #1e293b;
		border: 1px solid #38bdf844;
		color: #38bdf8;
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
		background: #38bdf8;
		color: #090a0d;
		transform: scale(1.1);
		box-shadow: 0 0 12px rgba(56, 189, 248, 0.45);
	}

	.master-play-btn.playing {
		background: #38bdf8;
		color: #090a0d;
	}

	.master-play-btn.playing:hover {
		background: #0ea5e9;
		color: #ffffff;
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
		background: #161822;
		border: 1px solid #232738;
		color: #cbd5e1;
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 4px;
		cursor: pointer;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.speed-dropdown:hover {
		border-color: #38bdf8;
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
		background: #161822;
		border: 1px solid #232738;
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
		background: #232738;
		border-radius: 2px;
		outline: none;
		cursor: pointer;
		accent-color: #38bdf8;
	}

	.volume-percent {
		font-size: 0.65rem;
		color: #94a3b8;
		min-width: 28px;
		text-align: right;
	}

	.fullscreen-btn {
		font-size: 0.95rem;
	}
</style>

