<script lang="ts">
	import {
		trackLabels,
		trackHeight,
		trackColor,
		timelineOrder,
		TRACK_COLORS
	} from '$lib/utils/trackModel';
	import {
		SetTrackPropertyCommand,
		type TrackProperty
	} from '$lib/core/commands/setTrackProperty';
	import { DeleteTrackCommand } from '$lib/core/commands/deleteTrack';
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
	import { AddClipEffectCommand } from '$lib/core/commands/addClipEffect';
	import { effectById } from '$lib/core/effects/effectRegistry';
	import {
		PX_PER_SECOND,
		MIN_ZOOM,
		MAX_ZOOM,
		timeToPx as timeToPixels,
		pxToTime as pixelsToTime,
		clampZoom,
		zoomAtAnchor,
		fitZoom,
		rulerTicks
	} from '$lib/utils/timelineRuler';
	import Clip from './Clip.svelte';
	import { type Clip as ClipType } from '$lib/types/project';
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
	let labelRowsEl = $state<HTMLDivElement | null>(null);

	let draggingClipId = $state<string | null>(null);
	let dragStartMouseX = 0;
	let dragStartClipStartTime = 0;
	let dragOffsetX = 0;
	let draggedTime = $state(0);
	// Which lane the pointer is currently over, for cross-track drops.
	let dragOverTrackId = $state<string | null>(null);
	let colorMenuTrackId = $state<string | null>(null);

	// Each type numbers independently, so a subtitle track is S1 and not a
	// mis-numbered audio track.
	const labels = $derived(trackLabels($tracks));

	// Labels are numbered from the model's own order; the rows are then arranged
	// the way an editor reads them. Both columns iterate this one list, so the
	// names can never drift out of step with the lanes.
	const rows = $derived(
		timelineOrder(
			$tracks.map((track, i) => ({
				track,
				label: labels[i],
				type: track.type,
				order: track.order ?? i
			}))
		)
	);

	// The ruler decides its own density: labels never crowd and never vanish.
	const ticks = $derived(rulerTicks($sequenceDuration, $timelineStore.zoomLevel));

	// "Video 1" beats "V1": the abbreviation saved eleven pixels in a column
	// that has a hundred and seventy-six of them.
	const TRACK_WORD: Record<'video' | 'audio' | 'subtitle', string> = {
		video: 'Video',
		audio: 'Audio',
		subtitle: 'Caption'
	};

	function setTrackProp(trackId: string, property: TrackProperty, value: unknown) {
		commandProcessor.execute(
			new SetTrackPropertyCommand({ trackId, property, value: value as never })
		);
	}

	function removeTrack(trackId: string) {
		commandProcessor.execute(new DeleteTrackCommand({ trackId }));
	}

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
		const thresholdSec = SNAP_THRESHOLD_PX / (PX_PER_SECOND * $timelineStore.zoomLevel);

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
		// .tracks-stage-canvas already translates with the scroll, so its rect is
		// scroll-relative. Adding scrollLeft here double-counted it and threw every
		// grab, trim, drop and scrub off once the timeline was scrolled.
		const mouseX = event.clientX - rect.left;
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
		// .tracks-stage-canvas already translates with the scroll, so its rect is
		// scroll-relative. Adding scrollLeft here double-counted it and threw every
		// grab, trim, drop and scrub off once the timeline was scrolled.
		const mouseX = event.clientX - rect.left;
		const targetTime = Math.max(0, pixelsToTime(mouseX, $timelineStore.zoomLevel));

		const snapTarget = findSnapTarget(targetTime, calculateSnappingTargets());
		playbackActions.setCurrentTime(snapTarget !== null ? snapTarget : targetTime);
	}

	function handleWindowMousemove(event: MouseEvent) {
		if (isPanning && timelineScrollContainer) {
			timelineScrollContainer.scrollLeft = panStartScroll - (event.clientX - panStartX);
			return;
		}
		if (!tracksAreaRef) return;
		const rect = tracksAreaRef.getBoundingClientRect();
		// .tracks-stage-canvas already translates with the scroll, so its rect is
		// scroll-relative. Adding scrollLeft here double-counted it and threw every
		// grab, trim, drop and scrub off once the timeline was scrolled.
		const mouseX = event.clientX - rect.left;
		const zoom = $timelineStore.zoomLevel;

		if (isScrubbing) {
			handleRulerScrub(event);
			return;
		}

		if (isTrimming && trimSide && originalClipForTrim) {
			const deltaX = mouseX - trimStartMouseX;
			const deltaTime = deltaX / (PX_PER_SECOND * zoom);
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
		if (isPanning) {
			isPanning = false;
			return;
		}

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
			// Vertical drag: MoveClipCommand always supported a different track,
			// only the UI could not express it. A locked lane refuses the drop.
			const target = active?.tracks.find((t) => t.id === dragOverTrackId);
			if (target && !target.locked) currentTrackId = target.id;
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
		const dropX = event.clientX - rect.left;
		const dropTime = Math.max(0, pixelsToTime(dropX, $timelineStore.zoomLevel));

		const addClipCmd = new AddClipCommand({
			mediaAssetId,
			trackId,
			position: dropTime
		});
		commandProcessor.execute(addClipCmd);
	}

	// ── Navigation ────────────────────────────────────────────────────────────
	// Zoom anchors on the pointer, so the frame you are looking at stays where
	// you are looking. The scroll has to be reapplied after the canvas has
	// re-measured at the new width, hence the frame delay.
	function applyZoom(nextZoomRaw: number, anchorX?: number) {
		const current = $timelineStore.zoomLevel;
		const next = clampZoom(nextZoomRaw);
		if (next === current) return;

		const viewport = timelineScrollContainer;
		if (!viewport) {
			timelineActions.setZoomLevel(next);
			return;
		}

		const anchor = anchorX ?? viewport.clientWidth / 2;
		const nextScroll = zoomAtAnchor(next, current, viewport.scrollLeft, anchor);
		timelineActions.setZoomLevel(next);
		requestAnimationFrame(() => {
			viewport.scrollLeft = nextScroll;
		});
	}

	function zoomToFit() {
		const viewport = timelineScrollContainer;
		if (!viewport) return;
		timelineActions.setZoomLevel(fitZoom($sequenceDuration, viewport.clientWidth));
		requestAnimationFrame(() => {
			viewport.scrollLeft = 0;
		});
	}

	// The label column is not inside the scroller — it must not scroll sideways
	// with the lanes — so it is translated to follow their vertical scroll. Left
	// alone, the names drift out of line with their own tracks.
	function syncLabelScroll() {
		if (!labelRowsEl || !timelineScrollContainer) return;
		labelRowsEl.style.transform = `translateY(${-timelineScrollContainer.scrollTop}px)`;
	}

	function handleWheel(event: WheelEvent) {
		const viewport = timelineScrollContainer;
		if (!viewport) return;

		// Trackpad pinch arrives as a wheel event with ctrlKey set, so this one
		// branch covers both pinch-to-zoom and Ctrl/Cmd + wheel.
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			const rect = viewport.getBoundingClientRect();
			const factor = Math.exp(-event.deltaY * 0.002);
			applyZoom($timelineStore.zoomLevel * factor, event.clientX - rect.left);
			return;
		}

		if (event.shiftKey) {
			event.preventDefault();
			viewport.scrollLeft += event.deltaY || event.deltaX;
		}
	}

	// Middle-drag pans. Space is already play/pause, and an editor that stops
	// playing when you try to pan is worse than one you pan with the wheel.
	let isPanning = $state(false);
	let panStartX = 0;
	let panStartScroll = 0;

	function handleViewportMousedown(event: MouseEvent) {
		if (event.button !== 1 || !timelineScrollContainer) return;
		event.preventDefault();
		isPanning = true;
		panStartX = event.clientX;
		panStartScroll = timelineScrollContainer.scrollLeft;
	}

	// Dropping an effect on a clip applies it to that clip and selects it, so
	// the Inspector is already showing the thing you just changed.
	function handleClipEffectDrop(clipId: string, effectId: string) {
		if (!effectById(effectId)) return;
		timelineActions.selectClip(clipId);
		commandProcessor.execute(new AddClipEffectCommand({ clipId, effectId }));
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

			// Shift+Z fits the whole sequence; plain Z is left free.
			if ((event.key === 'z' || event.key === 'Z') && event.shiftKey && !event.ctrlKey && !event.metaKey) {
				event.preventDefault();
				zoomToFit();
				return;
			}

			if (event.key === '+' || event.key === '=') {
				event.preventDefault();
				applyZoom($timelineStore.zoomLevel + 0.2);
				return;
			}

			if (event.key === '-' || event.key === '_') {
				event.preventDefault();
				applyZoom($timelineStore.zoomLevel - 0.2);
				return;
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
		const viewport = timelineScrollContainer;
		viewport?.addEventListener('wheel', handleWheel, { passive: false });
		viewport?.addEventListener('mousedown', handleViewportMousedown);
		viewport?.addEventListener('scroll', syncLabelScroll, { passive: true });

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('mousemove', handleWindowMousemove);
			window.removeEventListener('mouseup', handleWindowMouseup);
			viewport?.removeEventListener('wheel', handleWheel);
			viewport?.removeEventListener('mousedown', handleViewportMousedown);
			viewport?.removeEventListener('scroll', syncLabelScroll);
		};
	});

	function handleAddTrack(type: 'video' | 'audio' | 'subtitle') {
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
		const secs = Math.floor((totalSecs % 60));
		const frames = Math.floor((totalSecs % 1) * fps);

		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
	}

