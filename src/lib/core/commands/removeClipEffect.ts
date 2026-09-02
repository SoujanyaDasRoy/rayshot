import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';

/**
 * Take an effect off a clip.
 *
 * The clip's filter values are deliberately left alone: they are the settings
 * you dialled in, and re-applying the effect should find them where you left
 * them rather than resetting to the preset.
 */
export class RemoveClipEffectCommand extends Command {
	private previousEffects: string[] | null = null;

	constructor(private data: { clipId: string; effectId: string }) {
		super();
	}

	private writeEffects(effects: string[]): void {
		const project = get(projectStore);
		if (!project) return;
		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		const clips = new Map(project.clips);
		clips.set(this.data.clipId, { ...clip, effects });
		projectStore.set({ ...project, clips, modifiedAt: Date.now() });
	}

	execute(): void {
		const project = get(projectStore);
		const clip = project?.clips.get(this.data.clipId);
		if (!clip) return;
		this.previousEffects = clip.effects;
		this.writeEffects(clip.effects.filter((id) => id !== this.data.effectId));
	}

	undo(): void {
		if (!this.previousEffects) return;
		this.writeEffects(this.previousEffects);
	}
}
