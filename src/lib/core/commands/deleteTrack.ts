import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Sequence } from '$lib/types/project';

/**
 * Remove a track and every clip on it.
 *
 * Undo restores the whole project snapshot, because deleting a track deletes
 * its clips too and putting those back individually would need to restore
 * their ordering as well.
 */
export class DeleteTrackCommand extends Command {
	private project: Project | null = null;

	constructor(private data: { trackId: string }) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project || !project.activeSequenceId) return;
		this.project = { ...project, sequences: project.sequences.map((s) => ({ ...s, tracks: [...s.tracks] })) };

		const sequences = project.sequences.map((seq: Sequence) => {
			if (seq.id !== project.activeSequenceId) return seq;
			// Never leave a sequence with no tracks at all — there would be
			// nowhere to drop the next clip.
			if (seq.tracks.length <= 1) return seq;
			return { ...seq, tracks: seq.tracks.filter((t) => t.id !== this.data.trackId) };
		});

		const removed = project.sequences
			.flatMap((s) => s.tracks)
			.find((t) => t.id === this.data.trackId);

		const clips = new Map(project.clips);
		for (const clipId of removed?.clipInstances ?? []) clips.delete(clipId);

		projectStore.set({ ...project, sequences, clips, modifiedAt: Date.now() } as Project);
	}

	undo(): void {
		if (this.project) projectStore.set(this.project);
	}
}
