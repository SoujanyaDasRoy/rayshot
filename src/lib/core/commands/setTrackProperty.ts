import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Track, Sequence } from '$lib/types/project';

/** The track fields a user can change directly from the timeline. */
export type TrackProperty =
	| 'color'
	| 'name'
	| 'locked'
	| 'muted'
	| 'solo'
	| 'hidden'
	| 'height';

interface Data {
	trackId: string;
	property: TrackProperty;
	value: Track[TrackProperty];
}

/**
 * Change one track property, undoably.
 *
 * Track mute and lock used to be component-local $state in Timeline.svelte:
 * the buttons toggled, nothing read them, and nothing survived a reload.
 */
export class SetTrackPropertyCommand extends Command {
	private previous: Track[TrackProperty] | undefined;
	private applied = false;

	constructor(private data: Data) {
		super();
	}

	private mapTracks(fn: (t: Track) => Track): void {
		const project = get(projectStore);
		if (!project || !project.activeSequenceId) return;

		const sequences = project.sequences.map((seq: Sequence) =>
			seq.id !== project.activeSequenceId ? seq : { ...seq, tracks: seq.tracks.map(fn) }
		);
		projectStore.set({ ...project, sequences, modifiedAt: Date.now() } as Project);
	}

	execute(): void {
		this.mapTracks((track) => {
			if (track.id !== this.data.trackId) return track;
			if (!this.applied) {
				this.previous = track[this.data.property];
				this.applied = true;
			}
			return { ...track, [this.data.property]: this.data.value };
		});
	}

	undo(): void {
		this.mapTracks((track) =>
			track.id === this.data.trackId ? { ...track, [this.data.property]: this.previous } : track
		);
	}

	/** Dragging a height handle or scrubbing a colour is one gesture, one undo. */
	mergeWith(next: Command): boolean {
		if (!(next instanceof SetTrackPropertyCommand)) return false;
		if (next.data.trackId !== this.data.trackId) return false;
		if (next.data.property !== this.data.property) return false;
		this.data = { ...this.data, value: next.data.value };
		return true;
	}
}
