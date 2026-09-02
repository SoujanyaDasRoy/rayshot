import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Clip, Project } from '$lib/types/project';
import { timelineDurationForRate } from '../../utils/clipTiming';

interface Data {
	clipId: string;
	/** 1 is real time. */
	speed: number;
}

/**
 * Change a clip's playback speed.
 *
 * Speed is not a stored field: it is the ratio between a clip's source span and
 * its timeline length, so setting the speed means resizing the clip. This
 * replaces SetClipPlaybackRateCommand, which wrote a `playbackRate` field that
 * the renderer read while the seek position came from the ratio — two numbers
 * for one fact, and they disagreed the moment you touched the dropdown.
 *
 * The clip changes length, so it can now overlap its neighbour. Nothing detects
 * overlap anywhere yet; a ripple is a separate decision.
 */
export class SetClipSpeedCommand extends Command {
	private previousDuration: number | null = null;

	constructor(private data: Data) {
		super();
	}

	private write(timelineDuration: number): void {
		const project = get(projectStore);
		if (!project) return;
		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		const clips = new Map(project.clips);
		const updated: Clip = { ...clip, timelineDuration };
		clips.set(this.data.clipId, updated);
		projectStore.set({ ...project, clips, modifiedAt: Date.now() } as Project);
	}

	execute(): void {
		const project = get(projectStore);
		const clip = project?.clips.get(this.data.clipId);
		if (!clip) return;

		if (this.previousDuration === null) this.previousDuration = clip.timelineDuration;
		this.write(timelineDurationForRate(clip.sourceIn, clip.sourceOut, this.data.speed));
	}

	undo(): void {
		if (this.previousDuration === null) return;
		this.write(this.previousDuration);
	}

	/** Stepping through the speed dropdown is one decision, not one per step. */
	mergeWith(next: Command): boolean {
		if (!(next instanceof SetClipSpeedCommand)) return false;
		if (next.data.clipId !== this.data.clipId) return false;
		this.data = { ...this.data, speed: next.data.speed };
		return true;
	}
}
