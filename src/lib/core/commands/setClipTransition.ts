import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project } from '$lib/types/project';

export class SetClipTransitionCommand extends Command {
	private project: Project | null = null;
	private previousTransitionIn: string | undefined = undefined;

	constructor(private data: { clipId: string; transitionId: string }) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		this.previousTransitionIn = clip.transitionIn;

		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, { ...clip, transitionIn: this.data.transitionId });

		projectStore.set({
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		});
	}

	undo(): void {
		if (!this.project) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, { ...clip, transitionIn: this.previousTransitionIn });

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
