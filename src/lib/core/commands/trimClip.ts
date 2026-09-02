import { Command } from './base';
import { clipRate, timelineDurationForRate } from '../../utils/clipTiming';
import type { Project, Sequence, Track, Clip, MediaAsset } from '$lib/types/project';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';

interface TrimClipCommandData {
	clipId: string;
	side: 'start' | 'end';
	// The new sourceIn or sourceOut value in seconds
	newSourceTime: number;
}

export class TrimClipCommand extends Command {
	private project: Project | null = null;
	private clip: Clip | null = null;
	private oldValues: {
		sourceIn: number;
		sourceOut: number;
		timelineStart: number;
		timelineDuration: number;
	} | null = null;

	constructor(private data: TrimClipCommandData) {
		super();
	}

	execute(): void {
		// Get current project state
		const project = get(projectStore);
		if (!project) throw new Error('No project loaded');

		// Store references for undo
		this.project = { ...project };

		// Find the clip
		const clip = project.clips.get(this.data.clipId);
		if (!clip) throw new Error('Clip not found');
		this.clip = { ...clip };

		// Store old values for undo
		this.oldValues = {
			sourceIn: this.clip.sourceIn,
			sourceOut: this.clip.sourceOut,
			timelineStart: this.clip.timelineStart,
			timelineDuration: this.clip.timelineDuration
		};

		// Captured before anything moves: the trim has to hand the clip back at
		// the speed it was already playing. Writing `newSourceOut - newSourceIn`
		// here — which is what this did — quietly resets every retimed clip to 1x.
		const rate = clipRate(this.clip);

		// Determine which side to trim
		let newSourceIn = this.clip.sourceIn;
		let newSourceOut = this.clip.sourceOut;
		let newTimelineStart = this.clip.timelineStart;

		// Clamp to media asset duration bounds first
		const mediaAsset = project.assets.get(this.clip.mediaAssetId);
		const maxDuration = mediaAsset ? mediaAsset.duration : Infinity;

		if (this.data.side === 'start') {
			newSourceIn = Math.max(0, Math.min(this.data.newSourceTime, newSourceOut, maxDuration));
			const endTime = this.clip.timelineStart + this.clip.timelineDuration;
			newTimelineStart = endTime - timelineDurationForRate(newSourceIn, newSourceOut, rate);
		} else { // 'end'
			newSourceOut = Math.max(newSourceIn, Math.min(this.data.newSourceTime, maxDuration));
			newTimelineStart = this.clip.timelineStart;
		}

		// Update the clip
		const updatedClip: Clip = {
			...this.clip,
			sourceIn: newSourceIn,
			sourceOut: newSourceOut,
			timelineStart: newTimelineStart,
			timelineDuration: timelineDurationForRate(newSourceIn, newSourceOut, rate)
		};

		// Update the clip in the project's clips map
		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, updatedClip);

		// Update project with modified clips
		const updatedSequences = project.sequences.map((s: Sequence) => {
			// We need to ensure the clipInstances are unchanged (they are)
			return s;
		});

		const updatedProject: Project = {
			...project,
			assets: project.assets, // Keep assets unchanged
			clips: updatedClips,
			sequences: updatedSequences,
			modifiedAt: Date.now()
		};

		// Update the store
		projectStore.set(updatedProject);
	}

	undo(): void {
		if (!this.project || !this.oldValues) return;
		const restoredClip: Clip = {
			...this.clip!,
			sourceIn: this.oldValues.sourceIn,
			sourceOut: this.oldValues.sourceOut,
			timelineStart: this.oldValues.timelineStart,
			timelineDuration: this.oldValues.timelineDuration
		};

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.clip!.id, restoredClip);

		const updatedProject: Project = {
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt // restore original modifiedAt
		};
		projectStore.set(updatedProject);
	}
}