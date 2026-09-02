import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

interface SetTransformCommandData {
	clipId: string;
	transform: Clip['transform'];
}

/** A drag ticks this command once per mousemove. Two ticks further apart than
 *  this are treated as separate gestures — the same rule the colour grade
 *  sliders use, and for the same reason. */
const MERGE_WINDOW_MS = 500;

export class SetTransformCommand extends Command {
	private project: Project | null = null;
	private previousTransform: Clip['transform'] | null = null;
	private lastAppliedAt = 0;

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
		this.lastAppliedAt = Date.now();

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

	/**
	 * Absorb the next tick of the same drag. `next` has already applied
	 * itself to the store; this just adopts its target transform so a later
	 * undo lands on the value the user actually let go of, while keeping the
	 * transform captured on this command's own first execute as the floor.
	 */
	mergeWith(next: Command): boolean {
		if (!(next instanceof SetTransformCommand)) return false;
		if (next.data.clipId !== this.data.clipId) return false;
		if (Date.now() - this.lastAppliedAt > MERGE_WINDOW_MS) return false;

		this.data = { ...this.data, transform: next.data.transform };
		this.lastAppliedAt = Date.now();
		return true;
	}
}
