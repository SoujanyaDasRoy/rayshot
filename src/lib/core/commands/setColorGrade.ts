import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project, Clip } from '$lib/types/project';

/** How long after the last change a drag is still considered ongoing. */
const MERGE_WINDOW_MS = 500;

export class SetColorGradeCommand<K extends keyof Clip['colorGrade']> extends Command {
	private project: Project | null = null;
	private previousColorGrade: Clip['colorGrade'] | null = null;
	private lastAppliedAt = 0;

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
		// Only snapshot on the first execute: a merged run must undo back to
		// where the drag started, not to its second-to-last frame.
		if (this.previousColorGrade === null) {
			this.previousColorGrade = { ...clip.colorGrade };
		}
		this.lastAppliedAt = Date.now();

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

	/**
	 * Absorb the next tick of the same slider drag. One drag becomes one undo
	 * step instead of ~100, which previously evicted the entire 50-deep stack.
	 */
	mergeWith(next: Command): boolean {
		if (!(next instanceof SetColorGradeCommand)) return false;
		if (next.data.clipId !== this.data.clipId) return false;
		if (next.data.propertyName !== this.data.propertyName) return false;
		if (Date.now() - this.lastAppliedAt > MERGE_WINDOW_MS) return false;

		// `next` already applied itself; adopt its value so a later undo/redo
		// of this entry lands on the value the user actually settled on.
		this.data = { ...this.data, value: next.data.value };
		this.lastAppliedAt = Date.now();
		return true;
	}
}
