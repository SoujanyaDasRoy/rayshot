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

	<!-- Top Header Navigation Bar (Stitch Screen Design 1:1) -->
	<header class="flex justify-between items-center px-4 w-full h-14 border-b border-outline-variant bg-surface-container shrink-0 z-30">
		<div class="flex items-center space-x-4">
			<!-- RAYSHOT Brand Logo Box -->
			<div class="bg-black px-3 py-1 rounded border border-outline-variant/60 text-white font-black tracking-widest text-xs uppercase flex items-center gap-1.5 shadow-sm">
				<span class="w-2 h-2 rounded-full bg-primary animate-pulse inline-block"></span>
				<span>RAYSHOT</span>
			</div>

			<div class="hidden md:flex items-center space-x-6 ml-4 text-xs font-medium text-on-surface-variant">
				<span class="hover:text-on-surface cursor-pointer transition-colors">16:9</span>
				<span class="hover:text-on-surface cursor-pointer transition-colors">Project Settings</span>
			</div>
		</div>

		<div class="flex items-center space-x-3">
			<!-- Editable Project Name Input Pill -->
			<div class="bg-surface-container-highest border border-outline-variant rounded px-3 py-1 text-xs font-medium text-on-surface flex items-center gap-1">
				<input
					type="text"
					class="bg-transparent border-none outline-none text-xs text-on-surface font-medium w-40"
					value={$projectStore?.name ?? 'Outfit Check pt.07'}
					onchange={(e) => updateProjectName((e.target as HTMLInputElement).value)}
				/>
				<span class="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
			</div>

			<!-- History Undo / Redo -->
			<div class="flex items-center space-x-1.5 text-on-surface-variant px-1">
				<button
					type="button"
					class="hover:text-on-surface text-lg px-1 transition-colors disabled:opacity-30"
					onclick={handleUndo}
					title="Undo (Ctrl+Z)"
				>
					↺
				</button>
				<button
					type="button"
					class="hover:text-on-surface text-lg px-1 transition-colors disabled:opacity-30"
					onclick={handleRedo}
					title="Redo (Ctrl+Y)"
				>
					↻
				</button>
			</div>

			<!-- Preview Button -->
			<button
				type="button"
				class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-bright transition-colors text-xs font-semibold"
				onclick={() => {
					playbackStore.update((p) => ({ ...p, isPlaying: !p.isPlaying }));
				}}
			>
				<span class="material-symbols-outlined text-sm">play_arrow</span>
				<span>Preview</span>
			</button>

			<!-- High-Visibility Export Video Button -->
			<button
				type="button"
				class="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-on-primary font-bold hover:opacity-90 transition-opacity text-xs shadow-md shadow-primary/20"
				onclick={() => (exportDialogOpen = true)}
			>
				<span class="material-symbols-outlined text-sm">file_upload</span>
				<span>Export Video</span>
			</button>

			<div class="flex items-center space-x-3 ml-2 border-l border-outline-variant pl-4 text-on-surface-variant">
				<span class="material-symbols-outlined cursor-pointer hover:text-on-surface text-lg">notifications</span>
				<span class="material-symbols-outlined cursor-pointer hover:text-on-surface text-2xl">account_circle</span>
			</div>
		</div>
	</header>

	<!-- Main Workspace Area -->
	<div class="nle-workspace-grid">

		<div class="middle-work-row">
			<!-- Vertical Side Navigation Dock (Stitch Design 1:1) -->
			<nav class="flex flex-col items-center py-4 space-y-4 docked h-full w-16 border-r border-outline-variant bg-surface shrink-0 z-20">
				<div class="flex flex-col items-center justify-center w-full space-y-5 flex-1">
					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer w-full text-center transition-colors {activeNavTab === 'media'
							? 'text-primary bg-primary-container/20 border-l-2 border-primary py-2 font-bold'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (activeNavTab = 'media')}
					>
						<span class="material-symbols-outlined text-xl" style={activeNavTab === 'media' ? "font-variation-settings: 'FILL' 1;" : ''}>video_library</span>
						<span class="text-[10px]">Library</span>
					</button>

					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer w-full text-center transition-colors {activeNavTab === 'record'
							? 'text-primary bg-primary-container/20 border-l-2 border-primary py-2 font-bold'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (activeNavTab = 'record')}
					>
						<span class="material-symbols-outlined text-xl">videocam</span>
						<span class="text-[10px]">Record</span>
					</button>

					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer w-full text-center transition-colors {activeNavTab === 'effects'
							? 'text-primary bg-primary-container/20 border-l-2 border-primary py-2 font-bold'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (activeNavTab = 'effects')}
					>
						<span class="material-symbols-outlined text-xl" style={activeNavTab === 'effects' ? "font-variation-settings: 'FILL' 1;" : ''}>auto_fix_high</span>
						<span class="text-[10px]">Effects</span>
					</button>

					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer w-full text-center transition-colors {activeNavTab === 'templates'
							? 'text-primary bg-primary-container/20 border-l-2 border-primary py-2 font-bold'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (activeNavTab = 'templates')}
					>
						<span class="material-symbols-outlined text-xl">dashboard_customize</span>
						<span class="text-[10px]">Templates</span>
					</button>

					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer w-full text-center transition-colors {activeNavTab === 'text'
							? 'text-primary bg-primary-container/20 border-l-2 border-primary py-2 font-bold'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (activeNavTab = 'text')}
					>
						<span class="material-symbols-outlined text-xl" style={activeNavTab === 'text' ? "font-variation-settings: 'FILL' 1;" : ''}>title</span>
						<span class="text-[10px]">Text</span>
					</button>

					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer w-full text-center transition-colors {activeNavTab === 'transitions'
							? 'text-primary bg-primary-container/20 border-l-2 border-primary py-2 font-bold'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (activeNavTab = 'transitions')}
					>
						<span class="material-symbols-outlined text-xl">animation</span>
						<span class="text-[10px]">Transitions</span>
					</button>
				</div>

				<div class="flex flex-col items-center space-y-4 pb-2 text-on-surface-variant">
					<button
						type="button"
						class="flex flex-col items-center space-y-1 cursor-pointer hover:text-on-surface"
						onclick={() => (activeNavTab = 'settings')}
					>
						<span class="material-symbols-outlined text-xl">settings</span>
						<span class="text-[10px]">Settings</span>
					</button>
				</div>
			</nav>

			<!-- Left Drawer Panel (Media Bin & Presets) -->
			<aside class="left-mediabin-col">
				<MediaBin activePillar={activeNavTab === 'templates' ? 'effects' : (activeNavTab as any)} />
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
