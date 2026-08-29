<script lang="ts">
	import { onMount } from 'svelte';
	import { timelineStore, timelineActions } from '$lib/stores/timeline.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { playbackStore, playbackActions } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { AddClipCommand } from '$lib/core/commands/addClip';
	import { MoveClipCommand } from '$lib/core/commands/moveClip';
	import { TrimClipCommand } from '$lib/core/commands/trimClip';
	import { SplitClipCommand } from '$lib/core/commands/splitClip';
	import { DeleteClipCommand } from '$lib/core/commands/deleteClip';
	import { AddTrackCommand } from '$lib/core/commands/addTrack';
	import Clip from './Clip.svelte';
	import type { Clip as ClipType } from '$lib/types/project';
	import { derived } from 'svelte/store';

	const sequences = derived(projectStore, ($project) => $project?.sequences ?? []);
	const activeSequenceId = derived(projectStore, ($project) => $project?.activeSequenceId ?? null);
	const activeSequence = derived([sequences, activeSequenceId], ([$sequences, $activeSequenceId]) =>
		$sequences.find((seq) => seq.id === $activeSequenceId) ?? null
	);
	const tracks = derived(activeSequence, ($activeSequence) => $activeSequence?.tracks ?? []);
	const assets = derived(projectStore, ($project) => $project?.assets ?? new Map());
	const clips = derived(projectStore, ($project) => $project?.clips ?? new Map());

	const sequenceDuration = derived([activeSequence, clips], ([$activeSequence, $clips]) => {
		if (!$activeSequence) return 10;
		let maxEnd = 0;
		for (const track of $activeSequence.tracks) {
			for (const clipId of track.clipInstances) {
				const clip = $clips.get(clipId);
				if (clip) {
					const end = clip.timelineStart + clip.timelineDuration;
					if (end > maxEnd) maxEnd = end;
				}
			}
		}
		return Math.max(10, maxEnd + 5);
	});

	let timelineScrollContainer = $state<HTMLDivElement | null>(null);
	let tracksAreaRef = $state<HTMLDivElement | null>(null);

	let draggingClipId = $state<string | null>(null);
	let dragStartMouseX = 0;
	let dragStartClipStartTime = 0;
	let dragOffsetX = 0;
	let draggedTime = 0;

	let isTrimming = $state(false);
	let trimSide = $state<'start' | 'end' | null>(null);
	let trimStartMouseX = 0;
	let trimStartClipValue = 0;
	let originalClipForTrim: ClipType | null = null;
	let trimNewValue = 0;

	let isScrubbing = $state(false);
	let snapGuideX = $state<number | null>(null);
	const SNAP_THRESHOLD_PX = 10;
	const EDGE_SENSITIVITY_PX = 8;

	let trackMutes = $state<Record<string, boolean>>({});
	let trackLocks = $state<Record<string, boolean>>({});

	function timeToPixels(time: number, zoomLevel: number): number {
		return time * (80 * zoomLevel);
	}

	function pixelsToTime(pixels: number, zoomLevel: number): number {
		return pixels / (80 * zoomLevel);
	}

	function calculateSnappingTargets(excludeClipId: string | null = null): number[] {
		if (!$timelineStore.snapToGrid) return [];
		const targets: number[] = [0, $playbackStore.currentTime];
		const active = $activeSequence;
		if (active) {
			for (const track of active.tracks) {
				for (const clipId of track.clipInstances) {
					if (excludeClipId && clipId === excludeClipId) continue;
					const clip = $clips.get(clipId);
					if (clip) {
						targets.push(clip.timelineStart);
						targets.push(clip.timelineStart + clip.timelineDuration);
					}
				}
			}
		}
		return targets;
	}

	function findSnapTarget(positionTime: number, targets: number[]): number | null {
		if (!$timelineStore.snapToGrid || targets.length === 0) return null;
		let closest: number | null = null;
		let closestDist = Infinity;
		const thresholdSec = SNAP_THRESHOLD_PX / (80 * $timelineStore.zoomLevel);

		for (const target of targets) {
			const dist = Math.abs(positionTime - target);
			if (dist < closestDist && dist <= thresholdSec) {
				closestDist = dist;
				closest = target;
			}
		}
		return closest;
	}

	function handleClipMousedown(event: MouseEvent, clipId: string) {
		event.stopPropagation();
		timelineActions.selectClip(clipId);

		const clip = $clips.get(clipId);
		if (!clip || !tracksAreaRef) return;

		const rect = tracksAreaRef.getBoundingClientRect();
		const mouseX = event.clientX - rect.left + (timelineScrollContainer?.scrollLeft ?? 0);
		const zoom = $timelineStore.zoomLevel;

		const clipStartPx = timeToPixels(clip.timelineStart, zoom);
		const clipEndPx = timeToPixels(clip.timelineStart + clip.timelineDuration, zoom);

		if (Math.abs(mouseX - clipStartPx) <= EDGE_SENSITIVITY_PX) {
			isTrimming = true;
			trimSide = 'start';
			trimStartMouseX = mouseX;
			trimStartClipValue = clip.sourceIn;
			originalClipForTrim = { ...clip };
			trimNewValue = clip.sourceIn;
			return;
		}

		if (Math.abs(mouseX - clipEndPx) <= EDGE_SENSITIVITY_PX) {
			isTrimming = true;
			trimSide = 'end';
			trimStartMouseX = mouseX;
			trimStartClipValue = clip.sourceOut;
			originalClipForTrim = { ...clip };
			trimNewValue = clip.sourceOut;
			return;
		}

		draggingClipId = clipId;
		dragStartMouseX = mouseX;
		dragStartClipStartTime = clip.timelineStart;
		dragOffsetX = mouseX - clipStartPx;
		draggedTime = clip.timelineStart;
	}

	function handleRulerMousedown(event: MouseEvent) {
		if (!tracksAreaRef) return;
		isScrubbing = true;
		handleRulerScrub(event);
	}

	function handleRulerScrub(event: MouseEvent) {
		if (!tracksAreaRef) return;
		const rect = tracksAreaRef.getBoundingClientRect();
		const mouseX = event.clientX - rect.left + (timelineScrollContainer?.scrollLeft ?? 0);
		const targetTime = Math.max(0, pixelsToTime(mouseX, $timelineStore.zoomLevel));

		const snapTarget = findSnapTarget(targetTime, calculateSnappingTargets());
		playbackActions.setCurrentTime(snapTarget !== null ? snapTarget : targetTime);
	}

	function handleWindowMousemove(event: MouseEvent) {
		if (!tracksAreaRef) return;
		const rect = tracksAreaRef.getBoundingClientRect();
		const mouseX = event.clientX - rect.left + (timelineScrollContainer?.scrollLeft ?? 0);
		const zoom = $timelineStore.zoomLevel;

		if (isScrubbing) {
			handleRulerScrub(event);
			return;
		}

		if (isTrimming && trimSide && originalClipForTrim) {
			const deltaX = mouseX - trimStartMouseX;
			const deltaTime = deltaX / (80 * zoom);
			let newValue = trimStartClipValue + deltaTime;
			const mediaAsset = $assets.get(originalClipForTrim.mediaAssetId);
			const maxDuration = mediaAsset ? mediaAsset.duration : 1000;

			if (trimSide === 'start') {
				newValue = Math.max(0, Math.min(originalClipForTrim.sourceOut - 0.1, newValue));
				const candidateTimelineStart =
					originalClipForTrim.timelineStart + (newValue - originalClipForTrim.sourceIn);
				const snap = findSnapTarget(
					candidateTimelineStart,
					calculateSnappingTargets(originalClipForTrim.id)
				);
				if (snap !== null) {
					snapGuideX = timeToPixels(snap, zoom);
					newValue = originalClipForTrim.sourceIn + (snap - originalClipForTrim.timelineStart);
				} else {
					snapGuideX = null;
				}
			} else {
				newValue = Math.min(maxDuration, Math.max(originalClipForTrim.sourceIn + 0.1, newValue));
				const candidateTimelineEnd =
					originalClipForTrim.timelineStart + (newValue - originalClipForTrim.sourceIn);
				const snap = findSnapTarget(
					candidateTimelineEnd,
					calculateSnappingTargets(originalClipForTrim.id)
				);
				if (snap !== null) {
					snapGuideX = timeToPixels(snap, zoom);
					newValue = originalClipForTrim.sourceIn + (snap - originalClipForTrim.timelineStart);
				} else {
					snapGuideX = null;
				}
			}
			trimNewValue = newValue;
			return;
		}

		if (draggingClipId) {
			const candidateMouseX = mouseX - dragOffsetX;
			const candidateTime = Math.max(0, pixelsToTime(candidateMouseX, zoom));
			const snap = findSnapTarget(candidateTime, calculateSnappingTargets(draggingClipId));

			if (snap !== null) {
				snapGuideX = timeToPixels(snap, zoom);
				draggedTime = snap;
			} else {
				snapGuideX = null;
				draggedTime = candidateTime;
			}
		}
	}

	function handleWindowMouseup() {
		if (isScrubbing) {
			isScrubbing = false;
		}

		if (isTrimming && trimSide && originalClipForTrim) {
			const clipId = originalClipForTrim.id;
			const trimCmd = new TrimClipCommand({
				clipId,
				side: trimSide,
				newSourceTime: trimNewValue
			});
			commandProcessor.execute(trimCmd);
			resetDragState();
			return;
		}

		if (draggingClipId) {
			let currentTrackId: string | null = null;
			const active = $activeSequence;
			if (active) {
				for (const track of active.tracks) {
					if (track.clipInstances.includes(draggingClipId)) {
						currentTrackId = track.id;
						break;
					}
				}
			}
			if (currentTrackId) {
				const moveCmd = new MoveClipCommand({
					clipId: draggingClipId,
					newTrackId: currentTrackId,
					newPosition: draggedTime
				});
				commandProcessor.execute(moveCmd);
			}
			resetDragState();
			return;
		}

		resetDragState();
	}

	function resetDragState() {
		draggingClipId = null;
		isTrimming = false;
		trimSide = null;
		originalClipForTrim = null;
		snapGuideX = null;
	}

	function handleTrackDrop(event: DragEvent, trackId: string) {
		event.preventDefault();
		event.stopPropagation();
		const mediaAssetId = event.dataTransfer?.getData('text/plain');
		if (!mediaAssetId || !tracksAreaRef) return;

		const rect = tracksAreaRef.getBoundingClientRect();
		const dropX = event.clientX - rect.left + (timelineScrollContainer?.scrollLeft ?? 0);
		const dropTime = Math.max(0, pixelsToTime(dropX, $timelineStore.zoomLevel));

		const addClipCmd = new AddClipCommand({
			mediaAssetId,
			trackId,
			position: dropTime
		});
		commandProcessor.execute(addClipCmd);
	}

	function handleSplit() {
		const clipId = $timelineStore.selectedClipId;
		if (clipId) {
			const splitCmd = new SplitClipCommand({
				clipId,
				splitTime: $playbackStore.currentTime
			});
			commandProcessor.execute(splitCmd);
		}
	}

	onMount(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
				return;
			}

			if (event.code === 'Space') {
				event.preventDefault();
				playbackActions.togglePlayback();
			}

			if (event.key === 's' || event.key === 'S') {
				const clipId = $timelineStore.selectedClipId;
				if (clipId) {
					event.preventDefault();
					handleSplit();
				}
			}

			if (event.key === 'Delete' || event.key === 'Backspace') {
				const clipId = $timelineStore.selectedClipId;
				if (clipId) {
					event.preventDefault();
					const deleteCmd = new DeleteClipCommand({ clipId });
					commandProcessor.execute(deleteCmd);
					timelineActions.selectClip(null);
				}
			}

			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				playbackActions.stepFrames(event.shiftKey ? -5 : -1);
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				playbackActions.stepFrames(event.shiftKey ? 5 : 1);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('mousemove', handleWindowMousemove);
		window.addEventListener('mouseup', handleWindowMouseup);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('mousemove', handleWindowMousemove);
			window.removeEventListener('mouseup', handleWindowMouseup);
		};
	});

	function handleAddTrack(type: 'video' | 'audio') {
		const addTrackCmd = new AddTrackCommand({
			type,
			index: $tracks.length
		});
		commandProcessor.execute(addTrackCmd);
	}

	function formatTimecode(seconds: number, fps: number = 30): string {
		const totalSecs = Math.max(0, seconds);
		const hrs = Math.floor(totalSecs / 3600);
		const mins = Math.floor((totalSecs % 3600) / 60);
		const secs = Math.floor(totalSecs % 60);
		const frames = Math.floor((totalSecs % 1) * fps);

		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
	}

	function formatRulerTime(seconds: number): string {
		const totalSecs = Math.max(0, seconds);
		const mins = Math.floor(totalSecs / 60);
		const secs = Math.floor(totalSecs % 60);
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${pad(mins)}:${pad(secs)}`;
	}
</script>

<div class="multitrack-timeline-root" role="region" aria-label="Timeline">
	<!-- Timeline Toolbar -->
	<div class="timeline-top-toolbar">
		<div class="toolbar-left-group">
			<span class="timeline-title">Timeline</span>
			<div class="timeline-tools">
				<button
					class="t-btn split-action-btn"
					class:active={$timelineStore.selectedClipId !== null}
					disabled={$timelineStore.selectedClipId === null}
					title={$timelineStore.selectedClipId ? 'Split selected clip at playhead (S)' : 'Select a clip to split (S)'}
					onclick={handleSplit}
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="6" cy="6" r="3" />
						<circle cx="6" cy="18" r="3" />
						<line x1="20" y1="4" x2="8.12" y2="15.88" />
						<line x1="14.47" y1="14.48" x2="20" y2="20" />
						<line x1="8.12" y1="8.12" x2="12" y2="12" />
					</svg>
					<span>Split</span>
				</button>

				<button
					class="t-btn snap-toggle-btn"
					class:active={$timelineStore.snapToGrid}
					title="Toggle Snapping ({$timelineStore.snapToGrid ? 'On' : 'Off'})"
					onclick={() => timelineActions.setSnapToGrid(!$timelineStore.snapToGrid)}
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 3v7a6 6 0 0 0 12 0V3" />
						<path d="M4 3h4" />
						<path d="M16 3h4" />
					</svg>
					<span>Snap</span>
				</button>

				<div class="toolbar-divider"></div>

				<button class="t-btn add-track-btn" title="Add Video Track" onclick={() => handleAddTrack('video')}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="m22 8-6 4 6 4V8Z" />
						<rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
					</svg>
					<span>+ Video</span>
				</button>

				<button class="t-btn add-track-btn" title="Add Audio Track" onclick={() => handleAddTrack('audio')}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
						<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
					</svg>
					<span>+ Audio</span>
				</button>
			</div>
		</div>

		<div class="toolbar-right-group">
			<div class="zoom-controls-cluster">
				<button
					class="zoom-btn"
					title="Zoom Out"
					onclick={() => timelineActions.setZoomLevel(Math.max(0.2, $timelineStore.zoomLevel - 0.2))}
				>
					−
				</button>
				<input
					type="range"
					min="0.2"
					max="3.0"
					step="0.1"
					value={$timelineStore.zoomLevel}
					oninput={(e) => timelineActions.setZoomLevel(parseFloat((e.target as HTMLInputElement).value))}
					aria-label="Timeline zoom level"
					class="zoom-slider-range"
				/>
				<button
					class="zoom-btn"
					title="Zoom In"
					onclick={() => timelineActions.setZoomLevel(Math.min(3.0, $timelineStore.zoomLevel + 0.2))}
				>
					+
				</button>
				<span class="zoom-percentage-badge font-mono">{Math.round($timelineStore.zoomLevel * 100)}%</span>
			</div>
		</div>
	</div>

	<!-- Main Timeline Canvas Body -->
	<div class="timeline-canvas-container">
		<!-- Left Track Labels Sidebar -->
		<div class="track-labels-sidebar">
			<div class="ruler-corner-cell">
				<span class="tracks-header-label">TRACKS</span>
			</div>
			{#each $tracks as track, index}
				{@const videoTracks = $tracks.filter((t) => t.type === 'video')}
				{@const trackLabel = track.type === 'video' ? `Video ${index + 1}` : `Audio ${index + 1 - videoTracks.length}`}
				<div class="track-label-row {track.type}">
					<div class="track-id-badge {track.type}">
						{#if track.type === 'video'}
							<svg
								class="track-svg-icon video"
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="m22 8-6 4 6 4V8Z" />
								<rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
							</svg>
						{:else}
							<svg
								class="track-svg-icon audio"
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
								<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
							</svg>
						{/if}
						<span class="badge-num font-mono">{trackLabel}</span>
					</div>

					<div class="track-state-icons">
						<button
							class="track-icon-btn mute"
							class:active={trackMutes[track.id]}
							onclick={() => (trackMutes[track.id] = !trackMutes[track.id])}
							title={trackMutes[track.id] ? 'Unmute Track' : 'Mute Track'}
							aria-label={trackMutes[track.id] ? 'Unmute Track' : 'Mute Track'}
						>
							{#if trackMutes[track.id]}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
									<line x1="22" y1="9" x2="16" y2="15" />
									<line x1="16" y1="9" x2="22" y2="15" />
								</svg>
							{:else}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
									<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
								</svg>
							{/if}
						</button>
						<button
							class="track-icon-btn lock"
							class:active={trackLocks[track.id]}
							onclick={() => (trackLocks[track.id] = !trackLocks[track.id])}
							title={trackLocks[track.id] ? 'Unlock Track' : 'Lock Track'}
							aria-label={trackLocks[track.id] ? 'Unlock Track' : 'Lock Track'}
						>
							{#if trackLocks[track.id]}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 10 0v4" />
								</svg>
							{:else}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 9.9-1" />
								</svg>
							{/if}
						</button>
					</div>
				</div>
			{/each}
		</div>

		<!-- Right Scrollable Tracks Area -->
		<div class="tracks-scroll-viewport" bind:this={timelineScrollContainer}>
			<div
				class="tracks-stage-canvas"
				bind:this={tracksAreaRef}
				style="width: {Math.max(1200, timeToPixels($sequenceDuration, $timelineStore.zoomLevel))}px;"
			>
				<!-- Time Ruler with Formatted Timecodes -->
				<div
					class="timecode-ruler"
					role="slider"
					tabindex="0"
					aria-valuemin="0"
					aria-valuemax={$sequenceDuration}
					aria-valuenow={$playbackStore.currentTime}
					aria-label="Time Ruler"
					onmousedown={handleRulerMousedown}
				>
					{#each Array.from({ length: Math.ceil($sequenceDuration) + 1 }) as _, i}
						{@const leftPx = timeToPixels(i, $timelineStore.zoomLevel)}
						<div class="ruler-mark-major" style="left: {leftPx}px;">
							<span class="ruler-timecode font-mono">{formatRulerTime(i)}</span>
						</div>
						{#if $timelineStore.zoomLevel >= 0.6}
							<div
								class="ruler-mark-minor"
								style="left: {leftPx + timeToPixels(0.5, $timelineStore.zoomLevel)}px;"
							></div>
						{/if}
					{/each}
				</div>

				<!-- Track Lanes Layer -->
				<div class="track-lanes-stack">
					{#each $tracks as track}
						<div
							class="track-row-lane {track.type}"
							data-track-id={track.id}
							ondragover={(e) => e.preventDefault()}
							ondrop={(e) => handleTrackDrop(e, track.id)}
							role="group"
							aria-label="{track.type} Track"
						>
							{#each track.clipInstances as clipId}
								{#if $clips.has(clipId)}
									{@const clip = $clips.get(clipId)!}
									{@const leftPx = timeToPixels(clip.timelineStart, $timelineStore.zoomLevel)}
									{@const widthPx = timeToPixels(clip.timelineDuration, $timelineStore.zoomLevel)}
									<Clip
										{clip}
										trackType={track.type}
										left={leftPx}
										width={widthPx}
										onMousedown={(e) => handleClipMousedown(e, clip.id)}
										onTouchstart={(e) => handleClipMousedown(e as unknown as MouseEvent, clip.id)}
									/>
								{/if}
							{/each}
						</div>
					{/each}
				</div>

				<!-- Snap Guide Line (Blue Laser within 10px threshold) -->
				{#if snapGuideX !== null}
					<div class="snap-indicator-line" style="left: {snapGuideX}px;"></div>
				{/if}

				<!-- Playhead Pin, Laser Wire & Attached Floating Timecode Badge -->
				<div
					class="playhead-container"
					style="left: {timeToPixels($playbackStore.currentTime, $timelineStore.zoomLevel)}px;"
				>
					<!-- Floating Timecode Badge -->
					<div class="playhead-timecode-badge font-mono">
						{formatTimecode($playbackStore.currentTime)}
						<div class="badge-arrow"></div>
					</div>

					<!-- Red Playhead Top Pin -->
					<div
						class="playhead-top-pin"
						role="slider"
						tabindex="0"
						aria-label="Playhead"
						aria-valuenow={$playbackStore.currentTime}
						onmousedown={handleRulerMousedown}
					>
						<svg width="14" height="18" viewBox="0 0 14 18" fill="none" class="pin-svg-shape">
							<path
								d="M0 2C0 0.895431 0.895431 0 2 0H12C13.1046 0 14 0.895431 14 2V11C14 11.5833 13.7461 12.1384 13.3045 12.5186L7 17.9474L0.695521 12.5186C0.253905 12.1384 0 11.5833 0 11V2Z"
								fill="#ef4444"
							/>
						</svg>
					</div>

					<!-- Red Laser Wire -->
					<div class="playhead-laser-wire"></div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.multitrack-timeline-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #090a0d;
		color: #cbd5e1;
		user-select: none;
		border-top: 1px solid #1a1d28;
		overflow: hidden;
	}

	/* Top Toolbar */
	.timeline-top-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px;
		background: #121319;
		border-bottom: 1px solid #1a1d28;
		height: 38px;
		flex-shrink: 0;
	}

	.toolbar-left-group,
	.toolbar-right-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.timeline-title {
		font-size: 0.78rem;
		font-weight: 700;
		color: #e2e8f0;
		letter-spacing: 0.02em;
	}

	.timeline-tools {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.toolbar-divider {
		width: 1px;
		height: 16px;
		background: #232738;
		margin: 0 2px;
	}

	.t-btn {
		background: #1a1d28;
		border: 1px solid #232738;
		color: #94a3b8;
		font-size: 0.72rem;
		font-weight: 500;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 5px;
		transition: all 0.15s ease;
	}

	.t-btn:hover:not(:disabled) {
		background: #24283b;
		color: #f8fafc;
		border-color: #38bdf8;
	}

	.t-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.t-btn.active {
		background: #1e3a8a;
		border-color: #38bdf8;
		color: #38bdf8;
	}

	.split-action-btn.active {
		background: rgba(56, 189, 248, 0.15);
		border-color: #38bdf8;
		color: #38bdf8;
	}

	.zoom-controls-cluster {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #1a1d28;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid #232738;
	}

	.zoom-btn {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
		transition: color 0.15s ease;
	}

	.zoom-btn:hover {
		color: #38bdf8;
	}

	.zoom-slider-range {
		width: 72px;
		height: 4px;
		accent-color: #38bdf8;
		cursor: pointer;
	}

	.zoom-percentage-badge {
		font-size: 0.65rem;
		color: #64748b;
		min-width: 32px;
		text-align: right;
	}

	/* Timeline Canvas Container */
	.timeline-canvas-container {
		display: flex;
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	/* Track Header Column */
	.track-labels-sidebar {
		width: 116px;
		background: #121319;
		border-right: 1px solid #1a1d28;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		z-index: 15;
	}

	.ruler-corner-cell {
		height: 28px;
		background: #121319;
		border-bottom: 1px solid #1a1d28;
		display: flex;
		align-items: center;
		padding: 0 10px;
	}

	.tracks-header-label {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #64748b;
	}

	.track-label-row {
		height: 48px;
		display: flex;
		align-items: center;
		padding: 0 8px;
		gap: 6px;
		border-bottom: 1px solid #1a1d28;
		background: #121319;
	}

	.track-id-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.track-id-badge.video {
		background: rgba(56, 189, 248, 0.12);
		color: #38bdf8;
		border: 1px solid rgba(56, 189, 248, 0.25);
	}

	.track-id-badge.audio {
		background: rgba(16, 185, 129, 0.12);
		color: #34d399;
		border: 1px solid rgba(16, 185, 129, 0.25);
	}

	.track-svg-icon {
		flex-shrink: 0;
	}

	.track-state-icons {
		display: flex;
		gap: 3px;
		margin-left: auto;
	}

	.track-icon-btn {
		background: #1a1d28;
		border: 1px solid #232738;
		font-size: 0.65rem;
		color: #64748b;
		cursor: pointer;
		padding: 3px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.track-icon-btn:hover {
		color: #e2e8f0;
		background: #232738;
	}

	.track-icon-btn.active {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.1);
	}

	.track-icon-btn.lock.active {
		color: #f59e0b;
		border-color: rgba(245, 158, 11, 0.4);
		background: rgba(245, 158, 11, 0.1);
	}

	/* Scrollable Viewport with Custom Dark Scrollbars */
	.tracks-scroll-viewport {
		flex: 1;
		overflow-x: auto;
		overflow-y: auto;
		background: #090a0d;
		position: relative;
		scrollbar-width: thin;
		scrollbar-color: #232738 #121319;
	}

	.tracks-scroll-viewport::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	.tracks-scroll-viewport::-webkit-scrollbar-track {
		background: #121319;
	}

	.tracks-scroll-viewport::-webkit-scrollbar-thumb {
		background: #232738;
		border-radius: 4px;
		border: 1px solid #1a1d28;
	}

	.tracks-scroll-viewport::-webkit-scrollbar-thumb:hover {
		background: #2e344d;
	}

	.tracks-stage-canvas {
		position: relative;
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	/* Timecode Ruler */
	.timecode-ruler {
		height: 28px;
		background: #121319;
		border-bottom: 1px solid #1a1d28;
		position: relative;
		cursor: pointer;
		flex-shrink: 0;
	}

	.ruler-mark-major {
		position: absolute;
		top: 0;
		bottom: 0;
		border-left: 1px solid #232738;
	}

	.ruler-mark-minor {
		position: absolute;
		height: 35%;
		top: 65%;
		border-left: 1px solid #1a1d28;
	}

	.ruler-timecode {
		position: absolute;
		top: 4px;
		left: 5px;
		font-size: 0.65rem;
		color: #64748b;
		pointer-events: none;
	}

	/* Track Lanes Stack */
	.track-lanes-stack {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.track-row-lane {
		height: 48px;
		position: relative;
		border-bottom: 1px solid #1a1d28;
		background: repeating-linear-gradient(
			90deg,
			transparent,
			transparent 79px,
			rgba(255, 255, 255, 0.015) 79px,
			rgba(255, 255, 255, 0.015) 80px
		);
	}

	.track-row-lane.video {
		background-color: rgba(56, 189, 248, 0.015);
	}

	.track-row-lane.audio {
		background-color: rgba(16, 185, 129, 0.015);
	}

	/* Snapping Guide Line */
	.snap-indicator-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1.5px;
		background: #38bdf8;
		box-shadow: 0 0 8px #38bdf8, 0 0 2px #38bdf8;
		pointer-events: none;
		z-index: 35;
	}

	/* Playhead & Pin & Floating Timecode Badge */
	.playhead-container {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		pointer-events: none;
		z-index: 40;
		transform: translateX(-50%);
	}

	.playhead-timecode-badge {
		position: absolute;
		top: -24px;
		left: 0;
		transform: translateX(-50%);
		background: #ef4444;
		color: #ffffff;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6), 0 0 6px rgba(239, 68, 68, 0.5);
		letter-spacing: 0.04em;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.badge-arrow {
		position: absolute;
		bottom: -4px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 4px solid #ef4444;
	}

	.playhead-top-pin {
		width: 14px;
		height: 18px;
		position: absolute;
		top: 0;
		left: -7px;
		cursor: ew-resize;
		pointer-events: auto;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
		transition: transform 0.1s ease;
	}

	.playhead-top-pin:hover {
		transform: scale(1.15);
	}

	.pin-svg-shape {
		width: 100%;
		height: 100%;
		display: block;
	}

	.playhead-laser-wire {
		position: absolute;
		top: 17px;
		bottom: 0;
		left: 0;
		width: 1.5px;
		background: #ef4444;
		box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
	}

	.font-mono {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
	}
</style>