</script>

<div class="multitrack-timeline-root" role="region" aria-label="Timeline">
	<!-- Timeline Toolbar -->
	<div class="timeline-top-toolbar">
		<div class="toolbar-left-group">
			<span class="timeline-title">Timeline</span>
		</div>

		<div class="toolbar-centre-group">
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
				<button class="t-btn add-track-btn" title="Add Subtitle Track" onclick={() => handleAddTrack('subtitle')}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="5" width="18" height="14" rx="2" />
						<path d="M7 14h5" />
						<path d="M15 14h2" />
					</svg>
					<span>+ Subtitle</span>
				</button>
			</div>
		</div>

		<div class="toolbar-right-group">
			<div class="zoom-controls-cluster">
				<button
					class="zoom-btn"
					title="Zoom Out"
					aria-label="Zoom out"
					onclick={() => applyZoom($timelineStore.zoomLevel - 0.2)}
				>
					−
				</button>
				<input
					type="range"
					min={MIN_ZOOM}
					max={MAX_ZOOM}
					step="0.1"
					value={$timelineStore.zoomLevel}
					oninput={(e) => applyZoom(parseFloat((e.target as HTMLInputElement).value))}
					aria-label="Timeline zoom level"
					class="zoom-slider-range"
				/>
				<button
					class="zoom-btn"
					title="Zoom In"
					aria-label="Zoom in"
					onclick={() => applyZoom($timelineStore.zoomLevel + 0.2)}
				>
					+
				</button>
				<span class="zoom-percentage-badge font-mono">{Math.round($timelineStore.zoomLevel * 100)}%</span>
				<button class="zoom-btn fit-btn" title="Fit sequence to window (Shift+Z)" onclick={zoomToFit}>
					Fit
				</button>
			</div>
		</div>
	</div>

	<!-- Main Timeline Canvas Body -->
	<div class="timeline-canvas-container">
		<!-- Left Track Labels Sidebar -->
		<div class="track-labels-sidebar">
			<div class="ruler-corner-cell">
				<!-- The word "TRACKS" labelled a column whose contents already say
				     what they are. The position does need saying, and it belongs
				     where your eye already goes for the track it applies to. -->
				<span class="playhead-readout font-mono">{formatTimecode($playbackStore.currentTime)}</span>
			</div>
			<div class="track-label-rows" bind:this={labelRowsEl}>
				{#each rows as { track, label: trackLabel } (track.id)}
					{@const height = trackHeight(track)}
					{@const clipCount = track.clipInstances.length}
					<div
						class="track-label-row {track.type}"
						style="height: {height}px; --track-color: {trackColor(track)};"
						class:locked={track.locked}
						class:compact={height < 48}
					>
						<!-- Row 1: index, name, and for audio the channel format. -->
						<div class="track-head-row">
							<span class="track-index-badge {track.type}">{trackLabel}</span>
							<span class="track-name">{TRACK_WORD[track.type]} {trackLabel.slice(1)}</span>
							{#if track.type === 'audio'}
								<span class="track-channels font-mono">2.0</span>
							{/if}
						</div>

						<!-- Row 2: the track's own switches, always visible. -->
						{#if height >= 48}
							<div class="track-switch-row">
								<button
									class="track-switch"
									class:on={track.locked}
									onclick={() => setTrackProp(track.id, 'locked', !track.locked)}
									title={track.locked ? 'Unlock track' : 'Lock track'}
									aria-label={track.locked ? 'Unlock track' : 'Lock track'}
									aria-pressed={!!track.locked}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
										<rect x="5" y="11" width="14" height="10" rx="2" />
										<path d="M8 11V7a4 4 0 0 1 8 0v4" />
									</svg>
								</button>

								<button
									class="track-switch"
									class:on={!track.hidden}
									onclick={() => setTrackProp(track.id, 'hidden', !track.hidden)}
									title={track.hidden ? 'Enable track' : 'Disable track'}
									aria-label={track.hidden ? 'Enable track' : 'Disable track'}
									aria-pressed={!track.hidden}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M9 7 5 12l4 5M15 7l4 5-4 5" />
									</svg>
								</button>

								<!-- Resolve keeps S and M on audio tracks only, because it splits
								     audio onto its own track at import. RayShot's video clips carry
								     their own sound, so a video track without a mute would lose a
								     capability the model already has. -->
								<button
									class="track-switch letter"
									class:on={track.solo}
									onclick={() => setTrackProp(track.id, 'solo', !track.solo)}
									title={track.solo ? 'Unsolo track' : 'Solo track'}
									aria-label={track.solo ? 'Unsolo track' : 'Solo track'}
									aria-pressed={!!track.solo}
								>S</button>

								<button
									class="track-switch letter"
									class:on={track.muted}
									onclick={() => setTrackProp(track.id, 'muted', !track.muted)}
									title={track.muted ? 'Unmute track' : 'Mute track'}
									aria-label={track.muted ? 'Unmute track' : 'Mute track'}
									aria-pressed={!!track.muted}
								>M</button>
															<button
									class="track-switch swatch"
									style="background: {trackColor(track)};"
									onclick={() => (colorMenuTrackId = colorMenuTrackId === track.id ? null : track.id)}
									title="Track colour"
									aria-label="Track colour"
									aria-expanded={colorMenuTrackId === track.id}
								></button>

								<button
									class="track-switch"
									onclick={() => removeTrack(track.id)}
									title="Delete track"
									aria-label="Delete {trackLabel} track"
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
										<path d="M6 6l12 12M18 6L6 18" />
									</svg>
								</button>

								{#if colorMenuTrackId === track.id}
									<div class="swatch-menu" role="menu">
										{#each TRACK_COLORS as swatch (swatch.value)}
											<button
												class="swatch-option"
												class:selected={trackColor(track) === swatch.value}
												style="background: {swatch.value};"
												title={swatch.name}
												aria-label={swatch.name}
												onclick={() => {
													setTrackProp(track.id, 'color', swatch.value);
													colorMenuTrackId = null;
												}}
											></button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						<!-- Row 3: what is actually on the track. -->
						{#if height >= 66}
							<span class="track-clip-count">
								{clipCount} {clipCount === 1 ? 'Clip' : 'Clips'}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Right Scrollable Tracks Area -->
		<div
			class="tracks-scroll-viewport"
			class:panning={isPanning}
			bind:this={timelineScrollContainer}
		>
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
					{#each ticks as tick (tick.time)}
						{#if tick.label !== null}
							<div class="ruler-mark-major" style="left: {tick.px}px;">
								<span class="ruler-timecode font-mono">{tick.label}</span>
							</div>
						{:else}
							<div class="ruler-mark-minor" style="left: {tick.px}px;"></div>
						{/if}
					{/each}
				</div>

				<!-- Track Lanes Layer -->
				<div class="track-lanes-stack">
					{#each rows as { track, label } (track.id)}
						<div
							class="track-row-lane {track.type}"
							class:drop-target={dragOverTrackId === track.id}
							class:hidden-track={track.hidden}
							style="height: {trackHeight(track)}px; --track-color: {trackColor(track)};"
							data-track-id={track.id}
							onmouseenter={() => { if (draggingClipId) dragOverTrackId = track.id; }}
							ondragover={(e) => e.preventDefault()}
							ondrop={(e) => handleTrackDrop(e, track.id)}
							role="group"
							aria-label="{label} track"
						>
							{#each track.clipInstances as clipId}
								{#if $clips.has(clipId)}
									{@const clip = $clips.get(clipId)!}
									{@const clipStart =
										clip.id === draggingClipId ? draggedTime : clip.timelineStart}
									{@const leftPx = timeToPixels(clipStart, $timelineStore.zoomLevel)}
									{@const widthPx = timeToPixels(clip.timelineDuration, $timelineStore.zoomLevel)}
									<Clip
										{clip}
										trackType={track.type}
										left={leftPx}
										width={widthPx}
										onMousedown={(e) => handleClipMousedown(e, clip.id)}
										onTouchstart={(e) => handleClipMousedown(e as unknown as MouseEvent, clip.id)}
										onEffectDrop={(effectId) => handleClipEffectDrop(clip.id, effectId)}
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
		background: var(--ms-material); /* surface-container-low */
		color: var(--ms-text-secondary);
		user-select: none;
		border-top: 1px solid var(--ms-edge);
		overflow: hidden;
		min-height: 300px;
	}

	/* Top Toolbar */
	.timeline-top-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 12px;
		background: var(--ms-material); /* surface-container-low */
		border-bottom: 1px solid var(--ms-edge);
		height: 40px; /* h-10 in Tailwind (10 * 4px) */
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
		color: var(--ms-text-secondary);
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
		background: var(--ms-edge);
		margin: 0 2px;
	}

	.t-btn {
		background: var(--ms-edge);
		border: 1px solid var(--ms-edge);
		color: var(--ms-text-secondary);
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
		background: var(--ms-edge);
		color: var(--ms-text);
		border-color: var(--ms-text);
	}

	.t-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.t-btn.active {
		background: var(--ms-raised);
		border-color: var(--ms-text);
		color: var(--ms-text);
	}

	.split-action-btn.active {
		background: rgba(56, 189, 248, 0.15);
		border-color: var(--ms-text);
		color: var(--ms-text);
	}

	/* The tools sit in the middle of the timeline they act on, the way every
	   NLE arranges them, rather than trailing off the left edge. */
	.toolbar-centre-group {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-width: 0;
	}

	.zoom-controls-cluster {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--ms-edge);
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--ms-edge);
	}

	.zoom-btn {
		background: none;
		border: none;
		color: var(--ms-text-secondary);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
		transition: color 0.15s ease;
	}

	.zoom-btn:hover {
		color: var(--ms-text);
	}

	.zoom-slider-range {
		width: 72px;
		height: 4px;
		accent-color: var(--ms-text);
		cursor: pointer;
	}

	.zoom-percentage-badge {
		font-size: 0.65rem;
		color: var(--ms-text-tertiary);
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
	/* The old value transcribed Tailwind's `w-48` as 48px; w-48 is 12rem.
	   Every sizing rule in this file had the same bug, which is why the whole
	   timeline was roughly a quarter of its intended size. */
	.track-label-rows {
		display: flex;
		flex-direction: column;
	}

	.track-labels-sidebar {
		width: 176px;
		overflow: hidden;
		background: var(--ms-material);
		border-right: 1px solid var(--ms-edge);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		z-index: 15;
	}

	/* Must match .timecode-ruler exactly or every label row sits off by the
	   difference, compounding down the stack. */
	.ruler-corner-cell {
		height: 26px;
		/* Without this the flex column squashes it to ~16px and the entire label
		   stack sits 10px above its own lanes — the same compression that hit the
		   label rows. Row heights matching lane heights is not enough; the columns
		   have to start at the same y too. */
		flex-shrink: 0;
		background: var(--ms-material);
		border-bottom: 1px solid var(--ms-edge);
		display: flex;
		align-items: center;
		padding: 0 10px;
	}

	/* ── Track header ────────────────────────────────────────────────────────
	   Index, name and switches, stacked — the arrangement every NLE uses, and
	   the one this column had been abbreviating away. Switches stay visible;
	   they are the track's state, not a menu. */
	.track-head-row {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.track-index-badge {
		flex-shrink: 0;
		padding: 0 4px;
		min-width: 20px;
		text-align: center;
		border: 1px solid var(--track-color);
		border-radius: 3px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 9.5px;
		font-weight: 700;
		line-height: 15px;
		color: var(--track-color);
	}

	.track-channels {
		margin-left: auto;
		flex-shrink: 0;
		font-size: 9.5px;
		color: var(--ms-text-tertiary);
	}

	.track-switch-row {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.track-switch {
		width: 17px;
		height: 15px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--ms-edge);
		border-radius: 3px;
		background: transparent;
		color: var(--ms-text-tertiary);
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			color var(--ms-fast) var(--ms-ease);
	}

	.track-switch svg {
		width: 10px;
		height: 10px;
	}

	.track-switch.letter {
		font-family: 'JetBrains Mono', monospace;
		font-size: 9px;
		font-weight: 700;
		line-height: 1;
	}

	.track-switch:hover {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	.track-switch.on {
		background: var(--ms-text);
		border-color: var(--ms-text);
		color: var(--ms-void);
	}

	.track-switch.swatch {
		border-color: var(--ms-edge-strong);
	}

	.track-clip-count {
		font-size: 9.5px;
		color: var(--ms-text-tertiary);
	}

	.track-label-row.compact .track-head-row {
		gap: 6px;
	}

	.playhead-readout {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--ms-text);
		font-variant-numeric: tabular-nums;
	}

	.tracks-header-label {
		color: var(--ms-text-secondary); /* on-surface-variant */
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
	}

	/* Height comes from the track itself now (see trackModel.trackHeight), so
	   a label row and its lane cannot drift apart. */
	.track-label-row {
		position: relative;
		display: flex;
		/* The sidebar is a flex column: without this, rows are compressed once
		   the stack overflows and drift out of step with their lanes. */
		flex-shrink: 0;
		box-sizing: border-box;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;
		padding: 0 8px;
		gap: 6px;
		/* A lane collapsing because its last clip was deleted (or opening
		   because one just landed) reads as the row responding to what you
		   did, not the layout snapping under you. Matched on the lane below
		   so the two columns move together. */
		transition: height 160ms var(--ms-ease);
		border-bottom: 1px solid var(--ms-edge);
		background: var(--ms-void); /* surface-container-lowest */
	}

	.track-name {
		min-width: 0;
		font-size: 11.5px;
		font-weight: 590;
		color: var(--ms-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}


	/* Scrollable Viewport with Custom Dark Scrollbars */
	.tracks-scroll-viewport {
		flex: 1;
		overflow-x: auto;
		overflow-y: auto;
		background: var(--ms-void); /* surface-container-lowest */
		position: relative;
		scrollbar-width: thin;
		scrollbar-color: var(--ms-edge) var(--ms-void);
	}

	.tracks-scroll-viewport::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	.tracks-scroll-viewport::-webkit-scrollbar-track {
		background: var(--ms-void);
	}

	.tracks-scroll-viewport::-webkit-scrollbar-thumb {
		background: var(--ms-edge);
		border-radius: 4px;
		border: 1px solid var(--ms-edge);
	}

	.tracks-scroll-viewport::-webkit-scrollbar-thumb:hover {
		background: var(--ms-edge-strong);
	}

	.tracks-stage-canvas {
		position: relative;
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	/* Timecode Ruler */
	.tracks-scroll-viewport.panning {
		cursor: grabbing;
	}

	.fit-btn {
		width: auto;
		padding: 0 8px;
		font-size: 10.5px;
		letter-spacing: 0.02em;
	}

	.timecode-ruler {
		height: 26px;
		background: var(--ms-material);
		border-bottom: 1px solid var(--ms-edge);
		/* Sticky, not relative: with enough tracks the ruler used to scroll off
		   the top and leave you editing against no timecode at all. */
		position: sticky;
		top: 0;
		z-index: 20;
		cursor: pointer;
		flex-shrink: 0;
	}

	.ruler-mark-major {
		position: absolute;
		top: 0;
		bottom: 0;
		border-left: 1px solid var(--ms-edge);
	}

	.ruler-mark-minor {
		position: absolute;
		height: 35%;
		top: 65%;
		border-left: 1px solid rgba(255,255,255,0.08);
	}

	.ruler-timecode {
		position: absolute;
		top: 4px;
		left: 5px;
		font-size: 0.65rem;
		color: var(--ms-text-tertiary);
		pointer-events: none;
	}

	/* Track Lanes Stack */
	.track-lanes-stack {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.track-row-lane {
		border-bottom: 1px solid var(--ms-edge);
		position: relative;
		flex-shrink: 0;
		box-sizing: border-box;
		border-bottom: 1px solid var(--ms-edge);
		transition: height 160ms var(--ms-ease);
		background: repeating-linear-gradient(
			90deg,
			transparent,
			transparent 79px,
			rgba(255, 255, 255, 0.015) 79px,
			rgba(255, 255, 255, 0.015) 80px
		);
	}

	/* Lane heights are data, not CSS — see the style attribute in the markup. */
	.track-row-lane.drop-target {
		background-color: rgba(255, 255, 255, 0.05);
		box-shadow: inset 0 0 0 1px var(--ms-edge-lit);
	}

	.track-row-lane.hidden-track {
		opacity: 0.35;
	}

	/* The track's own colour, as a spine down the left of its lane. */
	.track-row-lane::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 2px;
		background: var(--track-color, transparent);
		opacity: 0.9;
		pointer-events: none;
	}

	.track-label-row {
		border-left: 3px solid var(--track-color, transparent);
	}

	.track-label-row.locked .track-name {
		opacity: 0.5;
	}

	.swatch-menu {
		position: absolute;
		left: 8px;
		top: 100%;
		z-index: 60;
		display: grid;
		grid-template-columns: repeat(4, 16px);
		gap: 6px;
		padding: 8px;
		border: 1px solid var(--ms-edge-strong);
		border-radius: var(--ms-radius);
		background: var(--ms-raised);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
	}

	.swatch-option {
		width: 16px;
		height: 16px;
		border: 1px solid transparent;
		border-radius: 50%;
		cursor: pointer;
		padding: 0;
	}

	.swatch-option.selected {
		border-color: var(--ms-text);
		box-shadow: 0 0 0 2px var(--ms-void);
	}

	/* Snapping Guide Line */
	.snap-indicator-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1.5px;
		background: var(--ms-text);
		box-shadow: 0 0 8px var(--ms-text), 0 0 2px var(--ms-text);
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
		background: var(--ms-text);
		color: var(--ms-void);
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
		border-top: 4px solid var(--ms-text);
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
		background: var(--ms-text);
		box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
	}

	.font-mono {
		font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
	}

	@media (prefers-reduced-motion: reduce) {
		.track-label-row,
		.track-row-lane {
			transition: none;
		}
	}
</style>