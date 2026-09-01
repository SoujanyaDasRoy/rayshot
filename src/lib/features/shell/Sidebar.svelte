<script lang="ts">
	import { Collapsible, Tooltip } from 'bits-ui';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';
	import { projectStore } from '$lib/stores/project.svelte';
	import { getImportedFolders, filterMediaFiles, folderNameFromRelativePath } from '$lib/utils/mediaFilters';
	import { importMediaFiles } from '$lib/utils/mediaUtils';

	type NavTab =
		| 'media'
		| 'record'
		| 'effects'
		| 'templates'
		| 'text'
		| 'transitions'
		| 'settings'
		| 'help';

	let {
		activeTab = $bindable('media' as NavTab),
		expanded = $bindable(true),
		activeFolder = $bindable('all'),
		canUndo = false,
		canRedo = false,
		onUndo,
		onRedo
	}: {
		activeTab?: NavTab;
		expanded?: boolean;
		activeFolder?: string;
		canUndo?: boolean;
		canRedo?: boolean;
		onUndo: () => void;
		onRedo: () => void;
	} = $props();

	type NavItem = { id: NavTab; label: string; icon: IconName; key?: string };

	// Two levels of hierarchy, no more, with succinct group titles (Apple HIG).
	// `key` is this item's number-key shortcut — order here IS shortcut order.
	const libraryNav: NavItem[] = [
		{ id: 'media', label: 'Media', icon: 'library', key: '1' },
		{ id: 'record', label: 'Record', icon: 'record', key: '2' },
		{ id: 'templates', label: 'Templates', icon: 'templates', key: '3' }
	];

	const editNav: NavItem[] = [
		{ id: 'effects', label: 'Effects', icon: 'effects', key: '4' },
		{ id: 'text', label: 'Text', icon: 'text', key: '5' }
	];

	const utilityNav: NavItem[] = [
		{ id: 'settings', label: 'Settings', icon: 'settings' },
		{ id: 'help', label: 'Help', icon: 'help' }
	];

	const shortcutable = [...libraryNav, ...editNav];

	// Real imported folders only (see mediaFilters.ts) — the same source
	// MediaLibraryView reads, so the two can't drift. Empty means no Folders
	// section at all, not a placeholder list.
	const folders = $derived(getImportedFolders($projectStore?.assets.values() ?? []));

	let foldersOpen = $state(true);
	let fileInput = $state<HTMLInputElement | null>(null);
	let folderInput = $state<HTMLInputElement | null>(null);

	async function handleFileImport() {
		const input = fileInput;
		if (!input || !input.files || input.files.length === 0) return;
		await importMediaFiles(Array.from(input.files), false);
		input.value = '';
	}

	async function handleFolderImport() {
		const input = folderInput;
		if (!input || !input.files || input.files.length === 0) return;
		const mediaFiles = filterMediaFiles(Array.from(input.files));
		const folderName = folderNameFromRelativePath(
			(input.files[0] as File & { webkitRelativePath: string }).webkitRelativePath
		);
		await importMediaFiles(mediaFiles, false, folderName);
		input.value = '';
	}

	// Exactly one row is ever lit. Media owns the unfiltered library, so it
	// dims as soon as a folder narrows the view.
	function isSelected(id: NavTab) {
		if (id === 'media') return activeTab === 'media' && activeFolder === 'all';
		return activeTab === id;
	}

	function selectNav(id: NavTab) {
		if (id === 'media') activeFolder = 'all';
		activeTab = id;
	}

	function selectFolder(id: string) {
		activeTab = 'media';
		activeFolder = id;
	}

	// ── Preferences persist across reloads — collapsed state and the last tab
	// you were on, the same way a real desktop app remembers its window state.
	// Read synchronously at init (not in onMount) so there's no flash of the
	// default state before this corrects it.
	const STORAGE_KEY = 'rayshot:sidebar';
	if (typeof localStorage !== 'undefined') {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
			if (typeof saved.expanded === 'boolean') expanded = saved.expanded;
			if (typeof saved.activeTab === 'string') activeTab = saved.activeTab;
		} catch {
			/* corrupt or absent — defaults stand */
		}
	}
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ expanded, activeTab }));
	});

	// ── Keyboard: number keys jump panels, Ctrl/Cmd+Z undoes, Ctrl+Y /
	// Cmd+Shift+Z redoes (matches what Help already documents). Bits UI's
	// Toolbar below handles arrow-key movement once a row has focus; this
	// covers jumping to a panel from anywhere else in the app.
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

	function isTypingTarget(el: EventTarget | null) {
		if (!(el instanceof HTMLElement)) return false;
		return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isTypingTarget(e.target)) return;

		const mod = isMac ? e.metaKey : e.ctrlKey;
		if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) onRedo();
			else onUndo();
			return;
		}
		if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			onRedo();
			return;
		}

		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const item = shortcutable.find((i) => i.key === e.key);
		if (item) {
			e.preventDefault();
			selectNav(item.id);
			return;
		}

		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			const active = document.activeElement;
			if (!(active instanceof HTMLElement) || !active.closest('.rail')) return;
			// Bits UI's Toolbar was tried here for this exact behavior, but its
			// roving-tabindex computation doesn't run when composed inside a
			// Tooltip.Trigger child snippet — every item ends up tabindex="-1"
			// and unreachable by Tab. Hand-rolled instead of shipping that
			// regression; Tooltip/Collapsible/Dialog/Progress below are all
			// still Bits UI.
			const rows = Array.from(document.querySelectorAll<HTMLElement>('.rail .row')).filter(
				(el) => el.offsetParent !== null
			);
			const from = rows.indexOf(active);
			if (from === -1) return;
			e.preventDefault();
			const to = e.key === 'ArrowDown' ? (from + 1) % rows.length : (from - 1 + rows.length) % rows.length;
			rows[to]?.focus();
		}
	}

	$effect(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function shortcutHint(key?: string) {
		return key ? ` (${key})` : '';
	}

	const undoHint = $derived(isMac ? '⌘Z' : 'Ctrl+Z');
	const redoHint = $derived(isMac ? '⌘⇧Z' : 'Ctrl+Y');
</script>

{#snippet navGroup(title: string, items: NavItem[])}
	<div class="group" role="group" aria-label={title || undefined}>
		{#if expanded && title}<h2 class="group-title">{title}</h2>{/if}
		{#each items as item (item.id)}
			<Tooltip.Root disabled={expanded}>
				<Tooltip.Trigger
					class="row"
					data-selected={isSelected(item.id) ? '' : undefined}
					aria-current={isSelected(item.id) ? 'page' : undefined}
					aria-label={expanded ? undefined : item.label}
					onclick={() => selectNav(item.id)}
				>
					<Icon name={item.icon} size={18} selected={isSelected(item.id)} />
					{#if expanded}
						<span class="row-label">{item.label}</span>
						{#if item.key}<kbd class="key-hint">{item.key}</kbd>{/if}
					{/if}
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content class="tip" side="right" sideOffset={10}
						>{item.label}{shortcutHint(item.key)}</Tooltip.Content
					>
				</Tooltip.Portal>
			</Tooltip.Root>
		{/each}
	</div>
{/snippet}

<Tooltip.Provider delayDuration={450} disableHoverableContent>
	<aside class="rail" class:collapsed={!expanded} aria-label="Main">
		<!--
			Identity lives here, not the title bar — one place for it, matching how
			VS Code's activity bar (not its editor title bar) carries the brand mark.
		-->
		<header class="head">
			<div class="brand">
				{#if expanded}
					<img class="lockup" src="/assets/logos/rayshot_lockup.png" alt="RayShot" />
				{:else}
					<img class="mark" src="/assets/logos/rayshot_mark.png" alt="RayShot" />
				{/if}
			</div>
			<Tooltip.Root disabled={expanded}>
				<Tooltip.Trigger
					class="ghost-btn toggle-sidebar"
					onclick={() => (expanded = !expanded)}
					aria-label={expanded ? 'Hide sidebar' : 'Show sidebar'}
				>
					<Icon name="sidebar" size={18} />
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content class="tip" side="right" sideOffset={10}>Show sidebar</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</header>

		<!--
			History sits directly under the identity, not at the bottom (Apple HIG:
			never put critical actions at the bottom of a sidebar — people drag
			windows in ways that hide the bottom edge). Export itself now lives in
			the title bar, alongside the project name.
		-->
		<div class="actions">
			<div class="history" class:stacked={!expanded}>
				<Tooltip.Root disabled={expanded}>
					<Tooltip.Trigger class="ghost-btn" onclick={onUndo} disabled={!canUndo} aria-label="Undo">
						<Icon name="undo" size={17} />
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content class="tip" side="right" sideOffset={10}>Undo ({undoHint})</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
				<Tooltip.Root disabled={expanded}>
					<Tooltip.Trigger class="ghost-btn" onclick={onRedo} disabled={!canRedo} aria-label="Redo">
						<Icon name="redo" size={17} />
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content class="tip" side="right" sideOffset={10}>Redo ({redoHint})</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="nav">
			<div class="group" role="group" aria-label="Import">
				{#if expanded}<h2 class="group-title">Import</h2>{/if}
				<Tooltip.Root disabled={expanded}>
					<Tooltip.Trigger
						class="row"
						onclick={() => fileInput?.click()}
						aria-label={expanded ? undefined : 'Import Files'}
					>
						<Icon name="import" size={18} />
						{#if expanded}<span class="row-label">Import Files</span>{/if}
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content class="tip" side="right" sideOffset={10}>Import Files</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
				<Tooltip.Root disabled={expanded}>
					<Tooltip.Trigger
						class="row"
						onclick={() => folderInput?.click()}
						aria-label={expanded ? undefined : 'Import Folder'}
					>
						<Icon name="folder" size={18} />
						{#if expanded}<span class="row-label">Import Folder</span>{/if}
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content class="tip" side="right" sideOffset={10}>Import Folder</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
			</div>

			{@render navGroup('Library', libraryNav)}
			{@render navGroup('Edit', editNav)}

			<!-- Disclosure keeps the rail's vertical space manageable (Apple HIG).
			     Real imported folders only — nothing to show, nothing rendered. -->
			{#if expanded && folders.length > 0}
				<Collapsible.Root bind:open={foldersOpen} class="group">
					<Collapsible.Trigger class="group-title disclosure">
						<Icon name="chevron" size={12} class={foldersOpen ? 'chev open' : 'chev'} />
						<span>Folders</span>
					</Collapsible.Trigger>
					<Collapsible.Content>
						{#each folders as folder (folder.name)}
							<button
								class="row folder"
								data-selected={activeTab === 'media' && activeFolder === folder.name ? '' : undefined}
								onclick={() => selectFolder(folder.name)}
							>
								<Icon
									name="folder"
									size={16}
									selected={activeTab === 'media' && activeFolder === folder.name}
								/>
								<span class="row-label">{folder.name}</span>
								<span class="count">{folder.count}</span>
							</button>
						{/each}
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}

			<div class="spacer"></div>

			{@render navGroup('', utilityNav)}
		</nav>

		<input
			type="file"
			bind:this={fileInput}
			onchange={handleFileImport}
			multiple
			accept="video/*,audio/*,image/*"
			style="display: none;"
		/>
		<input
			type="file"
			bind:this={folderInput}
			onchange={handleFolderImport}
			webkitdirectory
			multiple
			style="display: none;"
		/>
	</aside>
</Tooltip.Provider>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		width: var(--ms-rail-w);
		height: 100%;
		flex-shrink: 0;
		background: var(--ms-material);
		backdrop-filter: blur(30px) saturate(0%);
		-webkit-backdrop-filter: blur(30px) saturate(0%);
		border-right: 1px solid var(--ms-edge);
		font-family: var(--ms-font);
		overflow: hidden;
	}

	.rail.collapsed {
		width: var(--ms-rail-w-collapsed);
	}

	/* Identity */
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		height: var(--ms-titlebar-h);
		padding: 0 10px;
		flex-shrink: 0;
	}

	.collapsed .head {
		flex-direction: column;
		height: auto;
		gap: 6px;
		padding: 12px 0 8px;
	}

	.brand {
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
	}

	.lockup {
		height: 28px;
		width: auto;
		flex-shrink: 0;
		object-fit: contain;
	}

	.mark {
		height: 22px;
		width: 22px;
		flex-shrink: 0;
		object-fit: contain;
	}

	/* Buttons */
	:global(.rail .ghost-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--ms-text-secondary);
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			color var(--ms-fast) var(--ms-ease);
	}

	:global(.rail .ghost-btn:hover:not(:disabled)) {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	:global(.rail .ghost-btn:active:not(:disabled)) {
		background: var(--ms-pressed);
	}

	:global(.rail .ghost-btn:disabled) {
		color: var(--ms-text-quaternary);
		cursor: default;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 10px 12px;
		flex-shrink: 0;
	}

	.history {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 2px;
		border-radius: var(--ms-radius);
		background: var(--ms-raised);
	}

	.history.stacked {
		grid-template-columns: 1fr;
	}

	:global(.rail .history .ghost-btn) {
		width: 100%;
	}

	/* Navigation */
	.nav {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0 10px 8px;
	}

	:global(.rail .group) {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-bottom: 14px;
	}

	:global(.rail .group-title) {
		display: flex;
		align-items: center;
		gap: 5px;
		margin: 0 0 4px;
		padding: 0 8px;
		font-family: inherit;
		font-size: 11px;
		font-weight: 590;
		letter-spacing: 0.062em;
		text-transform: uppercase;
		color: var(--ms-text-tertiary);
		white-space: nowrap;
	}

	:global(.rail .disclosure) {
		width: 100%;
		height: 20px;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: color var(--ms-fast) var(--ms-ease);
	}

	:global(.rail .disclosure:hover) {
		color: var(--ms-text-secondary);
	}

	:global(.rail .chev) {
		transition: transform var(--ms-base) var(--ms-ease);
	}

	:global(.rail .chev.open) {
		transform: rotate(90deg);
	}

	:global(.rail .row) {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: var(--ms-row-h);
		padding: 0 8px;
		border: none;
		border-radius: var(--ms-radius);
		background: transparent;
		color: var(--ms-text-secondary);
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.008em;
		text-align: left;
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			color var(--ms-fast) var(--ms-ease);
	}

	.collapsed :global(.row) {
		justify-content: center;
		padding: 0;
	}

	:global(.rail .row:hover) {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	/*
		Selection is a filled pill with a lit top edge, the one place in the shell
		that pretends to catch light.
	*/
	:global(.rail .row[data-selected]) {
		background: var(--ms-selected);
		box-shadow: inset 0 1px 0 var(--ms-edge-lit);
		color: var(--ms-text);
		font-weight: 590;
	}

	.row-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.key-hint {
		flex-shrink: 0;
		min-width: 14px;
		padding: 1px 4px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.07);
		font-family: var(--ms-font-mono);
		font-size: 10px;
		text-align: center;
		color: var(--ms-text-quaternary);
	}

	:global(.rail .row[data-selected]) .key-hint {
		background: rgba(0, 0, 0, 0.22);
		color: var(--ms-text-tertiary);
	}

	.count {
		font-family: var(--ms-font-mono);
		font-size: 11px;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: var(--ms-text-quaternary);
	}

	.spacer {
		flex: 1;
		min-height: 12px;
	}

	/* Contents fade in as the rail opens, so the snap does not read as a jump. */
	.lockup,
	.row-label,
	.count {
		animation: ms-fade-in 170ms var(--ms-ease) both;
	}

	@keyframes ms-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Focus */
	:global(.rail button:focus-visible) {
		outline: 2px solid var(--ms-text);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.lockup,
		.row-label,
		.count {
			animation: none;
		}

		:global(.rail .chev),
		:global(.rail .row),
		:global(.rail .ghost-btn) {
			transition: none;
		}
	}
</style>
