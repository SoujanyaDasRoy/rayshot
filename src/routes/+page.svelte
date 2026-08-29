<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { importMediaFiles, restoreCachedAssets } from '$lib/utils/mediaUtils';
	import { opfsGetAutoSaveMeta, opfsLoadAutoSave } from '$lib/core/persistence/opfsAdapter';
	import type { Project } from '$lib/types/project';
	import MediaBin from '$lib/features/media/MediaBin.svelte';
	import Canvas from '$lib/features/canvas/Canvas.svelte';
	import Controls from '$lib/features/canvas/Controls.svelte';
	import Inspector from '$lib/features/inspector/Inspector.svelte';
	import Timeline from '$lib/features/timeline/Timeline.svelte';
	import Export from '$lib/features/export/Export.svelte';

	let fileInput = $state<HTMLInputElement | null>(null);
	let exportDialogOpen = $state(false);
	let isGlobalDragOver = $state(false);
	let activeNavTab = $state<'media' | 'record' | 'effects' | 'templates' | 'text' | 'transitions' | 'settings'>('media');
	let isEditingProjectName = $state(false);

	let restorePrompt = $state<{ show: boolean; projectName: string; savedAt: number }>({
		show: false,
		projectName: '',
		savedAt: 0
	});

	onMount(() => {
		projectStore.update((project) => {
			if (project) return project;

			const defaultProject: Project = {
				id: 'default-project',
				name: 'RayShot_Project_1',
				version: 1,
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
						tracks: [
							{ id: 'track-video-1', type: 'video', order: 1, clipInstances: [] },
							{ id: 'track-video-2', type: 'video', order: 2, clipInstances: [] },
							{ id: 'track-audio-1', type: 'audio', order: 3, clipInstances: [] },
							{ id: 'track-audio-2', type: 'audio', order: 4, clipInstances: [] }
						]
					}
				],
				activeSequenceId: 'seq-1',
				settings: { backgroundColor: '#000000' }
			};
			return defaultProject;
		});

		// Restore thumbnails & waveforms from IDB (non-blocking)
		restoreCachedAssets().catch(() => {});

		// Check for OPFS auto-save and offer restore
		opfsGetAutoSaveMeta()
			.then((meta) => {
				if (meta && meta.savedAt) {
					const ageDays = (Date.now() - meta.savedAt) / (1000 * 60 * 60 * 24);
					if (ageDays < 30) {
						restorePrompt = { show: true, projectName: meta.projectName, savedAt: meta.savedAt };
					}
				}
			})
			.catch(() => {});

		const handleWindowDragOver = (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
				isGlobalDragOver = true;
			}
		};

		const handleWindowDragLeave = (e: DragEvent) => {
			if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
				isGlobalDragOver = false;
			}
		};

		const handleWindowDrop = async (e: DragEvent) => {
			e.preventDefault();
			isGlobalDragOver = false;
			if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
				await importMediaFiles(Array.from(e.dataTransfer.files), true);
			}
		};

		window.addEventListener('dragover', handleWindowDragOver);
		window.addEventListener('dragleave', handleWindowDragLeave);
		window.addEventListener('drop', handleWindowDrop);

		return () => {
			window.removeEventListener('dragover', handleWindowDragOver);
			window.removeEventListener('dragleave', handleWindowDragLeave);
			window.removeEventListener('drop', handleWindowDrop);
		};
	});

	async function handleFileChange(e: Event) {
		const input = fileInput;
		if (!input || !input.files) return;
		await importMediaFiles(Array.from(input.files), true);
		input.value = '';
	}

	async function handleRestoreProject() {
		try {
			const saved = await opfsLoadAutoSave();
			if (saved) {
				projectStore.set(saved as unknown as Project);
			}
		} catch {
			// Ignore restore failures
		}
		restorePrompt = { show: false, projectName: '', savedAt: 0 };
	}

	function handleDismissRestore() {
		restorePrompt = { show: false, projectName: '', savedAt: 0 };
	}

	function updateProjectName(newName: string) {
		projectStore.update((p) => {
			if (!p) return p;
			return { ...p, name: newName || 'RayShot_Project_1', modifiedAt: Date.now() };
		});
	}

	function handleUndo() {
		commandProcessor.undo();
	}

	function handleRedo() {
		commandProcessor.redo();
	}
</script>

