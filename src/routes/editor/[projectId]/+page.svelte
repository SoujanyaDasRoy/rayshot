<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { timelineStore } from '$lib/stores/timeline.svelte';
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
	import ColorPanel from '$lib/features/colorgrade/ColorPanel.svelte';
	import { pageById, type PageId, type ToolId } from '$lib/features/shell/pages';

	let { data }: { data: { projectId: string } } = $props();

	const history = commandProcessor.getHistoryStore();

	let fileInput = $state<HTMLInputElement | null>(null);
	let exportDialogOpen = $state(false);
	let isGlobalDragOver = $state(false);
	let activePage = $state<PageId>('media');
	let activeTool = $state<ToolId>('import');
	let sidebarExpanded = $state(true);
	let activeMediaFolder = $state<string>('all');
	let inspectorVisible = $state(true);
	// Settings and Help are things you open and close, not workspaces you work
	// in, so they overlay the current page instead of pretending to be one.
	let utilityView = $state<'settings' | 'help' | null>(null);

	const showsTimeline = $derived(pageById(activePage).showsTimeline);

	function selectPage(id: PageId) {
		activePage = id;
		utilityView = null;
		const first = pageById(id).tools[0];
		if (first) activeTool = first;
	}

	function selectTool(id: ToolId) {
		activeTool = id;
		utilityView = null;
	}

	// The clip inspector and the grade panel occupy the same column; which one
	// you get is the difference between the Edit room and the Color room.
	const selectedClip = $derived.by(() => {
		const project = $projectStore;
		const id = $timelineStore.selectedClipId;
		if (!project || !id) return null;
		return project.clips.get(id) ?? null;
	});

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
		{activePage}
		{activeTool}
		onSelectTool={selectTool}
		{utilityView}
		onSelectUtility={(v) => (utilityView = utilityView === v ? null : v)}
		bind:expanded={sidebarExpanded}
		bind:activeFolder={activeMediaFolder}
		onSelectFolder={() => selectPage('media')}
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
			{activePage}
			onSelectPage={selectPage}
		/>

		<div class="middle-work-row flex flex-1 min-h-0 overflow-hidden">
			<div class="flex-1 h-full min-w-0 overflow-hidden relative">
				{#if utilityView === 'settings'}
					<SettingsView />
				{:else if utilityView === 'help'}
					<HelpView />
				{:else if activePage === 'media'}
					<!-- Media: the library, or whichever way you are bringing media in. -->
					{#if activeTool === 'record'}
						<RecordView />
					{:else if activeTool === 'templates'}
						<TemplatesView />
					{:else}
						<MediaLibraryView bind:activeFolder={activeMediaFolder} {inspectorVisible} />
					{/if}
				{:else}
					<!-- Edit / Color / Audio share a viewer; what flanks it is the page. -->
					<div class="flex h-full w-full overflow-hidden">
						{#if activePage !== 'color'}
							<aside class="left-mediabin-col">
								<MediaBin activePillar={activeTool as any} />
							</aside>
						{/if}

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
								{#if activePage === 'color'}
									{#if selectedClip}
										<ColorPanel clip={selectedClip} />
									{:else}
										<div class="panel-empty">
											<span class="panel-empty-title">No clip selected</span>
											<span class="panel-empty-hint">Select a clip on the timeline to grade it.</span>
										</div>
									{/if}
								{:else}
									<Inspector />
								{/if}
							</aside>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- The timeline belongs to the pages that edit a sequence, not the library. -->
		{#if showsTimeline && !utilityView}
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
		<div class="restore-toast">
			<span class="restore-text">
				Auto-saved project <strong>{restorePrompt.projectName}</strong> is available.
			</span>
			<div class="restore-actions">
				<button type="button" class="restore-primary" onclick={handleRestoreProject}>Restore</button>
				<button type="button" class="restore-secondary" onclick={handleDismissRestore}>Dismiss</button>
			</div>
		</div>
	{/if}

	<!-- Drag & Drop Overlay -->
	{#if isGlobalDragOver}
		<div class="drop-overlay">
			<div class="drop-card">
				<h3 class="drop-title">Drop to import</h3>
				<p class="drop-hint">Video, audio and images are added to your media library.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Monochrome, and phrased as a state plus an action rather than a question
	   ("Restore auto-saved project X?"), so the buttons carry the verbs. */
	.restore-toast {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 12px 10px 16px;
		border: 1px solid var(--ms-edge-strong);
		border-radius: 999px;
		background: var(--ms-raised);
		backdrop-filter: blur(30px) saturate(0%);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
		font-family: var(--ms-font);
		font-size: 12px;
		color: var(--ms-text-secondary);
	}

	.restore-text strong {
		color: var(--ms-text);
		font-weight: 590;
	}

	.restore-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.restore-primary,
	.restore-secondary {
		height: 26px;
		padding: 0 14px;
		border-radius: 999px;
		font-family: inherit;
		font-size: 12px;
		font-weight: 590;
		cursor: pointer;
		transition: background var(--ms-fast) var(--ms-ease);
	}

	.restore-primary {
		border: none;
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.restore-primary:hover {
		background: rgba(255, 255, 255, 0.88);
	}

	.restore-secondary {
		border: 1px solid var(--ms-edge);
		background: transparent;
		color: var(--ms-text-secondary);
	}

	.restore-secondary:hover {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	.drop-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(6px);
		pointer-events: none;
	}

	.drop-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 32px 40px;
		border: 1px dashed var(--ms-edge-strong);
		border-radius: var(--ms-radius-lg);
		background: var(--ms-material);
		text-align: center;
		font-family: var(--ms-font);
	}

	.drop-title {
		margin: 0;
		font-size: 15px;
		font-weight: 590;
		color: var(--ms-text);
	}

	.drop-hint {
		margin: 0;
		max-width: 34ch;
		font-size: 12px;
		color: var(--ms-text-tertiary);
	}
	/* An empty panel is an instruction, not a shrug: say what to do next. */
	.panel-empty {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 24px;
		text-align: center;
		font-family: var(--ms-font);
	}

	.panel-empty-title {
		font-size: 13px;
		font-weight: 590;
		color: var(--ms-text-secondary);
	}

	.panel-empty-hint {
		max-width: 22ch;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ms-text-tertiary);
	}
</style>
