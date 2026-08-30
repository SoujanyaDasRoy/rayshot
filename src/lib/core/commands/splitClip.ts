import { Command } from './base';
import type { Project, Sequence, Track, Clip, MediaAsset } from '$lib/types/project';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';

interface SplitClipCommandData {
	clipId: string;
	splitTime: number; // timeline position in seconds where to split
}

export class SplitClipCommand extends Command {
	private project: Project | null = null;
	private sequence: Sequence | null = null;
	private originalClip: Clip | null = null;
	private firstClipId: string = '';
	private secondClipId: string = '';

	constructor(private data: SplitClipCommandData) {
		super();
	}

	execute(): void {
		// Get current project state
		const project = get(projectStore);
		if (!project) throw new Error('No project loaded');

		// Store references for undo
		this.project = { ...project };

		// Find the active sequence
		const sequence = project.sequences.find(s => s.id === project.activeSequenceId);
		if (!sequence) throw new Error('No active sequence');
		this.sequence = { ...sequence };

		// Find the clip to split and its track
		let foundTrack: Track | null = null;
		let clipIndexInTrack = -1;
		for (const track of sequence.tracks) {
			const index = track.clipInstances.indexOf(this.data.clipId);
			if (index !== -1) {
				foundTrack = track;
				clipIndexInTrack = index;
				break;
			}
		}
		if (!foundTrack) throw new Error('Clip not found in any track');

		const originalClipFromStore = project.clips.get(this.data.clipId);
		if (!originalClipFromStore) throw new Error('Clip not found in store');
		this.originalClip = { ...originalClipFromStore };

		// Calculate the source time corresponding to the splitTime
		// The clip's timelineStart is where it begins on the timeline.
		// The splitTime is in timeline coordinates.
		// The offset within the clip is: splitTime - originalClip.timelineStart
		const offsetInClip = this.data.splitTime - this.originalClip.timelineStart;
		if (offsetInClip <= 0 || offsetInClip >= (this.originalClip.sourceOut - this.originalClip.sourceIn)) {
			throw new Error('Split time is outside the clip bounds');
		}

		// Convert offsetInClip to source time:
		// The clip's source portion is [sourceIn, sourceOut)
		// The offsetInClip is in timeline time, which maps directly to source time because we assume a 1:1 mapping (no time stretch).
		// So sourceSplitTime = originalClip.sourceIn + offsetInClip;
		const sourceSplitTime = this.originalClip.sourceIn + offsetInClip;

		// Generate IDs for the two new clips
		this.firstClipId = Math.random().toString(36).substr(2, 9);
		this.secondClipId = Math.random().toString(36).substr(2, 9);

		// Create first clip (left part)
		const firstClip: Clip = {
			id: this.firstClipId,
			mediaAssetId: this.originalClip.mediaAssetId,
			sourceIn: this.originalClip.sourceIn,
			sourceOut: sourceSplitTime,
			timelineStart: this.originalClip.timelineStart,
			timelineDuration: sourceSplitTime - this.originalClip.sourceIn,
			transform: { ...this.originalClip.transform },
			effects: [...this.originalClip.effects],
			audioParameters: { ...this.originalClip.audioParameters },
			playbackRate: this.originalClip.playbackRate,
			filters: { ...this.originalClip.filters },
			colorGrade: { ...this.originalClip.colorGrade }
		};

		// Create second clip (right part)
		const secondClip: Clip = {
			id: this.secondClipId,
			mediaAssetId: this.originalClip.mediaAssetId,
			sourceIn: sourceSplitTime,
			sourceOut: this.originalClip.sourceOut,
			timelineStart: this.data.splitTime, // starts at the split point
			timelineDuration: this.originalClip.sourceOut - sourceSplitTime,
			transform: { ...this.originalClip.transform },
			effects: [...this.originalClip.effects],
			audioParameters: { ...this.originalClip.audioParameters },
			playbackRate: this.originalClip.playbackRate,
			filters: { ...this.originalClip.filters },
			colorGrade: { ...this.originalClip.colorGrade }
		};

		// Update the track's clipInstances: replace the original clip with the two new clips
		const updatedClipInstances = [
			...foundTrack.clipInstances.slice(0, clipIndexInTrack),
			this.firstClipId,
			this.secondClipId,
			...foundTrack.clipInstances.slice(clipIndexInTrack + 1)
		];

		const updatedTrack: Track = {
			...foundTrack,
			clipInstances: updatedClipInstances
		};

		// Update tracks in sequence
		const updatedTracks = sequence.tracks.map((t: Track) => {
			if (t.id === foundTrack.id) return updatedTrack;
			return t;
		});

		const updatedSequence: Sequence = {
			...sequence,
			tracks: updatedTracks
		};

		// Add the new clips to the project's clips map and remove the original
		const updatedClips = new Map(project.clips);
		updatedClips.delete(this.data.clipId);
		updatedClips.set(this.firstClipId, firstClip);
		updatedClips.set(this.secondClipId, secondClip);

		// Update project with modified sequence and clips
		const updatedSequences = project.sequences.map((s: Sequence) =>
			s.id === project.activeSequenceId ? updatedSequence : s
		);

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
		if (!this.project) return;

		// Restore the previous project state
		projectStore.set(this.project);
	}
}