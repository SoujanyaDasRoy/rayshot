import { writable, derived } from 'svelte/store';
import type { Project, MediaAsset, Sequence, Track, Clip } from '$lib/types/project';

// Authoritative project state
export const projectStore = writable<Project | null>(null);

// Derived stores for commonly accessed data
export const projectName = derived(projectStore, ($project) => $project?.name ?? '');
export const projectId = derived(projectStore, ($project) => $project?.id ?? '');
export const assets = derived(projectStore, ($project) => $project?.assets ?? new Map());
export const sequences = derived(projectStore, ($project) => $project?.sequences ?? []);

// Helper functions for updating project state
export const setProject = (project: Project) => {
	projectStore.set(project);
};

export const updateProject = (updates: Partial<Project>) => {
	projectStore.update((project) => {
		if (!project) return null;
		return { ...project, ...updates };
	});
};
