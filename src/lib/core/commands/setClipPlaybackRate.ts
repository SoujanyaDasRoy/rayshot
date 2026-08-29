import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

interface SetClipPlaybackRateCommandData {
	clipId: string;
	playbackRate: number;
}

export class SetClipPlaybackRateCommand extends Command {
	private project: Project | null = null;
	private oldRate: number | null = null;

	constructor(private data: SetClipPlaybackRateCommandData) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;
		this.oldRate = clip.playbackRate;

		const updatedClips = new Map(project.clips);
		const updatedClip: Clip = { ...clip, playbackRate: this.data.playbackRate };
		updatedClips.set(this.data.clipId, updatedClip);

		const updatedProject: Project = {
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		};
		projectStore.set(updatedProject);
	}

	undo(): void {
		if (!this.project || this.oldRate === null) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, { ...clip, playbackRate: this.oldRate });

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
