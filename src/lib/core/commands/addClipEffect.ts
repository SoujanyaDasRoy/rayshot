import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project } from '$lib/types/project';

export class AddClipEffectCommand extends Command {
	private project: Project | null = null;
	private previousEffects: string[] | null = null;

	constructor(private data: { clipId: string; effectId: string }) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		this.previousEffects = clip.effects;
		const effects = clip.effects.includes(this.data.effectId)
			? clip.effects
			: [...clip.effects, this.data.effectId];

		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, { ...clip, effects });

		projectStore.set({
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		});
	}

	undo(): void {
		if (!this.project || !this.previousEffects) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, { ...clip, effects: this.previousEffects });

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
