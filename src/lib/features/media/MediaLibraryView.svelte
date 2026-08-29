<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { timelineStore } from '$lib/stores/timeline.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { AddClipCommand } from '$lib/core/commands/addClip';
	import { importMediaFiles, thumbnailCache, placeholderThumbnail } from '$lib/utils/mediaUtils';
	import { get } from 'svelte/store';
	import type { MediaAsset, Project } from '$lib/types/project';

	let fileInput = $state<HTMLInputElement | null>(null);
	let searchQuery = $state('');
	let activeFolder = $state<string>('all');
	let selectedAssetId = $state<string | null>(null);
	let newFolderModalOpen = $state(false);
	let newFolderName = $state('');
	let folders = $state<string[]>(['B-Roll', 'Interviews', 'Music']);
	let assetFolders = $state<Record<string, string>>({
		'sample-city-flyover': 'B-Roll',
		'sample-interview-a': 'Interviews',
		'sample-bg-plate': 'B-Roll',
		'sample-ambient-drone': 'Music'
	});

	// Default sample assets matching reference screenshot
	const sampleAssets: Array<MediaAsset & { resolutionStr?: string; frameRateStr?: string; codecStr?: string; colorSpaceStr?: string; fileSizeStr?: string }> = [
		{
			id: 'sample-city-flyover',
			filename: 'city_flyover_4k.mp4',
			type: 'video',
			duration: 15.0,
			width: 3840,
			height: 2160,
			frameRate: 23.976,
			mimeType: 'video/mp4',
			createdAt: Date.now() - 3600000 * 4,
			modifiedAt: Date.now() - 3600000 * 4,
			sourceBlob: new Blob([], { type: 'video/mp4' }),
			resolutionStr: '3840 x 2160',
			frameRateStr: '23.976 fps',
			codecStr: 'ProRes 422 HQ',
			colorSpaceStr: 'Rec.709',
			fileSizeStr: '142.5 MB'
		},
		{
			id: 'sample-interview-a',
			filename: 'interview_cam_A.mov',
			type: 'video',
			duration: 154.0,
			width: 1920,
			height: 1080,
			frameRate: 24,
			mimeType: 'video/quicktime',
			createdAt: Date.now() - 3600000 * 6,
			modifiedAt: Date.now() - 3600000 * 6,
			sourceBlob: new Blob([], { type: 'video/quicktime' }),
			resolutionStr: '1920 x 1080',
			frameRateStr: '24.000 fps',
			codecStr: 'ProRes 422',
			colorSpaceStr: 'Rec.709',
			fileSizeStr: '89.2 MB'
		},
		{
			id: 'sample-bg-plate',
			filename: 'bg_plate_01.png',
			type: 'image',
			duration: 5.0,
			width: 3840,
			height: 2160,
			mimeType: 'image/png',
			createdAt: Date.now() - 3600000 * 8,
			modifiedAt: Date.now() - 3600000 * 8,
			sourceBlob: new Blob([], { type: 'image/png' }),
			resolutionStr: '3840 x 2160',
			frameRateStr: 'Static (PNG)',
			codecStr: 'PNG Lossless',
			colorSpaceStr: 'sRGB IEC61966',
			fileSizeStr: '12.4 MB'
		},
		{
			id: 'sample-ambient-drone',
			filename: 'ambient_drone_v2.wav',
			type: 'audio',
			duration: 105.0,
			mimeType: 'audio/wav',
			createdAt: Date.now() - 3600000 * 12,
			modifiedAt: Date.now() - 3600000 * 12,
			sourceBlob: new Blob([], { type: 'audio/wav' }),
			resolutionStr: 'Stereo 48.0 kHz',
			frameRateStr: '24-bit PCM',
			codecStr: 'Broadcast WAV',
			colorSpaceStr: 'N/A (Audio)',
			fileSizeStr: '34.8 MB'
		}
	];

	// Generate high-fidelity canvas thumbnails for sample assets
	function generateSampleThumbnails() {
		if (typeof document === 'undefined') return;

		// 1. City Flyover Neon Night
		if (!thumbnailCache.has('sample-city-flyover')) {
			const c1 = document.createElement('canvas');
			c1.width = 320;
			c1.height = 180;
			const ctx1 = c1.getContext('2d');
			if (ctx1) {
				const grad = ctx1.createLinearGradient(0, 0, 320, 180);
				grad.addColorStop(0, '#061325');
				grad.addColorStop(0.5, '#0d223a');
				grad.addColorStop(1, '#020b14');
				ctx1.fillStyle = grad;
				ctx1.fillRect(0, 0, 320, 180);

				// Neon Grid & buildings
				ctx1.strokeStyle = 'rgba(56, 189, 248, 0.25)';
				ctx1.lineWidth = 1;
				for (let x = 0; x < 320; x += 20) {
					ctx1.beginPath();
					ctx1.moveTo(x, 100);
					ctx1.lineTo(x * 1.3 - 40, 180);
					ctx1.stroke();
				}
				for (let y = 100; y < 180; y += 12) {
					ctx1.beginPath();
					ctx1.moveTo(0, y);
					ctx1.lineTo(320, y);
					ctx1.stroke();
				}

				// Skyscrapers with neon windows
				ctx1.fillStyle = '#0b1626';
				ctx1.fillRect(30, 40, 45, 100);
				ctx1.fillRect(90, 20, 55, 120);
				ctx1.fillRect(160, 50, 50, 90);
				ctx1.fillRect(225, 30, 60, 110);

				// Neon glow lights
				ctx1.fillStyle = '#38bdf8';
				for (let bx = 35; bx < 280; bx += 14) {
					for (let by = 35; by < 130; by += 12) {
						if (Math.sin(bx * by) > 0.2) {
							ctx1.fillStyle = (bx + by) % 3 === 0 ? '#d0bcff' : '#38bdf8';
							ctx1.fillRect(bx, by, 3, 3);
						}
					}
				}
				thumbnailCache.set('sample-city-flyover', c1.toDataURL('image/jpeg', 0.85));
			}
		}

		// 2. Interview Woman in Suit
		if (!thumbnailCache.has('sample-interview-a')) {
			const c2 = document.createElement('canvas');
			c2.width = 320;
			c2.height = 180;
			const ctx2 = c2.getContext('2d');
			if (ctx2) {
				const grad = ctx2.createRadialGradient(160, 90, 30, 160, 90, 180);
				grad.addColorStop(0, '#1c1b22');
				grad.addColorStop(1, '#0b0a0e');
				ctx2.fillStyle = grad;
				ctx2.fillRect(0, 0, 320, 180);

				// Studio warm rim light
				ctx2.fillStyle = '#18171d';
				ctx2.beginPath();
				ctx2.arc(160, 75, 36, 0, Math.PI * 2);
				ctx2.fill();

				// Silhouette shoulders
				ctx2.fillStyle = '#111014';
				ctx2.beginPath();
				ctx2.ellipse(160, 165, 80, 55, 0, 0, Math.PI * 2);
				ctx2.fill();

				// Soft key light accent
				ctx2.strokeStyle = 'rgba(208, 188, 255, 0.4)';
				ctx2.lineWidth = 2;
				ctx2.beginPath();
				ctx2.arc(160, 75, 38, -Math.PI * 0.4, Math.PI * 0.1);
				ctx2.stroke();

				thumbnailCache.set('sample-interview-a', c2.toDataURL('image/jpeg', 0.85));
			}
		}

		// 3. BG Plate Tunnel Wireframe
		if (!thumbnailCache.has('sample-bg-plate')) {
			const c3 = document.createElement('canvas');
			c3.width = 320;
			c3.height = 180;
			const ctx3 = c3.getContext('2d');
			if (ctx3) {
				ctx3.fillStyle = '#070b14';
				ctx3.fillRect(0, 0, 320, 180);

				ctx3.strokeStyle = '#06b6d4';
				ctx3.lineWidth = 1.5;
				for (let r = 10; r < 140; r += 16) {
					ctx3.beginPath();
					ctx3.arc(160, 90, r, 0, Math.PI * 2);
					ctx3.stroke();
				}
				for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
					ctx3.beginPath();
					ctx3.moveTo(160, 90);
					ctx3.lineTo(160 + Math.cos(a) * 160, 90 + Math.sin(a) * 160);
					ctx3.stroke();
				}
				thumbnailCache.set('sample-bg-plate', c3.toDataURL('image/jpeg', 0.85));
			}
		}

		// 4. Ambient Drone Audio Waveform
		if (!thumbnailCache.has('sample-ambient-drone')) {
			const c4 = document.createElement('canvas');
			c4.width = 320;
			c4.height = 180;
			const ctx4 = c4.getContext('2d');
			if (ctx4) {
				ctx4.fillStyle = '#0d1017';
				ctx4.fillRect(0, 0, 320, 180);

				ctx4.fillStyle = '#06b6d4';
				const bars = 18;
				const barWidth = 6;
				const gap = 6;
				const startX = (320 - (bars * (barWidth + gap))) / 2;

				for (let i = 0; i < bars; i++) {
					const progress = i / bars;
					const height = 20 + Math.sin(progress * Math.PI) * 70 + (i % 3 === 0 ? 15 : -10);
					const x = startX + i * (barWidth + gap);
					const y = 90 - height / 2;
					ctx4.beginPath();
					ctx4.roundRect(x, y, barWidth, height, 3);
					ctx4.fill();
				}
				thumbnailCache.set('sample-ambient-drone', c4.toDataURL('image/jpeg', 0.85));
			}
		}
	}

	onMount(() => {
		generateSampleThumbnails();

		// Inject sample assets into projectStore if project has no assets
		projectStore.update((proj) => {
			if (!proj) return proj;
			const assetsMap = new Map(proj.assets);
			let updated = false;
			for (const s of sampleAssets) {
				if (!assetsMap.has(s.id)) {
					assetsMap.set(s.id, s);
					updated = true;
				}
			}
			if (updated) {
				return { ...proj, assets: assetsMap, modifiedAt: Date.now() };
			}
			return proj;
		});

		// Default select first asset
		selectedAssetId = 'sample-city-flyover';
	});

	// Get all assets combined (user uploaded + sample assets)
	const allAssets = $derived.by(() => {
		const proj = $projectStore;
		if (!proj) return sampleAssets;
		const list: MediaAsset[] = [];
		proj.assets.forEach((val) => list.push(val));
		return list.length > 0 ? list : sampleAssets;
	});

	// Filter assets by search query and active folder
	const filteredAssets = $derived.by(() => {
		let list = allAssets;

		if (activeFolder !== 'all') {
			list = list.filter((a) => assetFolders[a.id] === activeFolder);
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

	async function handleFileImport(e: Event) {
		const input = fileInput;
		if (!input || !input.files || input.files.length === 0) return;
		await importMediaFiles(Array.from(input.files), false);
		input.value = '';
	}

	function createFolder() {
		if (!newFolderName.trim()) return;
		const name = newFolderName.trim();
		if (!folders.includes(name)) {
			folders = [...folders, name];
		}
		activeFolder = name;
		newFolderName = '';
		newFolderModalOpen = false;
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
</script>

<div class="media-library-container">
	<!-- Left Main Content Area: Folders + Media Grid -->
	<div class="library-main-panel">
		<!-- Top Bar: Title, Search, New Folder, Import -->
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

				<!-- New Folder Button -->
				<button
					type="button"
					class="btn-new-folder"
					onclick={() => (newFolderModalOpen = true)}
				>
					<span class="material-symbols-outlined btn-icon">create_new_folder</span>
					<span>New Folder</span>
				</button>

				<!-- Import Button -->
				<button
					type="button"
					class="btn-import"
					onclick={() => fileInput?.click()}
				>
					<span class="material-symbols-outlined btn-icon">upload</span>
					<span>Import</span>
				</button>
			</div>
		</div>

		<!-- Scrollable Body: FOLDERS & ALL MEDIA -->
		<div class="library-scroll-body">
			<!-- FOLDERS Section -->
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
					{#each folders as folderName (folderName)}
						<button
							type="button"
							class="folder-card"
							class:active={activeFolder === folderName}
							onclick={() => (activeFolder = activeFolder === folderName ? 'all' : folderName)}
						>
							<div class="folder-icon-box">
								<span class="material-symbols-outlined folder-icon">folder</span>
							</div>
							<span class="folder-title">{folderName}</span>
						</button>
					{/each}
				</div>
			</div>

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
										<div class="type-icon-badge audio-color">
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

	<!-- Right Sidebar: Asset Details Panel -->
	<aside class="asset-details-sidebar">
		<div class="sidebar-header">
			<h2 class="sidebar-title">Asset Details</h2>
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
					<span class="added-time-label">Added Today at 10:42 AM</span>
				</div>

				<!-- 2-Column Metadata Spec Grid -->
				<div class="metadata-spec-grid">
					<div class="spec-cell">
						<span class="spec-label">Resolution</span>
						<span class="spec-value">
							{(activeAsset as any).resolutionStr || (activeAsset.width ? `${activeAsset.width} x ${activeAsset.height}` : activeAsset.type === 'audio' ? 'Stereo 48kHz' : '1920 x 1080')}
						</span>
					</div>
					<div class="spec-cell">
						<span class="spec-label">Frame Rate</span>
						<span class="spec-value">
							{(activeAsset as any).frameRateStr || (activeAsset.frameRate ? `${activeAsset.frameRate} fps` : activeAsset.type === 'audio' ? 'N/A' : '30.000 fps')}
						</span>
					</div>
					<div class="spec-cell">
						<span class="spec-label">Duration</span>
						<span class="spec-value font-mono">
							{formatTimecode(activeAsset.duration)}
						</span>
					</div>
					<div class="spec-cell">
						<span class="spec-label">File Size</span>
						<span class="spec-value">
							{(activeAsset as any).fileSizeStr || (activeAsset.sourceBlob ? `${Math.round(activeAsset.sourceBlob.size / 1024 / 1024)} MB` : '142.5 MB')}
						</span>
					</div>
					<div class="spec-cell">
						<span class="spec-label">Codec</span>
						<span class="spec-value">
							{(activeAsset as any).codecStr || (activeAsset.mimeType || 'ProRes 422 HQ')}
						</span>
					</div>
					<div class="spec-cell">
						<span class="spec-label">Color Space</span>
						<span class="spec-value">
							{(activeAsset as any).colorSpaceStr || 'Rec.709'}
						</span>
					</div>
				</div>

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

	<!-- New Folder Modal Dialog -->
	{#if newFolderModalOpen}
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={() => (newFolderModalOpen = false)}
			onkeydown={(e) => {
				if (e.key === 'Escape') newFolderModalOpen = false;
			}}
		>
			<div
				class="modal-card"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<h3 class="modal-title">Create New Folder</h3>
				<input
					type="text"
					placeholder="Folder name (e.g. B-Roll, Sound FX)"
					bind:value={newFolderName}
					class="modal-input"
					onkeydown={(e) => {
						if (e.key === 'Enter') createFolder();
						if (e.key === 'Escape') newFolderModalOpen = false;
					}}
				/>
				<div class="modal-actions">
					<button type="button" class="btn-cancel" onclick={() => (newFolderModalOpen = false)}>
						Cancel
					</button>
					<button type="button" class="btn-confirm" onclick={createFolder}>
						Create
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Hidden File Input -->
	<input
		type="file"
		bind:this={fileInput}
		onchange={handleFileImport}
		multiple
		accept="video/*,audio/*,image/*"
		style="display: none;"
	/>
</div>

<style>
	.media-library-container {
		display: flex;
		width: 100%;
		height: 100%;
		background: #0f1015;
		color: #f1f5f9;
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
		border-right: 1px solid #1f2230;
	}

	.library-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		border-bottom: 1px solid #1b1d28;
		background: #12131a;
		gap: 16px;
	}

	.library-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: #ffffff;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.search-box {
		display: flex;
		align-items: center;
		background: #1a1c26;
		border: 1px solid #282c3c;
		border-radius: 6px;
		padding: 4px 10px;
		gap: 6px;
		width: 220px;
	}

	.search-icon {
		font-size: 16px;
		color: #64748b;
	}

	.search-input {
		background: transparent;
		border: none;
		outline: none;
		color: #f1f5f9;
		font-size: 0.8rem;
		width: 100%;
	}

	.search-input::placeholder {
		color: #64748b;
	}

	.clear-btn {
		background: transparent;
		border: none;
		color: #64748b;
		cursor: pointer;
		font-size: 12px;
	}

	.btn-new-folder {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #1a1c26;
		border: 1px solid #282c3c;
		border-radius: 6px;
		color: #cbd5e1;
		font-size: 0.8rem;
		font-weight: 500;
		padding: 6px 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-new-folder:hover {
		background: #232736;
		color: #ffffff;
		border-color: #3b4258;
	}

	.btn-import {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #8b5cf6;
		border: none;
		border-radius: 6px;
		color: #ffffff;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 6px 16px;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
	}

	.btn-import:hover {
		background: #9d71fd;
		transform: translateY(-1px);
	}

	.btn-icon {
		font-size: 16px;
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
		font-weight: 700;
		color: #64748b;
		letter-spacing: 0.08em;
	}

	.view-all-link {
		background: transparent;
		border: none;
		color: #8b5cf6;
		font-size: 0.75rem;
		cursor: pointer;
		font-weight: 600;
	}

	.asset-count-badge {
		font-size: 0.75rem;
		color: #64748b;
	}

	/* Folders Grid */
	.folders-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	.folder-card {
		display: flex;
		align-items: center;
		gap: 10px;
		background: #14161f;
		border: 1px solid #202432;
		border-radius: 8px;
		padding: 10px 18px;
		min-width: 170px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.folder-card:hover {
		background: #1a1e2b;
		border-color: #32384e;
	}

	.folder-card.active {
		background: #1d1b30;
		border-color: #8b5cf6;
		box-shadow: 0 0 0 1px #8b5cf6;
	}

	.folder-icon {
		font-size: 20px;
		color: #38bdf8; /* Cyan folder icon matching screenshot */
	}

	.folder-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: #f1f5f9;
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
		border-radius: 8px;
		overflow: hidden;
		background: #141620;
		border: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		aspect-ratio: 16 / 9;
	}

	.media-card:hover {
		border-color: #383f58;
		transform: translateY(-2px);
	}

	.media-card.selected {
		border-color: #8b5cf6;
		box-shadow: 0 0 0 1px #8b5cf6, 0 4px 16px rgba(139, 92, 246, 0.25);
	}

	.thumb-container {
		width: 100%;
		height: 100%;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0b0c10;
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
		color: #f8fafc;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		max-width: 80%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.selected-checkmark-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #8b5cf6;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
	}

	.check-icon {
		font-size: 14px;
		color: #ffffff;
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
		color: #f1f5f9;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.type-icon-badge {
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		color: #94a3b8;
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 5px;
		border-radius: 4px;
	}

	.type-icon-badge.audio-color {
		color: #06b6d4;
	}

	/* Right Sidebar: Asset Details */
	.asset-details-sidebar {
		width: 320px;
		background: #111218;
		display: flex;
		flex-direction: column;
		height: 100%;
		flex-shrink: 0;
	}

	.sidebar-header {
		padding: 16px 20px;
		border-bottom: 1px solid #1b1d28;
	}

	.sidebar-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: #f1f5f9;
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
		border-radius: 8px;
		overflow: hidden;
		background: #000000;
		border: 1px solid #232738;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
		font-size: 0.95rem;
		font-weight: 700;
		color: #ffffff;
		margin: 0;
		word-break: break-all;
	}

	.added-time-label {
		font-size: 0.75rem;
		color: #64748b;
	}

	.metadata-spec-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px 12px;
		background: #151722;
		border: 1px solid #202434;
		border-radius: 8px;
		padding: 14px 16px;
	}

	.spec-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.spec-label {
		font-size: 0.68rem;
		color: #64748b;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.spec-value {
		font-size: 0.78rem;
		color: #e2e8f0;
		font-weight: 500;
	}

	.btn-add-timeline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: #8b5cf6;
		color: #ffffff;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 12px 16px;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35);
		margin-top: auto;
	}

	.btn-add-timeline:hover {
		background: #9d71fd;
		transform: translateY(-1px);
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

	/* Modal */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-card {
		background: #181a24;
		border: 1px solid #2c3144;
		border-radius: 10px;
		padding: 24px;
		width: 360px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 700;
		color: #ffffff;
		margin: 0 0 16px 0;
	}

	.modal-input {
		width: 100%;
		background: #10121a;
		border: 1px solid #2c3144;
		border-radius: 6px;
		padding: 10px 12px;
		color: #f1f5f9;
		font-size: 0.85rem;
		margin-bottom: 18px;
		outline: none;
		box-sizing: border-box;
	}

	.modal-input:focus {
		border-color: #8b5cf6;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid #2c3144;
		color: #94a3b8;
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.btn-confirm {
		background: #8b5cf6;
		border: none;
		color: #ffffff;
		font-weight: 600;
		border-radius: 6px;
		padding: 6px 16px;
		font-size: 0.8rem;
		cursor: pointer;
	}
</style>
