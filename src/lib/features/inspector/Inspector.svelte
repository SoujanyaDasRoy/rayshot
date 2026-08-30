<script lang="ts">
	import { timelineStore, timelineActions } from '$lib/stores/timeline.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { SplitClipCommand } from '$lib/core/commands/splitClip';
	import { TrimClipCommand } from '$lib/core/commands/trimClip';
	import { DeleteClipCommand } from '$lib/core/commands/deleteClip';
	import { SetClipVolumeCommand } from '$lib/core/commands/setClipVolume';
	import { SetClipPlaybackRateCommand } from '$lib/core/commands/setClipPlaybackRate';
	import { SetClipFilterCommand } from '$lib/core/commands/setClipFilter';
	import ColorGradePanel from '$lib/features/colorgrade/ColorGradePanel.svelte';
	import { derived } from 'svelte/store';
	import type { Clip, MediaAsset, Project } from '$lib/types/project';

	const selectedClipData = derived(
		[timelineStore, projectStore],
		([$timeline, $project]) => {
			if (!$project || !$timeline.selectedClipId) return null;
			const clip = $project.clips.get($timeline.selectedClipId);
			if (!clip) return null;
			const asset = $project.assets.get(clip.mediaAssetId);
			return { clip, asset };
		}
	);

	const clipType = derived(
		[selectedClipData],
		([$selectedClipData]): 'video' | 'audio' | 'image' | 'text' | 'none' => {
			if (!$selectedClipData) return 'none';
			const { clip, asset } = $selectedClipData;
			if (
				(asset?.type as string) === 'text' ||
				(clip as any).text !== undefined ||
				(clip.filters && clip.filters.text !== undefined) ||
				asset?.filename?.toLowerCase().includes('text') ||
				clip.id.startsWith('text')
			) {
				return 'text';
			}
			if (asset?.type === 'audio') {
				return 'audio';
			}
			if (asset?.type === 'image') {
				return 'image';
			}
			return 'video';
		}
	);

	// Collapsible Accordion States (Progressive Disclosure)
	let transformOpen = $state(true);
	let opacityOpen = $state(true);
	let colorOpen = $state(true);
	let audioFadesOpen = $state(true);
	let textTypographyOpen = $state(true);
	let textColorsOpen = $state(true);

	// Mutation helper
	function updateClip(clipId: string, updater: (clip: Clip) => Clip) {
		projectStore.update((project) => {
			if (!project) return null;
			const clip = project.clips.get(clipId);
			if (!clip) return project;
			const updatedClips = new Map(project.clips);
			const newClip = updater({ ...clip });
			updatedClips.set(clipId, newClip);
			return {
				...project,
				clips: updatedClips,
				modifiedAt: Date.now()
			};
		});
	}

	function handleSplit() {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		const playhead = $playbackStore.currentTime;
		const splitCmd = new SplitClipCommand({
			clipId,
			splitTime: playhead
		});
		commandProcessor.execute(splitCmd);
	}

	function handleTrimStart() {
		const clipData = $selectedClipData;
		if (!clipData) return;
		const { clip } = clipData;
		const playhead = $playbackStore.currentTime;
		const offset = playhead - clip.timelineStart;
		const newSourceIn = clip.sourceIn + offset;

		const trimCmd = new TrimClipCommand({
			clipId: clip.id,
			side: 'start',
			newSourceTime: newSourceIn
		});
		commandProcessor.execute(trimCmd);
	}

	function handleTrimEnd() {
		const clipData = $selectedClipData;
		if (!clipData) return;
		const { clip } = clipData;
		const playhead = $playbackStore.currentTime;
		const offset = playhead - clip.timelineStart;
		const newSourceOut = clip.sourceIn + offset;

		const trimCmd = new TrimClipCommand({
			clipId: clip.id,
			side: 'end',
			newSourceTime: newSourceOut
		});
		commandProcessor.execute(trimCmd);
	}

	function handleSourceInInput(val: number) {
		const clipData = $selectedClipData;
		if (!clipData) return;
		const { clip } = clipData;
		const newIn = Math.max(0, Math.min(val, clip.sourceOut - 0.05));
		const trimCmd = new TrimClipCommand({
			clipId: clip.id,
			side: 'start',
			newSourceTime: newIn
		});
		commandProcessor.execute(trimCmd);
	}

	function handleSourceOutInput(val: number) {
		const clipData = $selectedClipData;
		if (!clipData) return;
		const { clip, asset } = clipData;
		const maxDur = asset?.duration ?? 999999;
		const newOut = Math.max(clip.sourceIn + 0.05, Math.min(val, maxDur));
		const trimCmd = new TrimClipCommand({
			clipId: clip.id,
			side: 'end',
			newSourceTime: newOut
		});
		commandProcessor.execute(trimCmd);
	}

	function handleDelete() {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		const deleteCmd = new DeleteClipCommand({ clipId });
		commandProcessor.execute(deleteCmd);
		timelineActions.selectClip(null);
	}

	function handleVolumeChange(val: number) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		const setVolCmd = new SetClipVolumeCommand({
			clipId,
			volume: val
		});
		commandProcessor.execute(setVolCmd);
	}

	function handleRateChange(val: number) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		const setRateCmd = new SetClipPlaybackRateCommand({
			clipId,
			playbackRate: val
		});
		commandProcessor.execute(setRateCmd);
	}

	function handleFilterChange(filterName: string, val: unknown) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		const setFilterCmd = new SetClipFilterCommand({
			clipId,
			filterName,
			value: val
		});
		commandProcessor.execute(setFilterCmd);
	}

	function handleTransformChange(prop: 'x' | 'y' | 'scale' | 'rotation', val: number) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		updateClip(clipId, (c) => ({
			...c,
			transform: {
				x: c.transform?.x ?? 0,
				y: c.transform?.y ?? 0,
				scale: c.transform?.scale ?? 1,
				rotation: c.transform?.rotation ?? 0,
				[prop]: val
			}
		}));
	}

	function handleResetTransform() {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		updateClip(clipId, (c) => ({
			...c,
			transform: {
				x: 0,
				y: 0,
				scale: 1,
				rotation: 0
			}
		}));
	}

	function handleResetAdjustments() {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		handleFilterChange('brightness', 0);
		handleFilterChange('contrast', 0);
		handleFilterChange('saturation', 0);
	}

	function handleMuteToggle() {
		const clipData = $selectedClipData;
		if (!clipData) return;
		const { clip } = clipData;
		const currentMute = clip.audioParameters?.mute ?? false;
		updateClip(clip.id, (c) => ({
			...c,
			audioParameters: {
				volume: c.audioParameters?.volume ?? 1,
				mute: !currentMute
			}
		}));
	}

	function handleTextChange(val: string) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		updateClip(clipId, (c) => {
			const filters = { ...(c.filters || {}), text: val };
			return {
				...c,
				text: val,
				filters
			} as any;
		});
	}

	function handleTypographyChange(prop: string, val: any) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		updateClip(clipId, (c) => {
			const filters = { ...(c.filters || {}), [prop]: val };
			return {
				...c,
				[prop]: val,
				filters
			} as any;
		});
	}
