import { Command } from './base';
import type { Project, Sequence, Track, Clip } from '$lib/types/project';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';

interface MoveClipCommandData {
	clipId: string;
	newTrackId: string;
	newPosition: number; // timeline position in seconds
}

export class MoveClipCommand extends Command {
	private project: Project | null = null;
	private sequence: Sequence | null = null;
	private oldTrackId: string = '';
	private oldPosition: number = 0;
	private newTrackId: string = '';
	private newPosition: number = 0;
	private clip: Clip | null = null;

	constructor(private data: MoveClipCommandData) {
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

		// Find the clip to move
		let found = false;
		for (const track of sequence.tracks) {
			const index = track.clipInstances.indexOf(this.data.clipId);
			if (index !== -1) {
				// Found the clip
				this.oldTrackId = track.id;
				const clip = project.clips.get(this.data.clipId);
				if (!clip) throw new Error('Clip not found');
				this.clip = { ...clip };
				this.oldPosition = clip.timelineStart;
				found = true;
				break;
			}
		}
		if (!found) throw new Error('Clip not found in any track');

		// Find the new track
		const newTrack = sequence.tracks.find(t => t.id === this.data.newTrackId);
		if (!newTrack) throw new Error('New track not found');
		this.newTrackId = newTrack.id;
		this.newPosition = this.data.newPosition;

		// Update the clip's timelineStart
		const updatedClip: Clip = {
			...this.clip!,
			timelineStart: this.newPosition
		};

		// Update tracks in sequence
		let updatedTracks: Track[];
		if (this.oldTrackId === this.newTrackId) {
			updatedTracks = sequence.tracks.map((t: Track) => {
				if (t.id === this.oldTrackId) {
					return {
						...t,
						clipInstances: t.clipInstances.includes(this.data.clipId)
							? [...t.clipInstances]
							: [...t.clipInstances, this.data.clipId]
					};
				}
				return t;
			});
		} else {
			// Remove clip from old track
			const updatedOldTrack: Track = {
				...sequence.tracks.find(t => t.id === this.oldTrackId)!,
				clipInstances: sequence.tracks.find(t => t.id === this.oldTrackId)!.clipInstances.filter(id => id !== this.data.clipId)
			};

			// Add clip to new track
			const updatedNewTrack: Track = {
				...newTrack,
				clipInstances: [...newTrack.clipInstances, this.data.clipId]
			};

			updatedTracks = sequence.tracks.map((t: Track) => {
				if (t.id === this.oldTrackId) return updatedOldTrack;
				if (t.id === this.newTrackId) return updatedNewTrack;
				return t;
			});
		}

		const updatedSequence: Sequence = {
			...sequence,
			tracks: updatedTracks
		};

		// Update the clip in the project's clips map
		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, updatedClip);

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