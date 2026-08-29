<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { importMediaFiles, restoreCachedAssets } from '$lib/utils/mediaUtils';
	import { opfsGetAutoSaveMeta, opfsLoadAutoSave } from '$lib/core/persistence/opfsAdapter';
	import type { Project } from '$lib/types/project';
	import Toolbar from '$lib/features/toolbar/Toolbar.svelte';
	import MediaBin from '$lib/features/media/MediaBin.svelte';
	import Canvas from '$lib/features/canvas/Canvas.svelte';
	import Controls from '$lib/features/canvas/Controls.svelte';
	import Inspector from '$lib/features/inspector/Inspector.svelte';
	import Timeline from '$lib/features/timeline/Timeline.svelte';
	import Export from '$lib/features/export/Export.svelte';

	let fileInput = $state<HTMLInputElement | null>(null);
	let exportDialogOpen = $state(false);
	let isGlobalDragOver = $state(false);
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
				name: 'Untitled Project',
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
		opfsGetAutoSaveMeta().then((meta) => {
			if (meta && meta.savedAt) {
				// Only offer restore if saved less than 30 days ago
				const ageDays = (Date.now() - meta.savedAt) / (1000 * 60 * 60 * 24);
				if (ageDays < 30) {
					restorePrompt = { show: true, projectName: meta.projectName, savedAt: meta.savedAt };
				}
			}
		}).catch(() => {});

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
</script>

<div class="app-layout-shell" role="application">
	<Toolbar
		onOpenExport={() => (exportDialogOpen = true)}
		onImportMedia={() => fileInput?.click()}
	/>

	<!-- OPFS auto-save restore toast -->
	{#if restorePrompt.show}
		<div class="restore-toast">
			<span class="restore-icon">💾</span>
			<span class="restore-text">
				Restore <strong>{restorePrompt.projectName}</strong>?
				<span class="restore-time">
					Saved {new Date(restorePrompt.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
				</span>
			</span>
			<button class="restore-btn-yes" onclick={handleRestoreProject}>Restore</button>
			<button class="restore-btn-no" onclick={handleDismissRestore}>Dismiss</button>
		</div>
	{/if}

	<!-- Permanent 3-Pane NLE Workspace Grid -->
	<div class="nle-workspace-grid">
		<!-- Middle Row: Left Category Drawer / Media Bin | Center Canvas & Transport | Right Contextual Inspector -->
		<div class="middle-work-row">
			<div class="left-mediabin-col">
				<MediaBin />
			</div>

			<div class="center-canvas-col">
				<div class="canvas-screen-box">
					<Canvas />
				</div>
				<Controls />
			</div>

			<div class="right-inspector-col">
				<Inspector />
			</div>
		</div>

		<!-- Bottom Row: Multitrack Timeline -->
		<div class="bottom-timeline-row">
			<Timeline />
		</div>
	</div>

	<input
		type="file"
		bind:this={fileInput}
		onchange={handleFileChange}
		multiple
		accept="video/*,audio/*,image/*"
		style="display: none;"
	/>

	<Export open={exportDialogOpen} onClose={() => (exportDialogOpen = false)} />

	{#if isGlobalDragOver}
		<div class="global-drag-curtain">
			<div class="curtain-card">
				<span class="curtain-icon">📥</span>
				<div class="curtain-text-group">
					<span class="curtain-heading">Drop footage to import into RayShot</span>
					<span class="curtain-subtext">Videos, audio tracks, and images will be added to your project</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.app-layout-shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
		background: var(--color-bg-base, #090a0d);
		overflow: hidden;
		position: relative;
	}

	.nle-workspace-grid {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.middle-work-row {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.left-mediabin-col {
		width: 290px;
		min-width: 260px;
		max-width: 380px;
		height: 100%;
		flex-shrink: 0;
		background: var(--color-bg-surface, #121319);
	}

	.center-canvas-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		background: #000000;
		position: relative;
	}

	.canvas-screen-box {
		flex: 1;
		min-height: 0;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000000;
	}

	.right-inspector-col {
		width: 280px;
		min-width: 250px;
		max-width: 360px;
		height: 100%;
		flex-shrink: 0;
		background: var(--color-bg-surface, #121319);
	}

	.bottom-timeline-row {
		height: 280px;
		min-height: 200px;
		max-height: 480px;
		flex-shrink: 0;
		position: relative;
		border-top: 1px solid var(--color-border-subtle, #232738);
	}

	/* Global Drag Curtain */
	.global-drag-curtain {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(9, 10, 13, 0.88);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		pointer-events: none;
	}

	.curtain-card {
		padding: 32px 48px;
		border: 2px dashed var(--color-accent-primary, #38bdf8);
		border-radius: 12px;
		background: rgba(18, 19, 25, 0.98);
		color: #f1f5f9;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
	}

	.curtain-icon {
		font-size: 2.75rem;
	}

	.curtain-text-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.curtain-heading {
		font-size: 1.05rem;
		font-weight: 600;
		color: #ffffff;
	}


	.curtain-subtext {
		font-size: 0.8rem;
		color: #94a3b8;
	}

	/* OPFS Restore Toast */
	.restore-toast {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 10px;
		background: #1e2130;
		border: 1px solid #334155;
		border-radius: 10px;
		padding: 10px 16px;
		z-index: 1500;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		font-size: 0.85rem;
		color: #cbd5e1;
		animation: slideUp 0.2s ease;
	}

	@keyframes slideUp {
		from { opacity: 0; transform: translateX(-50%) translateY(12px); }
		to   { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	.restore-icon { font-size: 1.1rem; }

	.restore-text strong { color: #f1f5f9; }

	.restore-time {
		font-size: 0.75rem;
		color: #64748b;
		margin-left: 4px;
	}

	.restore-btn-yes {
		background: #38bdf8;
		color: #000;
		border: none;
		border-radius: 6px;
		padding: 4px 12px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.restore-btn-no {
		background: transparent;
		color: #64748b;
		border: 1px solid #334155;
		border-radius: 6px;
		padding: 4px 10px;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.restore-btn-yes:hover { background: #7dd3fc; }
	.restore-btn-no:hover { color: #94a3b8; }
</style>
