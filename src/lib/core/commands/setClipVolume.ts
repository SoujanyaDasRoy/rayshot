import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';
import { audioEngine } from '../audioEngine';

interface SetClipVolumeCommandData {
	clipId: string;
	volume: number;
}

export class SetClipVolumeCommand extends Command {
	private project: Project | null = null;
	private oldVolume: number | null = null;

	constructor(private data: SetClipVolumeCommandData) {
		super();
	}

	execute(): void {
		const project = get(projectStore);
		if (!project) return;
		this.project = { ...project };

		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;
		this.oldVolume = clip.audioParameters.volume;

		const updatedClips = new Map(project.clips);
		const updatedClip: Clip = {
			...clip,
			audioParameters: { ...clip.audioParameters, volume: this.data.volume }
		};
		updatedClips.set(this.data.clipId, updatedClip);

		const updatedProject: Project = {
			...project,
			clips: updatedClips,
			modifiedAt: Date.now()
		};
		projectStore.set(updatedProject);

		// Notify audio mixing graph for immediate playback update
		audioEngine.setClipVolume(this.data.clipId, this.data.volume);
	}

	undo(): void {
		if (!this.project || this.oldVolume === null) return;
		const clip = this.project.clips.get(this.data.clipId);
		if (!clip) return;

		const updatedClips = new Map(this.project.clips);
		updatedClips.set(this.data.clipId, {
			...clip,
			audioParameters: { ...clip.audioParameters, volume: this.oldVolume }
		});

		projectStore.set({
			...this.project,
			clips: updatedClips,
			modifiedAt: this.project.modifiedAt
		});
	}
}
