import { Command } from './base';
// Relative, not $lib: the node Vitest project cannot resolve bare $lib.
import { DEFAULT_COLOR_GRADE } from '../rendering/colorGradeUniforms';
import type { Project, Sequence, Track, Clip, MediaAsset } from '$lib/types/project';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';

interface AddClipCommandData {
	mediaAssetId: string;
	trackId: string;
	position: number; // timeline position in seconds
}

export class AddClipCommand extends Command {
	private project: Project | null = null;
	private sequence: Sequence | null = null;
	private track: Track | null = null;
	private mediaAsset: MediaAsset | null = null;
	private clipId: string = '';

	/**
	 * The clip this command created, so a caller can immediately act on it —
	 * a title needs its words set the moment it exists. Empty before execute.
	 */
	getCreatedClipId(): string {
		return this.clipId;
	}

	constructor(private data: AddClipCommandData) {
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

		// Find the track
		const track = sequence.tracks.find(t => t.id === this.data.trackId);
		if (!track) throw new Error('Track not found');
		this.track = { ...track };

		// Find the media asset
		const mediaAsset = project.assets.get(this.data.mediaAssetId);
		if (!mediaAsset) throw new Error('Media asset not found');
		this.mediaAsset = { ...mediaAsset };

		// Generate a unique ID for the new clip (preserve on redo)
		this.clipId = this.clipId || Math.random().toString(36).substr(2, 9);

		// Create the new clip
		const newClip: Clip = {
			id: this.clipId,
			mediaAssetId: this.data.mediaAssetId,
			sourceIn: 0,
			sourceOut: mediaAsset.duration,
			timelineStart: this.data.position,
			timelineDuration: mediaAsset.duration,
			transform: {
				x: 0,
				y: 0,
				scale: 1,
				rotation: 0
			},
			effects: [],
			audioParameters: {
				volume: 1.0,
				mute: false
			},
			filters: {},
			// Single source of truth — this literal used to be duplicated here and
			// in ColorGradePanel, and the two had already drifted apart.
			colorGrade: structuredClone(DEFAULT_COLOR_GRADE)
		};

		// Add clip to track's clipInstances
		const updatedTrack: Track = {
			...track,
			clipInstances: [...track.clipInstances, this.clipId]
		};

		// Update sequence with modified track
		const updatedTracks = sequence.tracks.map((t: Track) =>
			t.id === this.data.trackId ? updatedTrack : t
		);

		const updatedSequence: Sequence = {
			...sequence,
			tracks: updatedTracks
		};

		// Add the new clip to the project's clips map
		const updatedClips = new Map(project.clips);
		updatedClips.set(this.clipId, newClip);

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