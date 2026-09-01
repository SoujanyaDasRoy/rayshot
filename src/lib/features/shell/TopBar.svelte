<script lang="ts">
	import { Progress } from 'bits-ui';
	import Icon from './Icon.svelte';
	import { exportStore } from '$lib/stores/export.svelte';
	import { importMediaFiles } from '$lib/utils/mediaUtils';

	let {
		projectName,
		onRenameProject,
		onExport,
		inspectorVisible = true,
		onToggleInspector
	}: {
		projectName: string;
		onRenameProject: (name: string) => void;
		onExport: () => void;
		inspectorVisible?: boolean;
		onToggleInspector: () => void;
	} = $props();

	const exportProgress = $derived($exportStore.currentExport?.progress ?? 0);
	const isExportingNow = $derived($exportStore.currentExport?.status === 'exporting');

	let addFileInput = $state<HTMLInputElement | null>(null);

	async function handleQuickAdd() {
		const input = addFileInput;
		if (!input || !input.files || input.files.length === 0) return;
		await importMediaFiles(Array.from(input.files), false);
		input.value = '';
	}
</script>

<!--
	Sits above the main content only, not the sidebar — the sidebar carries its
	own identity, this bar just carries the document (project name + view
	controls), the way a pro app's title bar sits over the editor, not the
	activity rail. Not a fake macOS titlebar either (Apple HIG: don't replicate
	window chrome), so no traffic lights here. Height matches the sidebar
	header's so the two dividers line up in one line across the app.
-->
<header class="topbar">
	<div class="side">
		<button
			type="button"
			class="ghost-btn"
			onclick={() => addFileInput?.click()}
			aria-label="Add files"
		>
			<Icon name="add" size={17} />
		</button>
		<input
			type="file"
			bind:this={addFileInput}
			onchange={handleQuickAdd}
			multiple
			accept="video/*,audio/*,image/*"
			style="display: none;"
		/>
	</div>

	<input
		class="name-input"
		value={projectName}
		oninput={(e) => onRenameProject((e.currentTarget as HTMLInputElement).value)}
		aria-label="Project name"
	/>

	<div class="side actions">
		<button
			type="button"
			class="ghost-btn"
			class:active={inspectorVisible}
			onclick={onToggleInspector}
			aria-pressed={inspectorVisible}
			aria-label={inspectorVisible ? 'Hide inspector' : 'Show inspector'}
		>
			<Icon name="inspector" size={16} />
		</button>

		<button type="button" class="export" onclick={onExport}>
			{#if isExportingNow}
				<Progress.Root value={exportProgress} max={100} class="export-progress">
					<div class="export-progress-fill" style="width: {exportProgress}%"></div>
				</Progress.Root>
			{/if}
			<Icon name="export" size={15} />
			<span>{isExportingNow ? `Exporting… ${exportProgress}%` : 'Export'}</span>
		</button>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		height: var(--ms-titlebar-h);
		padding: 0 14px;
		border-bottom: 1px solid var(--ms-edge);
		background: var(--ms-void);
		flex-shrink: 0;
	}

	.side {
		display: flex;
		align-items: center;
		min-width: 0;
	}

	/* Centered on the whole window, not just this bar's own share of it — a
	   fixed OS window title stays put regardless of side panels, so this does
	   too instead of drifting when the sidebar collapses or the inspector
	   toggles. Pure void fill (not a lighter material) with just a hairline
	   border to read as a pill; a wash here read as muddy, not "clear". */
	.name-input {
		position: fixed;
		top: calc((var(--ms-titlebar-h) - 30px) / 2);
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		width: 280px;
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--ms-edge);
		border-radius: 999px;
		background: var(--ms-void);
		color: var(--ms-text);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 590;
		letter-spacing: -0.008em;
		text-align: center;
		text-overflow: ellipsis;
		transition:
			background var(--ms-fast) var(--ms-ease),
			border-color var(--ms-fast) var(--ms-ease);
	}

	.name-input:hover {
		background: var(--ms-hover);
		border-color: var(--ms-edge-strong);
	}

	.name-input:focus {
		outline: none;
		background: var(--ms-raised);
		border-color: var(--ms-edge-lit);
	}

	.name-input:focus-visible {
		outline: 2px solid var(--ms-text);
		outline-offset: 2px;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		flex-shrink: 0;
	}

	.ghost-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--ms-text-secondary);
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			color var(--ms-fast) var(--ms-ease);
	}

	.ghost-btn:hover {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	.ghost-btn.active {
		background: var(--ms-raised);
		color: var(--ms-text);
	}

	/* Primary action inverts — the one white-on-black element in this bar. */
	.export {
		position: relative;
		display: flex;
		align-items: center;
		gap: 7px;
		height: 30px;
		padding: 0 16px;
		flex-shrink: 0;
		border: none;
		border-radius: 999px;
		background: var(--ms-text);
		color: var(--ms-void);
		font-family: inherit;
		font-size: 12px;
		font-weight: 590;
		letter-spacing: -0.008em;
		cursor: pointer;
		overflow: hidden;
		transition: background var(--ms-fast) var(--ms-ease);
	}

	.export:hover {
		background: rgba(255, 255, 255, 0.88);
	}

	.export:active {
		transform: scale(0.98);
	}

	/* A render running in the background gets a slim fill along the button's own
	   bottom edge — the same idea as a browser download bar, not a separate modal. */
	:global(.topbar .export-progress) {
		position: absolute;
		inset: auto 0 0 0;
		height: 2px;
		background: rgba(0, 0, 0, 0.15);
	}

	.export-progress-fill {
		height: 100%;
		background: var(--ms-void);
		transition: width 200ms var(--ms-ease);
	}
</style>
