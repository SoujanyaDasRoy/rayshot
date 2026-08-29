<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore, updateProject } from '$lib/stores/project.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { derived } from 'svelte/store';
	import { NewProjectCommand } from '$lib/core/commands/newProject';
	import type { Command } from '$lib/core/commands/base';

	let { onOpenExport, onImportMedia } = $props<{
		onOpenExport: () => void;
		onImportMedia: () => void;
	}>();

	const historyState = derived(commandProcessor.getHistoryStore(), ($h) => ({
		canUndo: $h.canUndo,
		canRedo: $h.canRedo
	}));

	const projectName = derived(projectStore, ($project) => $project?.name ?? 'Untitled Project');

	let isEditingName = $state(false);
	let currentName = $state('');

	function startEditName() {
		currentName = $projectName;
		isEditingName = true;
	}

	function saveName() {
		if (currentName.trim()) {
			updateProject({
				name: currentName.trim(),
				modifiedAt: Date.now()
			});
		}
		isEditingName = false;
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveName();
		if (e.key === 'Escape') isEditingName = false;
	}

	function undo() {
		commandProcessor.undo();
	}

	function redo() {
		commandProcessor.redo();
	}

	function newProject() {
		if (confirm('Create a new project? Any unsaved changes on the current timeline will be cleared.')) {
			const newProjectCmd: Command = new NewProjectCommand();
			commandProcessor.execute(newProjectCmd);
		}
	}

	function focusInput(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	onMount(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			// Do not intercept if actively typing in an input/textarea
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
			const isModifier = isMac ? e.metaKey : e.ctrlKey;

			if (isModifier && (e.key === 'z' || e.key === 'Z')) {
				if (e.shiftKey) {
					e.preventDefault();
					redo();
				} else {
					e.preventDefault();
					undo();
				}
			} else if (isModifier && (e.key === 'y' || e.key === 'Y')) {
				e.preventDefault();
				redo();
			}
		};

		window.addEventListener('keydown', handleGlobalKeyDown);
		return () => {
			window.removeEventListener('keydown', handleGlobalKeyDown);
		};
	});
</script>