<!-- Main App Shell -->
<div class="app-layout-shell">

	<!-- Top Header Navigation Bar (Stitch Design) -->
	<header class="bg-surface-container h-14 border-b border-outline-variant flex justify-between items-center px-4 shrink-0 z-30">
		<!-- Left: Brand Logo & Editable Project Name -->
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2 text-primary font-black text-lg tracking-tight">
				<span class="material-symbols-outlined text-2xl text-primary" style="font-variation-settings: 'FILL' 1;">
					animation
				</span>
				<span>RayShot</span>
			</div>
			<div class="h-4 w-px bg-outline-variant"></div>

			<!-- Project Title Input -->
			<div class="flex items-center gap-2 text-sm text-on-surface-variant">
				{#if isEditingProjectName}
					<input
						type="text"
						class="bg-surface-container-highest border border-primary text-on-surface rounded px-2 py-0.5 text-xs font-medium focus:outline-none"
						value={$projectStore?.name ?? 'RayShot_Project_1'}
						onblur={(e) => {
							updateProjectName((e.target as HTMLInputElement).value);
							isEditingProjectName = false;
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								updateProjectName((e.currentTarget as HTMLInputElement).value);
								isEditingProjectName = false;
							}
						}}
					/>
				{:else}
					<button
						type="button"
						class="hover:text-on-surface hover:bg-surface-container-highest px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
						onclick={() => (isEditingProjectName = true)}
					>
						<span>{$projectStore?.name ?? 'RayShot_Project_1'}</span>
						<span class="material-symbols-outlined text-xs text-outline">edit</span>
					</button>
				{/if}
			</div>
		</div>

		<!-- Center: Aspect Ratio & History Controls -->
		<div class="flex items-center gap-3">
			<div class="bg-surface-container-low border border-outline-variant px-3 py-1 rounded-full text-xs font-mono text-on-surface-variant flex items-center gap-1.5">
				<span class="material-symbols-outlined text-sm text-primary">aspect_ratio</span>
				<span>16:9 Widescreen</span>
			</div>

			<div class="flex items-center gap-1 bg-surface-container-low border border-outline-variant p-0.5 rounded-lg">
				<button
					type="button"
					class="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-30"
					onclick={handleUndo}
					title="Undo (Ctrl+Z)"
				>
					<span class="material-symbols-outlined text-lg">undo</span>
				</button>
				<button
					type="button"
					class="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-30"
					onclick={handleRedo}
					title="Redo (Ctrl+Y)"
				>
					<span class="material-symbols-outlined text-lg">redo</span>
				</button>
			</div>
		</div>

		<!-- Right: Import & High-Visibility Export Button -->
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="bg-surface-container-highest hover:bg-surface-bright border border-outline-variant text-on-surface px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
				onclick={() => fileInput?.click()}
			>
				<span class="material-symbols-outlined text-base text-secondary">add_circle</span>
				<span>Import Media</span>
			</button>

			<button
				type="button"
				class="bg-primary text-on-primary font-bold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 hover:bg-primary-fixed-dim transition-all shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
				onclick={() => (exportDialogOpen = true)}
			>
				<span class="material-symbols-outlined text-base">download</span>
				<span>Export Video</span>
			</button>
		</div>
	</header>

	<!-- Main Workspace Area -->
	<div class="nle-workspace-grid">

		<div class="middle-work-row">
			<!-- Vertical Side Navigation Dock (Stitch Design) -->
			<nav class="bg-surface w-16 border-r border-outline-variant flex flex-col items-center py-3 space-y-2 shrink-0 z-20">
				<button
					type="button"
					class="w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all gap-0.5 text-[10px] font-medium {activeNavTab === 'media'
						? 'text-primary bg-primary-container/20 border-l-2 border-primary font-bold'
						: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'}"
					onclick={() => (activeNavTab = 'media')}
				>
					<span class="material-symbols-outlined text-xl">perm_media</span>
					<span>Media</span>
				</button>

				<button
					type="button"
					class="w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all gap-0.5 text-[10px] font-medium {activeNavTab === 'text'
						? 'text-primary bg-primary-container/20 border-l-2 border-primary font-bold'
						: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'}"
					onclick={() => (activeNavTab = 'text')}
				>
					<span class="material-symbols-outlined text-xl">title</span>
					<span>Text</span>
				</button>

				<button
					type="button"
					class="w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all gap-0.5 text-[10px] font-medium {activeNavTab === 'effects'
						? 'text-primary bg-primary-container/20 border-l-2 border-primary font-bold'
						: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'}"
					onclick={() => (activeNavTab = 'effects')}
				>
					<span class="material-symbols-outlined text-xl">auto_fix_high</span>
					<span>Effects</span>
				</button>

				<button
					type="button"
					class="w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all gap-0.5 text-[10px] font-medium {activeNavTab === 'templates'
						? 'text-primary bg-primary-container/20 border-l-2 border-primary font-bold'
						: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'}"
					onclick={() => (activeNavTab = 'templates')}
				>
					<span class="material-symbols-outlined text-xl">dashboard_customize</span>
					<span>Templates</span>
				</button>

				<button
					type="button"
					class="w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all gap-0.5 text-[10px] font-medium {activeNavTab === 'transitions'
						? 'text-primary bg-primary-container/20 border-l-2 border-primary font-bold'
						: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'}"
					onclick={() => (activeNavTab = 'transitions')}
				>
					<span class="material-symbols-outlined text-xl">animation</span>
					<span>Transitions</span>
				</button>

				<div class="mt-auto flex flex-col space-y-2 pt-4 border-t border-outline-variant/40 w-full items-center">
					<button
						type="button"
						class="w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
						onclick={() => (activeNavTab = 'settings')}
					>
						<span class="material-symbols-outlined text-xl">settings</span>
					</button>
				</div>
			</nav>

			<!-- Left Drawer Panel (Media Bin & Presets) -->
			<aside class="left-mediabin-col">
				<MediaBin />
			</aside>

			<!-- Middle Center Column: Video Preview & Multitrack Timeline -->
			<main class="center-canvas-col">
				<!-- Top Preview Canvas & Transport Controls -->
				<section class="flex-1 flex flex-col p-3 items-center justify-center relative min-h-0 bg-surface-container-lowest">
					<!-- Canvas Container -->
					<div class="w-full flex-1 min-h-0 relative flex items-center justify-center bg-black rounded-lg shadow-2xl overflow-hidden border border-surface-container">
						<Canvas />
					</div>

					<!-- Transport Bar -->
					<div class="w-full mt-2 shrink-0">
						<Controls />
					</div>
				</section>
			</main>

			<!-- Right Inspector Panel -->
			<aside class="right-inspector-col">
				<Inspector />
			</aside>
		</div>

		<!-- Bottom Multitrack Timeline Panel -->
		<section class="bottom-timeline-row">
			<Timeline />
		</section>
	</div>

	<!-- Hidden Media File Input -->
	<input
		type="file"
		bind:this={fileInput}
		onchange={handleFileChange}
		multiple
		accept="video/*,audio/*,image/*"
		style="display: none;"
	/>

	<!-- Export Dialog Modal -->
	<Export open={exportDialogOpen} onClose={() => (exportDialogOpen = false)} />

	<!-- OPFS Auto-Save Restore Toast -->
	{#if restorePrompt.show}
		<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 shadow-2xl animate-bounce text-xs">
			<span class="material-symbols-outlined text-primary text-lg">save</span>
			<span>
				Restore auto-saved project <strong>{restorePrompt.projectName}</strong>?
			</span>
			<div class="flex items-center gap-2 ml-2">
				<button
					type="button"
					class="bg-primary text-on-primary font-bold px-3 py-1 rounded-md hover:bg-primary-fixed-dim transition-colors"
					onclick={handleRestoreProject}
				>
					Restore
				</button>
				<button
					type="button"
					class="bg-surface-container-highest border border-outline-variant text-on-surface-variant px-3 py-1 rounded-md hover:text-on-surface transition-colors"
					onclick={handleDismissRestore}
				>
					Dismiss
				</button>
			</div>
		</div>
	{/if}

	<!-- Global Drag & Drop Overlay Curtain -->
	{#if isGlobalDragOver}
		<div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none p-6">
			<div class="border-2 border-dashed border-primary bg-surface-container/90 rounded-2xl p-10 flex flex-col items-center gap-3 text-center shadow-2xl">
				<span class="material-symbols-outlined text-5xl text-primary animate-pulse">cloud_upload</span>
				<h3 class="text-lg font-bold text-on-surface">Drop Media Files to Import</h3>
				<p class="text-xs text-on-surface-variant max-w-xs">
					Videos, audio tracks, and images will be automatically added to your RayShot media library.
				</p>
			</div>
		</div>
	{/if}
</div>
