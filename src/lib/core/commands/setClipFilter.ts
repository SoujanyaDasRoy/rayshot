import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

interface SetClipFilterCommandData {
	clipId: string;
	filterName: string;
	value: unknown;
}

export class SetClipFilterCommand extends Command {
	private project: Project | null = null;
	private oldFilterValue: unknown = undefined;
	private hadFilters: boolean = false;

	constructor(private data: SetClipFilterCommandData) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		this.hadFilters = clip.filters !== undefined;
		this.oldFilterValue = this.hadFilters ? clip.filters[this.data.filterName] : undefined;

		const updatedClips = new Map(project.clips);
		const baseFilters = this.hadFilters ? { ...clip.filters } : {};
		baseFilters[this.data.filterName] = this.data.value;
		const updatedClip: Clip = { ...clip, filters: baseFilters };
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

		const restoredFilters = this.hadFilters ? { ...clip.filters } : {};
		if (this.oldFilterValue === undefined) {
			delete restoredFilters[this.data.filterName];
		} else {
			restoredFilters[this.data.filterName] = this.oldFilterValue;
		}

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, { ...clip, filters: restoredFilters });

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