</script>

<aside class="inspector-sidebar" aria-label="Properties Inspector">
	<!-- Inspector Top Header Bar -->
	<div class="sidebar-top-title">
		<div class="header-left">
			<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
			</svg>
			<span>Inspector</span>
		</div>
		{#if $selectedClipData}
			<span class="active-badge {$clipType}">{$clipType.toUpperCase()}</span>
		{/if}
	</div>

	{#if $selectedClipData}
		{@const { clip, asset } = $selectedClipData}
		<!-- Selected Clip Subhead -->
		<div class="clip-subhead">
			<div class="clip-info-block">
				<span class="clip-type-pill {$clipType}">{$clipType}</span>
				<span class="clip-title-name" title={asset?.filename ?? (clip as any).text ?? 'Clip'}>
					{asset?.filename ?? (clip as any).text ?? 'Selected Clip'}
				</span>
			</div>
			<button class="deselect-btn" title="Deselect clip" onclick={() => timelineActions.selectClip(null)}>
				<svg class="icon-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>

		<div class="inspector-sections-scroll">
			<!-- ================================================================= -->
			<!-- 1. VIDEO / IMAGE CLIP INSPECTOR -->
			<!-- ================================================================= -->
			{#if $clipType === 'video' || $clipType === 'image'}
				<!-- Primary Quick Controls Box (Always Visible) -->
				<div class="primary-controls-card">
					<div class="card-header-label">Primary Actions</div>

					<!-- Quick Split at Playhead -->
					<button class="primary-action-btn split-btn" onclick={handleSplit}>
						<span class="btn-icon">✂</span>
						<span>Split at Playhead</span>
					</button>

					<!-- In / Out Trim Controls -->
					<div class="trim-inputs-row">
						<div class="trim-input-group">
							<div class="trim-label-row">
								<span class="sub-label">In (Head)</span>
								<button class="mini-trim-btn" title="Trim head to current playhead" onclick={handleTrimStart}>⇤</button>
							</div>
							<div class="num-input-wrap">
								<input
									type="number"
									step="0.1"
									min="0"
									value={clip.sourceIn.toFixed(2)}
									onchange={(e) => handleSourceInInput(parseFloat((e.target as HTMLInputElement).value))}
									class="font-mono"
								/>
								<span class="unit-tag">s</span>
							</div>
						</div>

						<div class="trim-input-group">
							<div class="trim-label-row">
								<span class="sub-label">Out (Tail)</span>
								<button class="mini-trim-btn" title="Trim tail to current playhead" onclick={handleTrimEnd}>⇥</button>
							</div>
							<div class="num-input-wrap">
								<input
									type="number"
									step="0.1"
									min="0"
									value={clip.sourceOut.toFixed(2)}
									onchange={(e) => handleSourceOutInput(parseFloat((e.target as HTMLInputElement).value))}
									class="font-mono"
								/>
								<span class="unit-tag">s</span>
							</div>
						</div>
					</div>

					<!-- Volume Slider (0 - 200%) if video -->
					{#if $clipType === 'video'}
						<div class="slider-field">
							<div class="slider-top-label">
								<span class="slider-title">Volume</span>
								<span class="slider-number font-mono">{Math.round((clip.audioParameters?.volume ?? 1) * 100)}%</span>
							</div>
							<input
								type="range"
								min="0"
								max="2"
								step="0.01"
								value={clip.audioParameters?.volume ?? 1}
								oninput={(e) => handleVolumeChange(parseFloat((e.target as HTMLInputElement).value))}
								class="accent-slider"
								aria-label="Volume"
							/>
						</div>
					{/if}

					<!-- Playback Speed Dropdown -->
					<div class="select-field-row">
						<span class="sub-label">Playback Speed</span>
						<div class="select-wrap">
							<select
								value={clip.playbackRate ?? 1}
								onchange={(e) => handleRateChange(parseFloat((e.target as HTMLSelectElement).value))}
								class="dropdown-select font-mono"
								aria-label="Playback Speed"
							>
								<option value={0.5}>0.5x (Slow)</option>
								<option value={1.0}>1.0x (Normal)</option>
								<option value={1.5}>1.5x (Fast)</option>
								<option value={2.0}>2.0x (Double)</option>
								{#if ![0.5, 1.0, 1.5, 2.0].includes(clip.playbackRate ?? 1)}
									<option value={clip.playbackRate}>{(clip.playbackRate ?? 1).toFixed(2)}x (Custom)</option>
								{/if}
							</select>
						</div>
					</div>
				</div>

				<!-- Collapsible Accordion: Transform -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (transformOpen = !transformOpen)}>
							<span class="chevron">{transformOpen ? '▾' : '▸'}</span>
							<span class="section-name">Transform</span>
						</button>
						<button
							class="section-reset-link"
							onclick={handleResetTransform}
							title="Reset Transform"
						>
							Reset
						</button>
					</div>

					{#if transformOpen}
						<div class="section-fields">
							<div class="field-row">
								<span class="field-label">Position</span>
								<div class="multi-num-inputs font-mono">
									<span class="dim-label">X:</span>
									<input
										type="number"
										step="1"
										value={clip.transform?.x ?? 0}
										oninput={(e) => handleTransformChange('x', parseFloat((e.target as HTMLInputElement).value) || 0)}
										aria-label="Position X"
									/>
									<span class="dim-label">Y:</span>
									<input
										type="number"
										step="1"
										value={clip.transform?.y ?? 0}
										oninput={(e) => handleTransformChange('y', parseFloat((e.target as HTMLInputElement).value) || 0)}
										aria-label="Position Y"
									/>
								</div>
							</div>

							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Scale</span>
									<span class="slider-number font-mono">{Math.round((clip.transform?.scale ?? 1) * 100)}%</span>
								</div>
								<div class="slider-with-input">
									<input
										type="range"
										min="0.1"
										max="3.0"
										step="0.05"
										value={clip.transform?.scale ?? 1}
										oninput={(e) => handleTransformChange('scale', parseFloat((e.target as HTMLInputElement).value) || 1)}
										class="accent-slider"
										aria-label="Scale Slider"
									/>
									<input
										type="number"
										step="0.05"
										min="0.1"
										max="5.0"
										value={clip.transform?.scale ?? 1}
										oninput={(e) => handleTransformChange('scale', parseFloat((e.target as HTMLInputElement).value) || 1)}
										class="mini-num-box font-mono"
										aria-label="Scale Input"
									/>
								</div>
							</div>

							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Rotation</span>
									<span class="slider-number font-mono">{clip.transform?.rotation ?? 0}°</span>
								</div>
								<div class="slider-with-input">
									<input
										type="range"
										min="-180"
										max="180"
										step="1"
										value={clip.transform?.rotation ?? 0}
										oninput={(e) => handleTransformChange('rotation', parseFloat((e.target as HTMLInputElement).value) || 0)}
										class="accent-slider"
										aria-label="Rotation Slider"
									/>
									<div class="num-with-unit font-mono">
										<input
											type="number"
											step="1"
											min="-180"
											max="180"
											value={clip.transform?.rotation ?? 0}
											oninput={(e) => handleTransformChange('rotation', parseFloat((e.target as HTMLInputElement).value) || 0)}
											aria-label="Rotation Input"
										/>
										<span class="deg-sym">°</span>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Collapsible Accordion: Opacity & Blend -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (opacityOpen = !opacityOpen)}>
							<span class="chevron">{opacityOpen ? '▾' : '▸'}</span>
							<span class="section-name">Opacity & Blend</span>
						</button>
					</div>

					{#if opacityOpen}
						<div class="section-fields">
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Opacity</span>
									<span class="slider-number font-mono">{clip.filters?.opacity ?? 100}%</span>
								</div>
								<input
									type="range"
									min="0"
									max="100"
									step="1"
									value={clip.filters?.opacity ?? 100}
									oninput={(e) => handleFilterChange('opacity', parseInt((e.target as HTMLInputElement).value))}
									class="accent-slider"
									aria-label="Opacity"
								/>
							</div>

							<div class="field-row">
								<span class="field-label">Blend Mode</span>
								<select
									value={clip.filters?.blendMode ?? 'normal'}
									onchange={(e) => handleFilterChange('blendMode', (e.target as HTMLSelectElement).value)}
									class="dropdown-select font-mono"
									aria-label="Blend Mode"
								>
									<option value="normal">Normal</option>
									<option value="multiply">Multiply</option>
									<option value="screen">Screen</option>
									<option value="overlay">Overlay</option>
									<option value="darken">Darken</option>
									<option value="lighten">Lighten</option>
								</select>
							</div>
						</div>
					{/if}
				</div>

				<!-- Collapsible Accordion: Color Grading -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (colorOpen = !colorOpen)}>
							<span class="chevron">{colorOpen ? '▾' : '▸'}</span>
							<span class="section-name">Color Grading</span>
						</button>
					</div>

					{#if colorOpen}
						<ColorGradePanel {clip} onChange={(colorGrade) => {
							// Update the clip's colorGrade in the store when it changes
							updateClip($selectedClipData.clip.id, (clip) => ({
								...clip,
								colorGrade
							}));
						}} />
					{/if}
				</div>
			{/if}

			<!-- ================================================================= -->
			<!-- 2. AUDIO CLIP INSPECTOR -->
			<!-- ================================================================= -->
			{#if $clipType === 'audio'}
				<div class="primary-controls-card">
					<div class="card-header-label">Audio Track Controls</div>

					<!-- Volume Slider (0-200%) -->
					<div class="slider-field">
						<div class="slider-top-label">
							<span class="slider-title">Volume</span>
							<span class="slider-number font-mono">{Math.round((clip.audioParameters?.volume ?? 1) * 100)}%</span>
						</div>
						<input
							type="range"
							min="0"
							max="2"
							step="0.01"
							value={clip.audioParameters?.volume ?? 1}
							oninput={(e) => handleVolumeChange(parseFloat((e.target as HTMLInputElement).value))}
							class="accent-slider"
							aria-label="Audio Volume"
						/>
					</div>

					<!-- Playback Speed -->
					<div class="select-field-row">
						<span class="sub-label">Playback Speed</span>
						<div class="select-wrap">
							<select
								value={clip.playbackRate ?? 1}
								onchange={(e) => handleRateChange(parseFloat((e.target as HTMLSelectElement).value))}
								class="dropdown-select font-mono"
								aria-label="Audio Playback Speed"
							>
								<option value={0.5}>0.5x (Slow)</option>
								<option value={1.0}>1.0x (Normal)</option>
								<option value={1.5}>1.5x (Fast)</option>
								<option value={2.0}>2.0x (Double)</option>
								{#if ![0.5, 1.0, 1.5, 2.0].includes(clip.playbackRate ?? 1)}
									<option value={clip.playbackRate}>{(clip.playbackRate ?? 1).toFixed(2)}x (Custom)</option>
								{/if}
							</select>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</aside>