<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { importMediaFiles, restoreCachedAssets } from '$lib/utils/mediaUtils';
	import { opfsGetAutoSaveMeta, opfsLoadAutoSave } from '$lib/core/persistence/opfsAdapter';
	import type { Project } from '$lib/types/project';
	import MediaBin from '$lib/features/media/MediaBin.svelte';
	import MediaLibraryView from '$lib/features/media/MediaLibraryView.svelte';
	import RecordView from '$lib/features/record/RecordView.svelte';
	import TemplatesView from '$lib/features/templates/TemplatesView.svelte';
	import SettingsView from '$lib/features/settings/SettingsView.svelte';
	import HelpView from '$lib/features/help/HelpView.svelte';
	import Canvas from '$lib/features/canvas/Canvas.svelte';
	import Controls from '$lib/features/canvas/Controls.svelte';
	import Inspector from '$lib/features/inspector/Inspector.svelte';
	import Timeline from '$lib/features/timeline/Timeline.svelte';
	import Export from '$lib/features/export/Export.svelte';

	let fileInput = $state<HTMLInputElement | null>(null);
	let exportDialogOpen = $state(false);
	let isGlobalDragOver = $state(false);
	let activeNavTab = $state<'media' | 'record' | 'effects' | 'templates' | 'text' | 'transitions' | 'settings' | 'help'>('media');
	let sidebarExpanded = $state(false);
	let showTimeline = $state(false);

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

	<!-- Top Header Navigation Bar -->
	<header class="flex justify-between items-center px-4 w-full h-14 border-b border-outline-variant bg-surface-container/95 backdrop-blur-md shrink-0 z-30 relative select-none">
		<!-- Left: Logo & Selector -->
		<div class="flex items-center space-x-4">
			<!-- Official RayShot Dark Logo Image -->
			<div
				class="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
				onclick={() => (activeNavTab = 'media')}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter') activeNavTab = 'media'; }}
				title="RayShot Home"
			>
				<img
					src="/assets/logos/rayshot_official_dark_logo.png"
					alt="RayShot"
					class="h-7 w-auto max-w-[130px] object-contain"
				/>
			</div>

			<div class="h-4 w-[1px] bg-outline-variant"></div>

			<!-- Unified Aspect Ratio / Format Selector Pill -->
			<button
				type="button"
				class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-bright text-xs font-semibold cursor-pointer transition-colors"
				onclick={() => (activeNavTab = 'settings')}
				title="Project Format Settings"
			>
				<span class="material-symbols-outlined text-[15px] text-primary">aspect_ratio</span>
				<span>16:9 Landscape</span>
				<span class="material-symbols-outlined text-[14px] text-on-surface-variant">expand_more</span>
			</button>
		</div>

		<!-- Center: Project Title & Saved Status -->
		<div class="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-40">
			<div class="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-surface-container-highest border border-outline-variant focus-within:border-primary transition-all">
				<span class="material-symbols-outlined text-[15px] text-on-surface-variant">drive_file_rename_outline</span>
				<input
					type="text"
					class="bg-transparent border-none outline-none text-xs text-on-surface font-semibold w-36 text-center focus:w-48 transition-all"
					value={$projectStore?.name ?? 'Outfit Check pt.07'}
					onchange={(e) => updateProjectName((e.target as HTMLInputElement).value)}
					title="Rename Project"
				/>
			</div>
			<div
				class="flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
				title="All edits auto-saved locally to OPFS/IndexedDB sandbox"
			>
				<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
				<span>Saved</span>
			</div>
		</div>

		<!-- Right: Action Buttons -->
		<div class="flex items-center space-x-3 z-40">
			<!-- History Undo / Redo (Material Icons) -->
			<div class="flex items-center bg-surface-container-highest rounded border border-outline-variant p-0.5">
				<button
					type="button"
					class="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors flex items-center justify-center"
					onclick={handleUndo}
					title="Undo (Ctrl+Z)"
				>
					<span class="material-symbols-outlined text-[18px]">undo</span>
				</button>
				<button
					type="button"
					class="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors flex items-center justify-center"
					onclick={handleRedo}
					title="Redo (Ctrl+Y)"
				>
					<span class="material-symbols-outlined text-[18px]">redo</span>
				</button>
			</div>

			<!-- Share Button -->
			<button
				type="button"
				class="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-bright transition-colors text-xs font-semibold"
				onclick={() => {}}
			>
				<span>Share</span>
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
				<button type="button" class="bg-transparent border-none p-0 flex items-center cursor-pointer hover:text-on-surface text-on-surface-variant" onclick={() => (activeNavTab = 'help')} title="Help">
					<span class="material-symbols-outlined text-lg">notifications</span>
				</button>
				<button type="button" class="bg-transparent border-none p-0 flex items-center cursor-pointer hover:text-on-surface text-on-surface-variant" onclick={() => (activeNavTab = 'settings')} title="Settings">
					<span class="material-symbols-outlined text-2xl">account_circle</span>
				</button>
			</div>
		</div>
	</header>

	<!-- Main Workspace Area -->
	<div class="nle-workspace-grid">

		<div class="middle-work-row">
			<!-- Expandable / Collapsible Side Navigation Dock -->
			<nav
				class="flex flex-col py-3 transition-all duration-200 docked h-full border-r border-outline-variant bg-surface shrink-0 z-20"
				style="width: {sidebarExpanded ? '200px' : '64px'};"
			>
				<!-- Expand / Collapse Toggle Header -->
				<div class="px-2 pb-3 mb-1 border-b border-outline-variant/60 flex items-center justify-between">
					{#if sidebarExpanded}
						<span class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant px-2">Navigation</span>
					{/if}
					<button
						type="button"
						class="p-1.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors mx-auto"
						onclick={() => (sidebarExpanded = !sidebarExpanded)}
						title={sidebarExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
					>
						<span class="material-symbols-outlined text-lg">
							{sidebarExpanded ? 'first_page' : 'menu_open'}
						</span>
					</button>
				</div>

				<!-- Navigation Pillars List -->
				<div class="flex flex-col w-full space-y-1.5 flex-1 px-1.5 overflow-y-auto">
					<!-- Library Tab -->
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'media'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'media')}
						title="Media Library"
					>
						<span class="material-symbols-outlined text-xl" style={activeNavTab === 'media' ? "font-variation-settings: 'FILL' 1;" : ''}>video_library</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Library</span>
					</button>

					<!-- Record Tab -->
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'record'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'record')}
						title="Recording Studio"
					>
						<span class="material-symbols-outlined text-xl">videocam</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Record</span>
					</button>

					<!-- Content & Effects Tab -->
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'effects'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'effects')}
						title="Visual Effects & Sound FX"
					>
						<span class="material-symbols-outlined text-xl" style={activeNavTab === 'effects' ? "font-variation-settings: 'FILL' 1;" : ''}>auto_fix_high</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Content</span>
					</button>

					<!-- Templates Tab -->
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'templates'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'templates')}
						title="Creative Templates"
					>
						<span class="material-symbols-outlined text-xl">dashboard_customize</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Templates</span>
					</button>

					<!-- Text Typography Tab -->
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'text'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'text')}
						title="Text & Titles"
					>
						<span class="material-symbols-outlined text-xl" style={activeNavTab === 'text' ? "font-variation-settings: 'FILL' 1;" : ''}>title</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Text</span>
					</button>

					<!-- Transitions Tab -->
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'transitions'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2.5 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'transitions')}
						title="Video Transitions"
					>
						<span class="material-symbols-outlined text-xl">animation</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Transitions</span>
					</button>
				</div>

				<!-- Bottom Nav Group: Settings & Help -->
				<div class="flex flex-col w-full space-y-1 pt-3 border-t border-outline-variant/60 px-1.5 text-on-surface-variant">
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'settings'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'settings')}
						title="Project Settings"
					>
						<span class="material-symbols-outlined text-xl">settings</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Settings</span>
					</button>
					<button
						type="button"
						class="flex items-center rounded-lg transition-colors cursor-pointer w-full {activeNavTab === 'help'
							? 'text-primary bg-primary-container/25 border border-primary/40 font-bold'
							: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'} {sidebarExpanded ? 'px-3 py-2 gap-3 justify-start' : 'flex-col justify-center py-2 text-center'}"
						onclick={() => (activeNavTab = 'help')}
						title="Help & Shortcuts"
					>
						<span class="material-symbols-outlined text-xl">help</span>
						<span class="{sidebarExpanded ? 'text-xs' : 'text-[10px]'}">Help</span>
					</button>
				</div>
			</nav>

			<!-- Interactive Main Workspace Display based on activeNavTab -->
			<div class="flex-1 h-full min-w-0 overflow-hidden relative">
				{#if activeNavTab === 'media'}
					<MediaLibraryView />
				{:else if activeNavTab === 'record'}
					<RecordView />
				{:else if activeNavTab === 'templates'}
					<TemplatesView />
				{:else if activeNavTab === 'settings'}
					<SettingsView />
				{:else if activeNavTab === 'help'}
					<HelpView />
				{:else}
					<!-- Visual Effects, Text & Transitions Studio with Live Canvas & Inspector -->
					<div class="flex h-full w-full overflow-hidden">
						<aside class="left-mediabin-col">
							<MediaBin activePillar={activeNavTab as any} />
						</aside>
						<main class="center-canvas-col">
							<section class="flex-1 flex flex-col p-3 items-center justify-center relative min-h-0 bg-surface-container-lowest">
								<div class="w-full flex-1 min-h-0 relative flex items-center justify-center bg-black rounded-lg shadow-2xl overflow-hidden border border-surface-container">
									<Canvas />
								</div>
								<div class="w-full mt-2 shrink-0">
									<Controls />
								</div>
							</section>
						</main>
						<aside class="right-inspector-col">
							<Inspector />
						</aside>
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom Multitrack Timeline Panel (Accessible when toggled or needed) -->
		{#if showTimeline}
			<section class="bottom-timeline-row">
				<Timeline />
			</section>
		{/if}
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
