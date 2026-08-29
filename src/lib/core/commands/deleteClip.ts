import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Sequence, Track, Clip } from '$lib/types/project';

interface DeleteClipCommandData {
	clipId: string;
}

export class DeleteClipCommand extends Command {
	private project: Project | null = null;
	private trackId: string | null = null;
	private originalClip: Clip | null = null;

	constructor(private data: DeleteClipCommandData) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;
		this.originalClip = { ...clip };

		// Find which track contains this clip
		let foundTrackId: string | null = null;
		for (const seq of project.sequences) {
			if (seq.id === project.activeSequenceId) {
				for (const track of seq.tracks) {
					if (track.clipInstances.includes(this.data.clipId)) {
						foundTrackId = track.id;
						break;
					}
				}
				break;
			}
		}
		this.trackId = foundTrackId;

		const updatedClips = new Map(project.clips);
		updatedClips.delete(this.data.clipId);

		const updatedSequences: Sequence[] = project.sequences.map((seq: Sequence) => {
			if (seq.id === project.activeSequenceId) {
				const updatedTracks = seq.tracks.map((track: Track) => {
					if (track.id === this.trackId) {
						return {
							...track,
							clipInstances: track.clipInstances.filter((id: string) => id !== this.data.clipId)
						};
					}
					return track;
				});
				return { ...seq, tracks: updatedTracks };
			}
			return seq;
		});

		const updatedProject: Project = {
			...project,
			clips: updatedClips,
			sequences: updatedSequences,
			modifiedAt: Date.now()
		};

		projectStore.set(updatedProject);
	}

	undo(): void {
		if (!this.project) return;
		projectStore.set(this.project);
	}
}
