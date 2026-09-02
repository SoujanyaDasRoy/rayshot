import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Track, Sequence } from '$lib/types/project';
// Relative, not $lib: the node Vitest project cannot resolve bare $lib.
import { makeTrack, type TrackType } from '../../utils/trackModel';

interface AddTrackCommandData {
	type: TrackType;
	index: number;
}

export class AddTrackCommand extends Command {
	public track: Track;
	private project: Project | null = null;

	constructor(private data: AddTrackCommandData) {
		super();
		// One place builds a track, so defaults (colour, lock, mute) cannot drift.
		this.track = makeTrack(data.type, data.index);
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const activeSequenceId = project.activeSequenceId;
		if (!activeSequenceId) return;

		const sequenceIndex = project.sequences.findIndex((seq: Sequence) => seq.id === activeSequenceId);
		if (sequenceIndex === -1) return;

		const updatedSequences = [...project.sequences];
		const activeSequence: Sequence = { ...updatedSequences[sequenceIndex] };
		activeSequence.tracks = [
			...activeSequence.tracks.slice(0, this.data.index),
			this.track,
			...activeSequence.tracks.slice(this.data.index)
		];
		activeSequence.tracks.forEach((track: Track, index: number) => {
			track.order = index;
		});
		updatedSequences[sequenceIndex] = activeSequence;

		const updatedProject: Project = {
			...project,
			sequences: updatedSequences,
			modifiedAt: Date.now()
		};
		projectStore.set(updatedProject);
	}

	undo(): void {
		if (this.project) projectStore.set(this.project);
	}
}
