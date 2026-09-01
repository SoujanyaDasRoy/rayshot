import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

interface SetTransformCommandData {
	clipId: string;
	transform: Clip['transform'];
}

export class SetTransformCommand extends Command {
	private project: Project | null = null;
	private previousTransform: Clip['transform'] | null = null;

	constructor(private data: SetTransformCommandData) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		this.previousTransform = clip.transform;

		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, { ...clip, transform: this.data.transform });

		projectStore.set({
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		});
	}

	undo(): void {
		if (!this.project || !this.previousTransform) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, { ...clip, transform: this.previousTransform });

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
