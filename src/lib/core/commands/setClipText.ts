import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Clip, TextContent } from '$lib/types/project';

/**
 * Edit the words on a title clip.
 *
 * Merges consecutive edits to the same clip, so typing a sentence is one undo
 * rather than one per keystroke — the same flood the colour-grade sliders had.
 */
export class SetClipTextCommand extends Command {
	private previous: TextContent | undefined;
	private captured = false;

	constructor(private data: { clipId: string; text: Partial<TextContent> }) {
		super();
	}

	private write(text: TextContent | undefined): void {
		const project = get(projectStore);
		if (!project) return;
		const clip = project.clips.get(this.data.clipId);
		if (!clip) return;

		const clips = new Map(project.clips);
		const updated: Clip = { ...clip, text };
		clips.set(this.data.clipId, updated);
		projectStore.set({ ...project, clips, modifiedAt: Date.now() });
	}

	execute(): void {
		const project = get(projectStore);
		const clip = project?.clips.get(this.data.clipId);
		if (!clip) return;

		if (!this.captured) {
			this.previous = clip.text ? { ...clip.text } : undefined;
			this.captured = true;
		}

		const base: TextContent = clip.text ?? {
			content: '',
			fontSize: 84,
			align: 'center',
			color: '#ffffff'
		};
		this.write({ ...base, ...this.data.text });
	}

	undo(): void {
		if (!this.captured) return;
		this.write(this.previous);
	}

	mergeWith(next: Command): boolean {
		if (!(next instanceof SetClipTextCommand)) return false;
		if (next.data.clipId !== this.data.clipId) return false;
		this.data = { ...this.data, text: { ...this.data.text, ...next.data.text } };
		return true;
	}
}
