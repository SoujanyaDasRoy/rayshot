import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

export class ToggleClipMuteCommand extends Command {
	private project: Project | null = null;
	private previousAudioParameters: Clip['audioParameters'] | null = null;

	constructor(private data: { clipId: string }) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		this.previousAudioParameters = clip.audioParameters;

		const updatedClips = new Map(project.clips);
		updatedClips.set(this.data.clipId, {
			...clip,
			audioParameters: { ...clip.audioParameters, mute: !clip.audioParameters.mute }
		});

		projectStore.set({
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		});
	}

	undo(): void {
		if (!this.project || !this.previousAudioParameters) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, { ...clip, audioParameters: this.previousAudioParameters });

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
