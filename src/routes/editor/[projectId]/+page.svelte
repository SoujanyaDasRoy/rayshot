<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { importMediaFiles, restoreCachedAssets, rehydrateAssetBlobs } from '$lib/utils/mediaUtils';
	import { opfsGetAutoSaveMeta, opfsLoadAutoSave } from '$lib/core/persistence/opfsAdapter';
	import { CURRENT_PROJECT_VERSION } from '$lib/core/persistence/migrateProject';
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
	import Sidebar from '$lib/features/shell/Sidebar.svelte';
	import TopBar from '$lib/features/shell/TopBar.svelte';

	let { data }: { data: { projectId: string } } = $props();

	const history = commandProcessor.getHistoryStore();

	type NavTab = 'media' | 'record' | 'effects' | 'templates' | 'text' | 'transitions' | 'settings' | 'help';

	let fileInput = $state<HTMLInputElement | null>(null);
	let exportDialogOpen = $state(false);
	let isGlobalDragOver = $state(false);
	let activeNavTab = $state<NavTab>('media');
	let sidebarExpanded = $state(true);
	let activeMediaFolder = $state<string>('all');
	let inspectorVisible = $state(true);

	// Timeline lives alongside the actual editing surface (effects/text/transitions),
	// not the full-screen library/record/templates/settings/help views.
	const isEditingView = $derived(
		activeNavTab === 'effects' || activeNavTab === 'text' || activeNavTab === 'transitions'
	);

	let restorePrompt = $state<{ show: boolean; projectName: string; savedAt: number }>({
		show: false,
		projectName: '',
		savedAt: 0
	});

	onMount(() => {
		projectStore.update((project) => {
			if (project) return project;
			const defaultProject: Project = {
				id: data.projectId,
				name: 'RayShot_Project_1',
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

		restoreCachedAssets().catch(() => {});
		// Reattach media bytes to whatever project is already loaded. The
		// restore-from-autosave path needs its own call — see handleRestoreProject.
		rehydrateAssetBlobs().catch(() => {});

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
			if (e.dataTransfer && e.dataTransfer.types.includes('Files')) isGlobalDragOver = true;
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

	async function handleFileChange() {
		const input = fileInput;
		if (!input || !input.files) return;
		await importMediaFiles(Array.from(input.files), true);
		input.value = '';
	}

	async function handleRestoreProject() {
		try {
			// Already migrated and Map-rehydrated by opfsLoadAutoSave — no cast needed.
			const saved = await opfsLoadAutoSave();
			if (saved) {
				projectStore.set(saved);
				// Await before the next paint: the restored project has no blobs
				// yet, so rendering it first would flash an empty, unplayable
				// timeline that looks restored.
				await rehydrateAssetBlobs();
			}
		} catch { /* ignore */ }
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

	function handleUndo() { commandProcessor.undo(); }
	function handleRedo() { commandProcessor.redo(); }

</script>

<!-- App Shell: full-height sidebar beside [title bar above content] -->
<div class="app-layout-shell flex flex-row h-screen w-screen overflow-hidden text-white" style="background: var(--ms-void);">

	<Sidebar
		bind:activeTab={activeNavTab}
		bind:expanded={sidebarExpanded}
		bind:activeFolder={activeMediaFolder}
		canUndo={$history.canUndo}
		canRedo={$history.canRedo}
		onUndo={handleUndo}
		onRedo={handleRedo}
	/>

	<!-- ═══════════════════════════════════════ -->
	<!-- MAIN CONTENT AREA -->
	<!-- ═══════════════════════════════════════ -->
	<div class="nle-workspace-grid flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
		<TopBar
			projectName={$projectStore?.name ?? 'RayShot_Project_1'}
			onRenameProject={updateProjectName}
			onExport={() => (exportDialogOpen = true)}
			{inspectorVisible}
			onToggleInspector={() => (inspectorVisible = !inspectorVisible)}
		/>

		<div class="middle-work-row flex flex-1 min-h-0 overflow-hidden">
			<div class="flex-1 h-full min-w-0 overflow-hidden relative">
				{#if activeNavTab === 'media'}
					<MediaLibraryView bind:activeFolder={activeMediaFolder} {inspectorVisible} />
				{:else if activeNavTab === 'record'}
					<RecordView />
				{:else if activeNavTab === 'templates'}
					<TemplatesView />
				{:else if activeNavTab === 'settings'}
					<SettingsView />
				{:else if activeNavTab === 'help'}
					<HelpView />
				{:else}
					<!-- Effects / Text / Transitions → canvas view -->
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
						{#if inspectorVisible}
							<aside class="right-inspector-col">
								<Inspector />
							</aside>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom Timeline (shown for the active editing surface) -->
		{#if isEditingView}
			<section class="bottom-timeline-row">
				<Timeline />
			</section>
		{/if}
	</div>

	<!-- Hidden file input -->
	<input type="file" bind:this={fileInput} onchange={handleFileChange} multiple accept="video/*,audio/*,image/*" style="display: none;" />

	<!-- Export Dialog -->
	<Export open={exportDialogOpen} onClose={() => (exportDialogOpen = false)} />

	<!-- Restore Toast -->
	{#if restorePrompt.show}
		<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1e2030] border border-[#2a2d3e] rounded-xl px-4 py-3 shadow-2xl text-xs text-white">
			<span class="material-symbols-outlined text-[#8b5cf6] text-lg">save</span>
			<span>Restore auto-saved project <strong>{restorePrompt.projectName}</strong>?</span>
			<div class="flex items-center gap-2 ml-2">
				<button type="button" class="bg-[#8b5cf6] text-white font-bold px-3 py-1 rounded-md hover:bg-[#9d71fd] transition-colors" onclick={handleRestoreProject}>Restore</button>
				<button type="button" class="bg-[#181b28] border border-[#2a2d3e] text-[#94a3b8] px-3 py-1 rounded-md hover:text-white transition-colors" onclick={handleDismissRestore}>Dismiss</button>
			</div>
		</div>
	{/if}

	<!-- Drag & Drop Overlay -->
	{#if isGlobalDragOver}
		<div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
			<div class="border-2 border-dashed border-[#8b5cf6] bg-[#111219]/90 rounded-2xl p-10 flex flex-col items-center gap-3 text-center shadow-2xl">
				<span class="material-symbols-outlined text-5xl text-[#8b5cf6] animate-pulse">cloud_upload</span>
				<h3 class="text-lg font-bold text-white">Drop Media Files to Import</h3>
				<p class="text-xs text-[#94a3b8] max-w-xs">Videos, audio tracks, and images will be automatically added to your RayShot media library.</p>
			</div>
		</div>
	{/if}
</div>
