import { Command } from './base';
import { projectStore } from '$lib/stores/project.svelte';
import { get } from 'svelte/store';
import type { Project } from '$lib/types/project';
// Relative, not $lib: the node Vitest project can't resolve bare $lib
// specifiers, and this module is pulled in by the tier test suites.
import { CURRENT_PROJECT_VERSION } from '../persistence/migrateProject';

function buildDefaultProject(): Project {
	return {
		id: 'default-project',
		name: 'Untitled Project',
		version: CURRENT_PROJECT_VERSION,
		createdAt: Date.now(),
		modifiedAt: Date.now(),
		assets: new Map(),
		clips: new Map(),
		sequences: [
			{
				id: 'seq-1',
				name: 'Sequence 1',
				resolution: { width: 1920, height: 1080 },
				frameRate: 30,
				duration: 0,
				tracks: [{ id: 'track-video-1', type: 'video', order: 1, clipInstances: [] }]
			}
		],
		activeSequenceId: 'seq-1',
		settings: { backgroundColor: '#000000' }
	};
}

export class NewProjectCommand extends Command {
	private project: Project | null = null;

	constructor() {
		super();
	}

	execute(): void {
		const current = get(projectStore);
		this.project = current ? { ...current } : null;
		projectStore.set(buildDefaultProject());
	}

	undo(): void {
		if (this.project) {
			projectStore.set(this.project);
		} else {
			projectStore.set(buildDefaultProject());
		}
	}
}
