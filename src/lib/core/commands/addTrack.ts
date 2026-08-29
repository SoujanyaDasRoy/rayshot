import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Track, Sequence } from '$lib/types/project';

interface AddTrackCommandData {
	type: 'video' | 'audio';
	index: number;
}

export class AddTrackCommand extends Command {
	public track: Track;
	private project: Project | null = null;

	constructor(private data: AddTrackCommandData) {
		super();
		this.track = {
			id: `track-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
			type: data.type,
			order: data.index,
			clipInstances: []
		};
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
