import { writable, derived } from 'svelte/store';
import type { TimelineState, TimelineAction } from './timeline.types';
import type { Sequence, Track, Clip, MediaAsset } from '$lib/types/project';
import { projectStore } from '$lib/stores/project.svelte';
import { commandProcessor } from '$lib/core/commands/processor';
import { AddClipCommand } from '$lib/core/commands/addClip';
import { MoveClipCommand } from '$lib/core/commands/moveClip';
import { TrimClipCommand } from '$lib/core/commands/trimClip';
import { SplitClipCommand } from '$lib/core/commands/splitClip';
import { get } from 'svelte/store';

// Timeline interaction and UI state
export const timelineStore = writable<TimelineState>({
	// Current selection
	selectedClipId: null,
	selectedTrackId: null,
	// Viewport
	zoomLevel: 1.0, // 1.0 = 1 second = 100px (adjustable)
	timeOffset: 0, // What time is at the left edge of viewport
	// Editing state
	isDragging: false,
	dragStartX: 0,
	dragStartTime: 0,
	// Snapping
	snapToGrid: true,
	snapGridSize: 0.1, // seconds (100ms)
	// Audio waveform cache (to avoid recomputing)
	waveformCache: new Map<string, number[]>() // clipId -> waveform data
});

// Derived stores for computed values
export const selectedClip = derived(
	[timelineStore, projectStore],
	([$timeline, $project]) => {
		if (!$project || !$timeline.selectedClipId) return null;
		// Find clip in active sequence
		const sequence = $project.sequences.find((s: Sequence) => s.id === $project.activeSequenceId);
		if (!sequence) return null;
		
		for (const track of sequence.tracks) {
			for (const clipId of track.clipInstances) {
				if (clipId === $timeline.selectedClipId) {
					// We'd need to lookup the actual clip data from somewhere
					// For now, return the ID - in a real implementation we'd have
					// a way to get the full clip object
					return { id: clipId, trackId: track.id };
				}
			}
		}
		return null;
	}
);

// Action types for timeline operations
export const timelineActions = {
	selectClip: (clipId: string | null) => {
		timelineStore.update((state) => ({
			...state,
			selectedClipId: clipId
		}));
	},
	
	selectTrack: (trackId: string | null) => {
		timelineStore.update((state) => ({
			...state,
			selectedTrackId: trackId
		}));
	},
	
	setZoomLevel: (zoom: number) => {
		timelineStore.update((state) => ({
			...state,
			zoomLevel: Math.max(0.1, Math.min(10, zoom)) // Clamp between 0.1 and 10
		}));
	},
	
	setTimeOffset: (offset: number) => {
		timelineStore.update((state) => ({
			...state,
			timeOffset: offset
		}));
	},
	
	setSnapToGrid: (enabled: boolean) => {
		timelineStore.update((state) => ({
			...state,
			snapToGrid: enabled
		}));
	},
	
	setSnapGridSize: (size: number) => {
		timelineStore.update((state) => ({
			...state,
			snapGridSize: Math.max(0.01, size) // Minimum 10ms
		}));
	},
	
	startDrag: (x: number, time: number) => {
		timelineStore.update((state) => ({
			...state,
			isDragging: true,
			dragStartX: x,
			dragStartTime: time
		}));
	},
	
	updateDrag: (x: number) => {
		timelineStore.update((state) => {
			if (!state.isDragging) return state;
			const deltaX = x - state.dragStartX;
			const deltaTime = deltaX / (100 * state.zoomLevel); // 100px per second at zoom=1
			return {
				...state,
				// In a real implementation, we'd apply this to the selected clip
				// For now just store the drag state
			};
		});
	},
	
	endDrag: () => {
		timelineStore.update((state) => ({
			...state,
			isDragging: false
		}));
	},
	
	// Timeline manipulation actions that execute commands
	addClip: (clipData: { mediaAssetId: string; trackId: string; position: number }) => {
		const command = new AddClipCommand(clipData);
		commandProcessor.execute(command);
	},
	
	moveClip: (clipData: { clipId: string; newTrackId: string; newPosition: number }) => {
		const command = new MoveClipCommand(clipData);
		commandProcessor.execute(command);
	},
	
	trimClip: (clipData: { clipId: string; side: 'start' | 'end'; newSourceTime: number }) => {
		const command = new TrimClipCommand(clipData);
		commandProcessor.execute(command);
	},
	
	splitClip: (clipData: { clipId: string; splitTime: number }) => {
		const command = new SplitClipCommand(clipData);
		commandProcessor.execute(command);
	}
};
