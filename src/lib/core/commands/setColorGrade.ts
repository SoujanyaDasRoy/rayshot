import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

export class SetColorGradeCommand<K extends keyof Clip['colorGrade']> extends Command {
	private project: Project | null = null;
	private previousColorGrade: Clip['colorGrade'] | null = null;

	constructor(private data: { clipId: string; propertyName: K; value: Clip['colorGrade'][K] }) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		// Store a copy of the current colorGrade for undo
		this.previousColorGrade = { ...clip.colorGrade };

		const updatedClips = new Map(project.clips);
		const updatedColorGrade = { ...clip.colorGrade };
		updatedColorGrade[this.data.propertyName] = this.data.value;
		const updatedClip: Clip = { ...clip, colorGrade: updatedColorGrade };
		updatedClips.set(this.data.clipId, updatedClip);

		const updatedProject: Project = {
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		};
		projectStore.set(updatedProject);
	}

	undo(): void {
		if (!this.project) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		const updatedClip: Clip = { ...clip, colorGrade: this.previousColorGrade! };
		updatedClips.set(this.data.clipId, updatedClip);

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}