<header class="app-top-bar">
	<!-- Left: Brand Logo & Editable Project Title -->
	<div class="header-left-group">
		<div class="brand-badge" title="RayShot Video Editor">
			<img src="/assets/logos/rayshot_official_dark_logo.png" alt="RayShot Logo" class="brand-icon" />
			<span class="brand-title">RayShot</span>
			<span class="brand-sub">Studio</span>
		</div>

		<div class="header-v-divider"></div>

		<div class="project-title-container">
			{#if isEditingName}
				<input
					type="text"
					class="project-title-input"
					bind:value={currentName}
					onblur={saveName}
					onkeydown={handleNameKeydown}
					placeholder="Enter project name..."
					use:focusInput
				/>
			{:else}
				<button class="project-title-btn" onclick={startEditName} title="Click to rename project">
					<span class="project-name-text">{$projectName}</span>
					<svg class="edit-pencil-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
					</svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- Center: History & Quick Workflow Actions -->
	<div class="header-center-group">
		<div class="tool-actions-strip">
			<button
				class="tool-icon-btn"
				onclick={undo}
				disabled={!$historyState.canUndo}
				title="Undo (Ctrl+Z)"
				aria-label="Undo"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 7v6h6"/>
					<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
				</svg>
			</button>

			<button
				class="tool-icon-btn"
				onclick={redo}
				disabled={!$historyState.canRedo}
				title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
				aria-label="Redo"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 7v6h-6"/>
					<path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
				</svg>
			</button>

			<div class="tool-sub-divider"></div>

			<button
				class="tool-icon-btn"
				onclick={newProject}
				title="New Project"
				aria-label="New Project"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14 2 14 8 20 8"/>
					<line x1="12" y1="18" x2="12" y2="12"/>
					<line x1="9" y1="15" x2="15" y2="15"/>
				</svg>
			</button>

			<button
				class="tool-icon-btn"
				onclick={onImportMedia}
				title="Import Media Files"
				aria-label="Import Media"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="17 8 12 3 7 8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Right: Primary Export CTA -->
	<div class="header-right-group">
		<button class="primary-export-cta" onclick={onOpenExport} title="Export timeline to MP4/WebM video">
			<svg class="export-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
				<polyline points="16 6 12 2 8 6"/>
				<line x1="12" y1="2" x2="12" y2="15"/>
			</svg>
			<span>Export</span>
		</button>
	</div>
</header>

<style>
	.app-top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 14px;
		height: 44px;
		background: var(--color-bg-header, #1a1d28);
		border-bottom: 1px solid var(--color-border-subtle, #232738);
		color: var(--color-text-primary, #f8fafc);
		user-select: none;
		flex-shrink: 0;
		z-index: 100;
	}

	.header-left-group,
	.header-center-group,
	.header-right-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	/* Brand Badge */
	.brand-badge {
		display: flex;
		align-items: center;
		gap: 7px;
		cursor: default;
	}

	.brand-icon {
		width: 18px;
		height: 18px;
		filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.4));
	}

	.brand-title {
		font-size: 0.92rem;
		font-weight: 700;
		color: #ffffff;
		letter-spacing: -0.02em;
	}

	.brand-sub {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(56, 189, 248, 0.12);
		color: #38bdf8;
		padding: 1px 6px;
		border-radius: 4px;
		letter-spacing: 0.04em;
		border: 1px solid rgba(56, 189, 248, 0.25);
	}

	.header-v-divider {
		width: 1px;
		height: 18px;
		background: var(--color-border-subtle, #232738);
	}

	/* Project Title */
	.project-title-container {
		display: flex;
		align-items: center;
	}

	.project-title-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 1px solid transparent;
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.82rem;
		font-weight: 500;
		padding: 3px 8px;
		border-radius: 5px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.project-title-btn:hover {
		background: var(--color-bg-surface, #121319);
		border-color: var(--color-border-subtle, #232738);
	}

	.project-name-text {
		color: #e2e8f0;
		max-width: 220px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.edit-pencil-icon {
		width: 12px;
		height: 12px;
		color: var(--color-text-muted, #64748b);
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.project-title-btn:hover .edit-pencil-icon {
		opacity: 1;
	}

	.project-title-input {
		background: var(--color-bg-base, #090a0d);
		border: 1px solid var(--color-accent-primary, #38bdf8);
		color: #ffffff;
		font-size: 0.82rem;
		font-weight: 500;
		padding: 3px 8px;
		border-radius: 5px;
		outline: none;
		box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
		width: 200px;
	}

	/* Tool Actions Strip */
	.tool-actions-strip {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--color-bg-surface, #121319);
		padding: 3px 6px;
		border-radius: 6px;
		border: 1px solid var(--color-border-subtle, #232738);
	}

	.tool-icon-btn {
		background: transparent;
		border: none;
		color: var(--color-text-secondary, #94a3b8);
		padding: 4px 6px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.tool-icon-btn svg {
		width: 14px;
		height: 14px;
	}

	.tool-icon-btn:hover:not(:disabled) {
		background: var(--color-bg-header-hover, #222634);
		color: #ffffff;
	}

	.tool-icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.tool-sub-divider {
		width: 1px;
		height: 14px;
		background: var(--color-border-subtle, #232738);
		margin: 0 2px;
	}

	/* Primary Export CTA */
	.primary-export-cta {
		background: var(--color-accent-primary, #38bdf8);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #090a0d;
		font-size: 0.82rem;
		font-weight: 700;
		padding: 5px 14px;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
		box-shadow: 0 2px 10px rgba(56, 189, 248, 0.25);
		transition: all 0.15s ease;
	}

	.primary-export-cta svg {
		width: 14px;
		height: 14px;
		stroke-width: 2.5;
	}

	.primary-export-cta:hover {
		background: #7dd3fc;
		transform: translateY(-1px);
		box-shadow: 0 4px 14px rgba(56, 189, 248, 0.4);
	}

	.primary-export-cta:active {
		transform: translateY(0);
	}
</style>
