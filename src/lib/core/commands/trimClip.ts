import { Command } from './base';
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

	protected execute(): void {
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

		// Determine which side to trim
		let newSourceIn = this.clip.sourceIn;
		let newSourceOut = this.clip.sourceOut;
		let newTimelineStart = this.clip.timelineStart;

		if (this.data.side === 'start') {
			newSourceIn = this.data.newSourceTime;
			// Ensure sourceIn does not exceed sourceOut
			if (newSourceIn > newSourceOut) {
				newSourceIn = newSourceOut;
			}
			// When trimming start, adjust timelineStart to keep end point fixed
			const endTime = this.clip.timelineStart + (this.clip.sourceOut - this.clip.sourceIn);
			newTimelineStart = endTime - (newSourceOut - newSourceIn);
		} else { // 'end'
			newSourceOut = this.data.newSourceTime;
			// Ensure sourceOut is not less than sourceIn
			if (newSourceOut < newSourceIn) {
				newSourceOut = newSourceIn;
			}
			// When trimming end, timelineStart stays the same
			newTimelineStart = this.clip.timelineStart;
		}

		// Ensure sourceIn and sourceOut are within media asset bounds
		const mediaAsset = project.assets.get(this.clip.mediaAssetId);
		if (mediaAsset) {
			if (newSourceIn < 0) newSourceIn = 0;
			if (newSourceIn > mediaAsset.duration) newSourceIn = mediaAsset.duration;
			if (newSourceOut < 0) newSourceOut = 0;
			if (newSourceOut > mediaAsset.duration) newSourceOut = mediaAsset.duration;
			// Ensure sourceIn <= sourceOut
			if (newSourceIn > newSourceOut) {
				// Swap? Actually, we should clamp one to the other.
				// If sourceIn > sourceOut after clamping, set sourceIn = sourceOut (or vice versa)
				// We'll set sourceIn = sourceOut (so duration zero)
				newSourceIn = newSourceOut;
			}
		}

		// Update the clip
		const updatedClip: Clip = {
			...this.clip,
			sourceIn: newSourceIn,
			sourceOut: newSourceOut,
			timelineStart: newTimelineStart,
			timelineDuration: newSourceOut - newSourceIn
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

	protected undo(): void {
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