<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import { projectStore } from '$lib/stores/project.svelte';
	import { timelineStore } from '$lib/stores/timeline.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { AddClipCommand } from '$lib/core/commands/addClip';
	import { thumbnailCache, placeholderThumbnail } from '$lib/utils/mediaUtils';
	import { getImportedFolders } from '$lib/utils/mediaFilters';
	import { get } from 'svelte/store';
	import type { MediaAsset } from '$lib/types/project';

	let { activeFolder = $bindable('all'), inspectorVisible = true } = $props<{
		activeFolder?: string;
		inspectorVisible?: boolean;
	}>();
	let searchQuery = $state('');
	let selectedAssetId = $state<string | null>(null);
	let fileSectionOpen = $state(true);
	let videoSectionOpen = $state(true);
	// Folders are real imports only — see getImportedFolders. No manual
	// create-empty-folder flow: an empty folder would just disappear again.
	const importedFolders = $derived(getImportedFolders($projectStore?.assets.values() ?? []));

	// Real imported assets only — an empty library shows the actual empty
	// state below, not stand-in demo clips.
	const allAssets = $derived(Array.from($projectStore?.assets.values() ?? []) as MediaAsset[]);

	// Filter assets by search query and active folder
	const filteredAssets = $derived.by(() => {
		let list = allAssets;

		if (activeFolder !== 'all') {
			list = list.filter((a) => a.folder === activeFolder);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter((a) => a.filename.toLowerCase().includes(q));
		}

		return list;
	});

	// Currently selected asset for the Asset Details sidebar
	const activeAsset = $derived.by(() => {
		if (!selectedAssetId) return allAssets[0] ?? null;
		return allAssets.find((a) => a.id === selectedAssetId) ?? allAssets[0] ?? null;
	});

	function handleSelectAsset(id: string) {
		selectedAssetId = id;
	}

	function handleAddActiveToTimeline(assetId?: string) {
		const targetId = assetId || selectedAssetId;
		if (!targetId) return;

		const project = get(projectStore);
		if (!project || !project.activeSequenceId) return;

		const asset = allAssets.find((a) => a.id === targetId);
		if (!asset) return;

		const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
		if (!sequence) return;

		const isAudio = asset.type === 'audio';
		let targetTrack = sequence.tracks.find((t) => t.type === (isAudio ? 'audio' : 'video'));
		if (!targetTrack && sequence.tracks.length > 0) {
			targetTrack = sequence.tracks[0];
		}
		if (!targetTrack) return;

		const playheadTime = get(playbackStore).currentTime;
		const addCmd = new AddClipCommand({
			mediaAssetId: targetId,
			trackId: targetTrack.id,
			position: playheadTime
		});
		commandProcessor.execute(addCmd);
	}

	function formatTimecode(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		const f = Math.floor((sec % 1) * 24);
		return `00:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
	}

	function formatDurationShort(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}

	function formatAddedDate(ts: number): string {
		const date = new Date(ts);
		const isToday = date.toDateString() === new Date().toDateString();
		const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		return isToday ? `Added today at ${time}` : `Added ${date.toLocaleDateString()} at ${time}`;
	}
</script>

<div class="media-library-container">
	<!-- Left Main Content Area: Folders + Media Grid -->
	<div class="library-main-panel">
		<!-- Top Bar: Title, Search — importing itself lives in the sidebar now -->
		<div class="library-header">
			<h1 class="library-title">Media Library</h1>

			<div class="header-actions">
				<!-- Search Input -->
				<div class="search-box">
					<span class="material-symbols-outlined search-icon">search</span>
					<input
						type="text"
						placeholder="Search media..."
						bind:value={searchQuery}
						class="search-input"
					/>
					{#if searchQuery}
						<button type="button" class="clear-btn" onclick={() => (searchQuery = '')}>✕</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Scrollable Body: FOLDERS & ALL MEDIA -->
		<div class="library-scroll-body">
			<!-- FOLDERS Section — real imported folders only; nothing to show, nothing rendered -->
			{#if importedFolders.length > 0}
				<div class="section-block">
					<div class="section-label-row">
						<span class="section-label">FOLDERS</span>
						{#if activeFolder !== 'all'}
							<button
								type="button"
								class="view-all-link"
								onclick={() => (activeFolder = 'all')}
							>
								View All ({allAssets.length})
							</button>
						{/if}
					</div>

					<div class="folders-grid">
						{#each importedFolders as folder (folder.name)}
							<button
								type="button"
								class="folder-card"
								class:active={activeFolder === folder.name}
								onclick={() => (activeFolder = activeFolder === folder.name ? 'all' : folder.name)}
							>
								<div class="folder-icon-box">
									<span class="material-symbols-outlined folder-icon">folder</span>
								</div>
								<span class="folder-title">{folder.name}</span>
								<span class="folder-count">{folder.count}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- ALL MEDIA Section -->
			<div class="section-block mt-6">
				<div class="section-label-row">
					<span class="section-label">
						{activeFolder === 'all' ? 'ALL MEDIA' : `MEDIA IN ${activeFolder.toUpperCase()}`}
					</span>
					<span class="asset-count-badge">{filteredAssets.length} items</span>
				</div>

				<div class="media-cards-grid">
					{#each filteredAssets as asset (asset.id)}
						{@const isSelected = selectedAssetId === asset.id}
						<div
							class="media-card"
							class:selected={isSelected}
							role="button"
							tabindex="0"
							draggable="true"
							onclick={() => handleSelectAsset(asset.id)}
							ondblclick={() => handleAddActiveToTimeline(asset.id)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') handleSelectAsset(asset.id);
							}}
							ondragstart={(e) => {
								e.dataTransfer?.setData('text/plain', asset.id);
								e.dataTransfer?.setData('application/x-rayshot-asset', JSON.stringify({ assetId: asset.id, type: asset.type }));
							}}
						>
							<!-- 16:9 Thumbnail Box -->
							<div class="thumb-container">
								<img
									src={thumbnailCache.get(asset.id) ?? placeholderThumbnail}
									alt={asset.filename}
									class="thumb-img"
									onerror={(e) => {
										(e.currentTarget as HTMLImageElement).src = placeholderThumbnail;
									}}
								/>

								<!-- Top Left Filename Tag -->
								<div class="filename-pill" title={asset.filename}>
									{asset.filename}
								</div>

								{#if !asset.sourceBlob}
									<div class="offline-badge" title="Media bytes not found in this browser">
										Offline
									</div>
								{/if}

								<!-- Selected Purple Checkmark Circle (Top Right) -->
								{#if isSelected}
									<div class="selected-checkmark-badge">
										<span class="material-symbols-outlined check-icon">check</span>
									</div>
								{/if}

								<!-- Bottom Right Duration Tag / Icon -->
								<div class="bottom-badges-row">
									{#if asset.type === 'image'}
										<div class="type-icon-badge">
											<span class="material-symbols-outlined">image</span>
										</div>
									{:else if asset.type === 'audio'}
										<div class="type-icon-badge">
											<span class="material-symbols-outlined">audio_file</span>
										</div>
										<div class="duration-badge font-mono">
											{formatDurationShort(asset.duration)}
										</div>
									{:else}
										<div class="duration-badge font-mono">
											{formatDurationShort(asset.duration)}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Right Sidebar: Inspector (DaVinci Resolve-style — collapsible label/value sections, not a metadata grid) -->
	{#if inspectorVisible}
	<aside class="inspector-panel">
		<div class="sidebar-header">
			<h2 class="sidebar-title">Inspector</h2>
		</div>

		{#if activeAsset}
			<div class="sidebar-body">
				<!-- Large 16:9 Preview -->
				<div class="preview-box">
					<img
						src={thumbnailCache.get(activeAsset.id) ?? placeholderThumbnail}
						alt={activeAsset.filename}
						class="preview-img"
					/>
				</div>

				<!-- Asset Name & Added Subtitle -->
				<div class="asset-heading-group">
					<h3 class="active-filename" title={activeAsset.filename}>
						{activeAsset.filename}
					</h3>
					<span class="added-time-label">{formatAddedDate(activeAsset.createdAt)}</span>
				</div>

				<!-- File — every asset has this. Only fields the app actually knows;
				     no invented codec/color-space claims about a file it never probed. -->
				<Collapsible.Root bind:open={fileSectionOpen} class="inspector-section">
					<Collapsible.Trigger class="inspector-section-trigger">
						<span class="material-symbols-outlined chev" class:open={fileSectionOpen}>chevron_right</span>
						<span>File</span>
					</Collapsible.Trigger>
					<Collapsible.Content class="inspector-section-content">
						<div class="spec-row">
							<span class="spec-label">Name</span>
							<span class="spec-value" title={activeAsset.filename}>{activeAsset.filename}</span>
						</div>
						<div class="spec-row">
							<span class="spec-label">Format</span>
							<span class="spec-value">{activeAsset.mimeType || '—'}</span>
						</div>
						<div class="spec-row">
							<span class="spec-label">Duration</span>
							<span class="spec-value font-mono">{formatTimecode(activeAsset.duration)}</span>
						</div>
						<div class="spec-row">
							<span class="spec-label">File Size</span>
							<span class="spec-value">
								{activeAsset.sourceBlob ? `${Math.round(activeAsset.sourceBlob.size / 1024 / 1024)} MB` : '—'}
							</span>
						</div>
					</Collapsible.Content>
				</Collapsible.Root>

				<!-- Video — only when there's real width/height/frame-rate to show. -->
				{#if activeAsset.type === 'video' || activeAsset.type === 'image'}
					<Collapsible.Root bind:open={videoSectionOpen} class="inspector-section">
						<Collapsible.Trigger class="inspector-section-trigger">
							<span class="material-symbols-outlined chev" class:open={videoSectionOpen}>chevron_right</span>
							<span>Video</span>
						</Collapsible.Trigger>
						<Collapsible.Content class="inspector-section-content">
							<div class="spec-row">
								<span class="spec-label">Resolution</span>
								<span class="spec-value">
									{activeAsset.width && activeAsset.height ? `${activeAsset.width} x ${activeAsset.height}` : '—'}
								</span>
							</div>
							{#if activeAsset.type === 'video'}
								<div class="spec-row">
									<span class="spec-label">Frame Rate</span>
									<span class="spec-value">{activeAsset.frameRate ? `${activeAsset.frameRate} fps` : '—'}</span>
								</div>
							{/if}
						</Collapsible.Content>
					</Collapsible.Root>
				{/if}

				<!-- Spacer -->
				<div class="flex-1"></div>

				<!-- Sticky Bottom Add to Timeline Button -->
				<button
					type="button"
					class="btn-add-timeline"
					onclick={() => handleAddActiveToTimeline(activeAsset.id)}
				>
					<span class="material-symbols-outlined">playlist_add</span>
					<span>Add to Timeline</span>
				</button>
			</div>
		{:else}
			<div class="empty-selection">
				<span class="material-symbols-outlined text-4xl text-outline mb-2">folder_open</span>
				<span class="text-xs text-on-surface-variant">Select an asset to view details</span>
			</div>
		{/if}
	</aside>
	{/if}
</div>

<style>
	.media-library-container {
		display: flex;
		width: 100%;
		height: 100%;
		background: var(--ms-void);
		color: var(--ms-text);
		font-family: var(--ms-font);
		overflow: hidden;
		user-select: none;
	}

	/* Main Left Panel */
	.library-main-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		border-right: 1px solid var(--ms-edge);
	}

	.library-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		border-bottom: 1px solid var(--ms-edge);
		gap: 16px;
	}

	.library-title {
		font-size: 1.1rem;
		font-weight: 590;
		color: var(--ms-text);
		letter-spacing: -0.01em;
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
	}

	.search-box {
		display: flex;
		align-items: center;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius);
		padding: 4px 10px;
		gap: 6px;
		width: 220px;
		transition: border-color var(--ms-fast) var(--ms-ease);
	}

	.search-box:focus-within {
		border-color: var(--ms-edge-strong);
	}

	.search-icon {
		font-size: 16px;
		color: var(--ms-text-tertiary);
	}

	.search-input {
		background: transparent;
		border: none;
		outline: none;
		color: var(--ms-text);
		font-family: inherit;
		font-size: 0.8rem;
		width: 100%;
	}

	.search-input::placeholder {
		color: var(--ms-text-tertiary);
	}

	.clear-btn {
		background: transparent;
		border: none;
		color: var(--ms-text-tertiary);
		cursor: pointer;
		font-size: 12px;
	}

	/* Scroll Body */
	.library-scroll-body {
		flex: 1;
		overflow-y: auto;
		padding: 20px 24px;
	}

	.section-block {
		margin-bottom: 24px;
	}

	.section-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.section-label {
		font-size: 0.7rem;
		font-weight: 590;
		color: var(--ms-text-tertiary);
		letter-spacing: 0.08em;
	}

	.view-all-link {
		background: transparent;
		border: none;
		color: var(--ms-text-secondary);
		font-size: 0.75rem;
		cursor: pointer;
		font-weight: 590;
	}

	.view-all-link:hover {
		color: var(--ms-text);
	}

	.asset-count-badge {
		font-size: 0.75rem;
		color: var(--ms-text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	/* Folders Grid */
	.folders-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.folder-card {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius);
		padding: 9px 16px;
		min-width: 170px;
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			border-color var(--ms-fast) var(--ms-ease);
		text-align: left;
	}

	.folder-card:hover {
		background: var(--ms-hover);
		border-color: var(--ms-edge-strong);
	}

	.folder-card.active {
		background: var(--ms-selected);
		border-color: var(--ms-edge-strong);
		box-shadow: inset 0 1px 0 var(--ms-edge-lit);
	}

	.folder-icon {
		font-size: 18px;
		color: var(--ms-text-secondary);
	}

	.folder-title {
		font-size: 0.85rem;
		font-weight: 590;
		color: var(--ms-text);
	}

	.folder-count {
		margin-left: auto;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--ms-text-tertiary);
	}

	/* Media Cards 4-Col Grid */
	.media-cards-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}

	@media (max-width: 1200px) {
		.media-cards-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 900px) {
		.media-cards-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.media-card {
		position: relative;
		border-radius: var(--ms-radius);
		overflow: hidden;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		cursor: pointer;
		transition:
			border-color var(--ms-fast) var(--ms-ease),
			transform var(--ms-fast) var(--ms-ease);
		aspect-ratio: 16 / 9;
	}

	.media-card:hover {
		border-color: var(--ms-edge-strong);
		transform: translateY(-1px);
	}

	.media-card.selected {
		border-color: var(--ms-text);
		box-shadow: 0 0 0 1px var(--ms-text);
	}

	.thumb-container {
		width: 100%;
		height: 100%;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ms-void);
	}

	.thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.filename-pill {
		position: absolute;
		top: 8px;
		left: 8px;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		color: var(--ms-text);
		font-size: 0.72rem;
		font-weight: 590;
		padding: 2px 8px;
		border-radius: 4px;
		max-width: 80%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border: 1px solid var(--ms-edge);
	}

	.offline-badge {
		position: absolute;
		bottom: 8px;
		left: 8px;
		padding: 1px 7px;
		border: 1px dashed var(--ms-edge-strong);
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		font-size: 0.65rem;
		font-weight: 590;
		letter-spacing: 0.02em;
		color: var(--ms-text-tertiary);
	}

	.selected-checkmark-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--ms-text);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
	}

	.check-icon {
		font-size: 14px;
		color: var(--ms-void);
		font-weight: 700;
	}

	.bottom-badges-row {
		position: absolute;
		bottom: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.duration-badge {
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		color: var(--ms-text);
		font-size: 0.7rem;
		font-weight: 590;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--ms-edge);
	}

	.type-icon-badge {
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		color: var(--ms-text-secondary);
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 5px;
		border-radius: 4px;
	}

	/* Right Sidebar: Inspector */
	.inspector-panel {
		width: 320px;
		background: var(--ms-void);
		display: flex;
		flex-direction: column;
		height: 100%;
		flex-shrink: 0;
	}

	.sidebar-header {
		padding: 16px 20px;
		border-bottom: 1px solid var(--ms-edge);
	}

	.sidebar-title {
		font-size: 0.9rem;
		font-weight: 590;
		color: var(--ms-text);
		margin: 0;
	}

	.sidebar-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 16px;
		overflow-y: auto;
	}

	.preview-box {
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: var(--ms-radius);
		overflow: hidden;
		background: var(--ms-void);
		border: 1px solid var(--ms-edge);
	}

	.preview-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.asset-heading-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.active-filename {
		font-size: 0.9rem;
		font-weight: 590;
		color: var(--ms-text);
		margin: 0;
		word-break: break-all;
	}

	.added-time-label {
		font-size: 0.75rem;
		color: var(--ms-text-tertiary);
	}

	/* Inspector sections — DaVinci Resolve convention: collapsible blocks of
	   label-left/value-right rows, not a metadata grid. */
	:global(.inspector-section) {
		border-top: 1px solid var(--ms-edge);
		padding-top: 4px;
	}

	:global(.inspector-section-trigger) {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		height: 26px;
		padding: 0 2px;
		border: none;
		background: transparent;
		color: var(--ms-text-secondary);
		font-family: inherit;
		font-size: 11px;
		font-weight: 590;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color var(--ms-fast) var(--ms-ease);
	}

	:global(.inspector-section-trigger:hover) {
		color: var(--ms-text);
	}

	.chev {
		font-size: 15px;
		transition: transform var(--ms-base) var(--ms-ease);
	}

	.chev.open {
		transform: rotate(90deg);
	}

	.spec-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		height: var(--ms-row-h);
		border-bottom: 1px solid var(--ms-edge);
	}

	.spec-row:last-child {
		border-bottom: none;
	}

	.spec-label {
		flex-shrink: 0;
		font-size: 0.72rem;
		color: var(--ms-text-tertiary);
	}

	.spec-value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: right;
		font-size: 0.78rem;
		color: var(--ms-text-secondary);
	}

	.btn-add-timeline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: var(--ms-text);
		color: var(--ms-void);
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 590;
		padding: 11px 16px;
		border-radius: var(--ms-radius);
		border: none;
		cursor: pointer;
		transition: background var(--ms-fast) var(--ms-ease);
		margin-top: auto;
	}

	.btn-add-timeline:hover {
		background: rgba(255, 255, 255, 0.88);
	}

	.empty-selection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 24px;
		text-align: center;
	}
</style>
