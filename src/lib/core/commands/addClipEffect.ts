import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project } from '$lib/types/project';
import { applyEffectDefaults } from '../effects/effectRegistry';

/**
 * Apply an effect, and seed its parameters in the same step.
 *
 * The drawer used to fire one AddClipEffect plus one SetClipFilter per
 * parameter, so applying VHS Retro cost four entries in a fifty-deep undo
 * stack and four presses of Ctrl+Z to take back.
 */
export class AddClipEffectCommand extends Command {
	private project: Project | null = null;
	private previousEffects: string[] | null = null;
	private previousFilters: Record<string, unknown> | null = null;

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
		this.previousFilters = { ...(clip.filters ?? {}) };
		const effects = clip.effects.includes(this.data.effectId)
			? clip.effects
			: [...clip.effects, this.data.effectId];

		// Defaults only fill gaps: re-applying an effect keeps whatever the user
		// dialled in last time.
		const filters = applyEffectDefaults(
			(clip.filters ?? {}) as Record<string, number>,
			this.data.effectId
		);

		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, { ...clip, effects, filters });

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
		updatedClips.set(this.data.clipId, {
			...clip,
			effects: this.previousEffects,
			filters: this.previousFilters ?? {}
		});

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
