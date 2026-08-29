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
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
				✕
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

				<!-- Collapsible Accordion: Color & Adjustments -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (colorOpen = !colorOpen)}>
							<span class="chevron">{colorOpen ? '▾' : '▸'}</span>
							<span class="section-name">Color & Adjustments</span>
						</button>
						<button
							class="section-reset-link"
							onclick={handleResetAdjustments}
							title="Reset Adjustments"
						>
							Reset
						</button>
					</div>

					{#if colorOpen}
						<div class="section-fields">
							<!-- Brightness -->
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Brightness</span>
									<span class="slider-number font-mono">
										{(clip.filters?.brightness ?? 0) > 0 ? '+' : ''}{clip.filters?.brightness ?? 0}%
									</span>
								</div>
								<input
									type="range"
									min="-100"
									max="100"
									step="1"
									value={clip.filters?.brightness ?? 0}
									oninput={(e) => handleFilterChange('brightness', parseInt((e.target as HTMLInputElement).value))}
									class="accent-slider"
									aria-label="Brightness"
								/>
							</div>

							<!-- Contrast -->
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Contrast</span>
									<span class="slider-number font-mono">
										{(clip.filters?.contrast ?? 0) > 0 ? '+' : ''}{clip.filters?.contrast ?? 0}%
									</span>
								</div>
								<input
									type="range"
									min="-100"
									max="100"
									step="1"
									value={clip.filters?.contrast ?? 0}
									oninput={(e) => handleFilterChange('contrast', parseInt((e.target as HTMLInputElement).value))}
									class="accent-slider"
									aria-label="Contrast"
								/>
							</div>

							<!-- Saturation -->
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Saturation</span>
									<span class="slider-number font-mono">
										{(clip.filters?.saturation ?? 0) > 0 ? '+' : ''}{clip.filters?.saturation ?? 0}%
									</span>
								</div>
								<input
									type="range"
									min="-100"
									max="100"
									step="1"
									value={clip.filters?.saturation ?? 0}
									oninput={(e) => handleFilterChange('saturation', parseInt((e.target as HTMLInputElement).value))}
									class="accent-slider"
									aria-label="Saturation"
								/>
							</div>
						</div>
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
						</select>
					</div>

					<!-- Mute Toggle Button -->
					<button
						class="mute-toggle-btn"
						class:is-muted={clip.audioParameters?.mute}
						onclick={handleMuteToggle}
						aria-label="Mute Audio Track"
					>
						{#if clip.audioParameters?.mute}
							<span class="mute-icon">🔇</span>
							<span>Audio Muted</span>
						{:else}
							<span class="mute-icon">🔊</span>
							<span>Sound Active</span>
						{/if}
					</button>

					<!-- Quick Split & Trim Actions -->
					<div class="actions-grid mt-2">
						<button class="tool-action-btn" onclick={handleSplit}>✂ Split Playhead</button>
						<button class="tool-action-btn" onclick={handleTrimStart}>⇤ Trim Head</button>
						<button class="tool-action-btn" onclick={handleTrimEnd}>⇥ Trim Tail</button>
					</div>
				</div>

				<!-- Collapsible Accordion: Audio Fades -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (audioFadesOpen = !audioFadesOpen)}>
							<span class="chevron">{audioFadesOpen ? '▾' : '▸'}</span>
							<span class="section-name">Audio Fades</span>
						</button>
					</div>

					{#if audioFadesOpen}
						<div class="section-fields">
							<!-- Fade In Slider (0.0s - 5.0s) -->
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Fade In Duration</span>
									<span class="slider-number font-mono">{(clip.filters?.fadeIn ?? 0).toFixed(1)}s</span>
								</div>
								<input
									type="range"
									min="0"
									max="5"
									step="0.1"
									value={clip.filters?.fadeIn ?? 0}
									oninput={(e) => handleFilterChange('fadeIn', parseFloat((e.target as HTMLInputElement).value))}
									class="accent-slider"
									aria-label="Fade In Duration"
								/>
							</div>

							<!-- Fade Out Slider (0.0s - 5.0s) -->
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Fade Out Duration</span>
									<span class="slider-number font-mono">{(clip.filters?.fadeOut ?? 0).toFixed(1)}s</span>
								</div>
								<input
									type="range"
									min="0"
									max="5"
									step="0.1"
									value={clip.filters?.fadeOut ?? 0}
									oninput={(e) => handleFilterChange('fadeOut', parseFloat((e.target as HTMLInputElement).value))}
									class="accent-slider"
									aria-label="Fade Out Duration"
								/>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- ================================================================= -->
			<!-- 3. TEXT CLIP INSPECTOR -->
			<!-- ================================================================= -->
			{#if $clipType === 'text'}
				<div class="primary-controls-card">
					<div class="card-header-label">Text Content</div>
					<!-- Live Textarea -->
					<textarea
						class="text-editor-textarea"
						rows="3"
						placeholder="Enter text overlay content..."
						value={(clip as any).text ?? clip.filters?.text ?? 'Heading Text'}
						oninput={(e) => handleTextChange((e.target as HTMLTextAreaElement).value)}
						aria-label="Text Content"
					></textarea>
				</div>

				<!-- Collapsible Accordion: Typography -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (textTypographyOpen = !textTypographyOpen)}>
							<span class="chevron">{textTypographyOpen ? '▾' : '▸'}</span>
							<span class="section-name">Typography</span>
						</button>
					</div>

					{#if textTypographyOpen}
						<div class="section-fields">
							<!-- Font Family Selector -->
							<div class="field-row">
								<span class="field-label">Font Family</span>
								<select
									value={(clip as any).fontFamily ?? clip.filters?.fontFamily ?? 'Inter'}
									onchange={(e) => handleTypographyChange('fontFamily', (e.target as HTMLSelectElement).value)}
									class="dropdown-select"
									aria-label="Font Family"
								>
									<option value="Inter">Inter</option>
									<option value="Roboto">Roboto</option>
									<option value="Playfair Display">Playfair Display</option>
									<option value="Monospace">Monospace</option>
									<option value="Impact">Impact</option>
									<option value="Arial">Arial</option>
									<option value="Georgia">Georgia</option>
								</select>
							</div>

							<!-- Font Size Slider (12px - 140px) -->
							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Font Size</span>
									<span class="slider-number font-mono">{(clip as any).fontSize ?? clip.filters?.fontSize ?? 36}px</span>
								</div>
								<div class="slider-with-input">
									<input
										type="range"
										min="12"
										max="140"
										step="1"
										value={(clip as any).fontSize ?? clip.filters?.fontSize ?? 36}
										oninput={(e) => handleTypographyChange('fontSize', parseInt((e.target as HTMLInputElement).value))}
										class="accent-slider"
										aria-label="Font Size Slider"
									/>
									<input
										type="number"
										min="12"
										max="200"
										value={(clip as any).fontSize ?? clip.filters?.fontSize ?? 36}
										oninput={(e) => handleTypographyChange('fontSize', parseInt((e.target as HTMLInputElement).value))}
										class="mini-num-box font-mono"
										aria-label="Font Size Input"
									/>
								</div>
							</div>

							<!-- Font Weight -->
							<div class="field-row">
								<span class="field-label">Font Weight</span>
								<select
									value={(clip as any).fontWeight ?? clip.filters?.fontWeight ?? '700'}
									onchange={(e) => handleTypographyChange('fontWeight', (e.target as HTMLSelectElement).value)}
									class="dropdown-select font-mono"
									aria-label="Font Weight"
								>
									<option value="400">Regular (400)</option>
									<option value="500">Medium (500)</option>
									<option value="700">Bold (700)</option>
									<option value="900">Black (900)</option>
								</select>
							</div>

							<!-- Text Alignment Segmented Buttons -->
							<div class="field-row">
								<span class="field-label">Alignment</span>
								<div class="segmented-align-group">
									<button
										class="align-btn"
										class:active={((clip as any).textAlign ?? clip.filters?.textAlign ?? 'center') === 'left'}
										onclick={() => handleTypographyChange('textAlign', 'left')}
										title="Align Left"
										aria-label="Align Left"
									>
										⇤ Left
									</button>
									<button
										class="align-btn"
										class:active={((clip as any).textAlign ?? clip.filters?.textAlign ?? 'center') === 'center'}
										onclick={() => handleTypographyChange('textAlign', 'center')}
										title="Align Center"
										aria-label="Align Center"
									>
										≡ Center
									</button>
									<button
										class="align-btn"
										class:active={((clip as any).textAlign ?? clip.filters?.textAlign ?? 'center') === 'right'}
										onclick={() => handleTypographyChange('textAlign', 'right')}
										title="Align Right"
										aria-label="Align Right"
									>
										⇥ Right
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Collapsible Accordion: Colors & Background -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (textColorsOpen = !textColorsOpen)}>
							<span class="chevron">{textColorsOpen ? '▾' : '▸'}</span>
							<span class="section-name">Colors & Styling</span>
						</button>
					</div>

					{#if textColorsOpen}
						<div class="section-fields">
							<!-- Text Color Picker -->
							<div class="field-row">
								<span class="field-label">Text Color</span>
								<div class="color-picker-wrap">
									<input
										type="color"
										value={(clip as any).color ?? clip.filters?.color ?? '#ffffff'}
										oninput={(e) => handleTypographyChange('color', (e.target as HTMLInputElement).value)}
										class="color-swatch-input"
										aria-label="Text Color Picker"
									/>
									<input
										type="text"
										value={(clip as any).color ?? clip.filters?.color ?? '#ffffff'}
										onchange={(e) => handleTypographyChange('color', (e.target as HTMLInputElement).value)}
										class="color-hex-input font-mono"
										aria-label="Text Color Hex"
									/>
								</div>
							</div>

							<!-- Background / Highlight Color -->
							<div class="field-row">
								<span class="field-label">Highlight Background</span>
								<div class="color-picker-wrap">
									<input
										type="color"
										value={(clip as any).backgroundColor ?? clip.filters?.backgroundColor ?? '#000000'}
										oninput={(e) => handleTypographyChange('backgroundColor', (e.target as HTMLInputElement).value)}
										class="color-swatch-input"
										aria-label="Background Color Picker"
									/>
									<input
										type="text"
										value={(clip as any).backgroundColor ?? clip.filters?.backgroundColor ?? '#000000'}
										onchange={(e) => handleTypographyChange('backgroundColor', (e.target as HTMLInputElement).value)}
										class="color-hex-input font-mono"
										aria-label="Background Color Hex"
									/>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Collapsible Accordion: Position & Scale for Text -->
				<div class="foldable-section">
					<div class="section-header-row">
						<button class="section-toggle-btn" onclick={() => (transformOpen = !transformOpen)}>
							<span class="chevron">{transformOpen ? '▾' : '▸'}</span>
							<span class="section-name">Position & Scale</span>
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
										aria-label="Text Position X"
									/>
									<span class="dim-label">Y:</span>
									<input
										type="number"
										step="1"
										value={clip.transform?.y ?? 0}
										oninput={(e) => handleTransformChange('y', parseFloat((e.target as HTMLInputElement).value) || 0)}
										aria-label="Text Position Y"
									/>
								</div>
							</div>

							<div class="slider-field">
								<div class="slider-top-label">
									<span class="field-label">Scale</span>
									<span class="slider-number font-mono">{Math.round((clip.transform?.scale ?? 1) * 100)}%</span>
								</div>
								<input
									type="range"
									min="0.2"
									max="3.0"
									step="0.05"
									value={clip.transform?.scale ?? 1}
									oninput={(e) => handleTransformChange('scale', parseFloat((e.target as HTMLInputElement).value) || 1)}
									class="accent-slider"
									aria-label="Text Scale"
								/>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Delete Clip Quick Button (Bottom of Inspector) -->
			<div class="danger-zone-box">
				<button class="tool-action-btn delete-btn" onclick={handleDelete}>
					🗑 Delete Clip
				</button>
			</div>
		</div>
	{:else}
		<!-- Unselected State: Stitch Design Inspector with tabs & controls -->
		<div class="flex flex-col h-full bg-surface-container text-on-surface">
			<!-- Inspector Tabs -->
			<div class="flex border-b border-outline-variant bg-surface-container-low text-xs font-semibold">
				<button type="button" class="flex-1 py-2.5 text-center border-b-2 border-primary text-primary flex items-center justify-center gap-1">
					<span class="material-symbols-outlined text-base">tune</span>
					<span>Adjust</span>
				</button>
				<button type="button" class="flex-1 py-2.5 text-center text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1">
					<span class="material-symbols-outlined text-base">palette</span>
					<span>Filters</span>
				</button>
				<button type="button" class="flex-1 py-2.5 text-center text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1">
					<span class="material-symbols-outlined text-base">auto_fix_high</span>
					<span>Effects</span>
				</button>
			</div>

			<!-- Inspector Content Scroll Area -->
			<div class="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
				<div class="bg-surface-container-highest/50 border border-outline-variant p-3 rounded-lg flex items-center gap-2 text-on-surface-variant">
					<span class="material-symbols-outlined text-primary text-lg">info</span>
					<span>Select a clip on the timeline to edit properties & apply LUTs</span>
				</div>

				<!-- White Balance Section -->
				<div class="space-y-3">
					<div class="flex justify-between items-center font-bold text-on-surface">
						<span>White Balance</span>
						<button type="button" class="text-primary text-[10px] uppercase tracking-wider hover:underline">Reset</button>
					</div>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-on-surface-variant w-16">Temp</span>
							<input type="range" min="-100" max="100" value="15" class="flex-1 accent-primary mx-2" disabled />
							<span class="font-mono text-outline text-[11px] w-8 text-right">15</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-on-surface-variant w-16">Tint</span>
							<input type="range" min="-100" max="100" value="0" class="flex-1 accent-primary mx-2" disabled />
							<span class="font-mono text-outline text-[11px] w-8 text-right">0</span>
						</div>
					</div>
				</div>

				<!-- Tone Section -->
				<div class="space-y-3 pt-2 border-t border-outline-variant/40">
					<div class="flex justify-between items-center font-bold text-on-surface">
						<span>Tone</span>
						<button type="button" class="text-primary text-[10px] uppercase tracking-wider hover:underline">Reset</button>
					</div>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-on-surface-variant w-16">Exposure</span>
							<input type="range" min="-100" max="100" value="0" class="flex-1 accent-primary mx-2" disabled />
							<span class="font-mono text-outline text-[11px] w-8 text-right">0</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-on-surface-variant w-16">Contrast</span>
							<input type="range" min="-100" max="100" value="10" class="flex-1 accent-primary mx-2" disabled />
							<span class="font-mono text-outline text-[11px] w-8 text-right">10</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-on-surface-variant w-16">Highlights</span>
							<input type="range" min="-100" max="100" value="-5" class="flex-1 accent-primary mx-2" disabled />
							<span class="font-mono text-outline text-[11px] w-8 text-right">-5</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-on-surface-variant w-16">Shadows</span>
							<input type="range" min="-100" max="100" value="5" class="flex-1 accent-primary mx-2" disabled />
							<span class="font-mono text-outline text-[11px] w-8 text-right">5</span>
						</div>
					</div>
				</div>

				<!-- Creative Color Grading Section -->
				<div class="space-y-3 pt-2 border-t border-outline-variant/40">
					<div class="flex justify-between items-center font-bold text-on-surface">
						<span>Creative (LUTs)</span>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div class="bg-surface-container-highest border border-outline-variant rounded-md p-2 text-center text-[11px] text-on-surface-variant hover:border-primary cursor-pointer transition-colors">
							Teal & Orange
						</div>
						<div class="bg-surface-container-highest border border-outline-variant rounded-md p-2 text-center text-[11px] text-on-surface-variant hover:border-primary cursor-pointer transition-colors">
							Cyberpunk Neon
						</div>
						<div class="bg-surface-container-highest border border-outline-variant rounded-md p-2 text-center text-[11px] text-on-surface-variant hover:border-primary cursor-pointer transition-colors">
							Vintage Sepia
						</div>
						<div class="bg-surface-container-highest border border-outline-variant rounded-md p-2 text-center text-[11px] text-on-surface-variant hover:border-primary cursor-pointer transition-colors">
							Monochrome Noir
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</aside>

<style>
	.inspector-sidebar {
		width: 100%;
		height: 100%;
		background: var(--color-bg-surface, #121319);
		border-left: 1px solid var(--color-border-subtle, #232738);
		display: flex;
		flex-direction: column;
		user-select: none;
		overflow: hidden;
		box-sizing: border-box;
	}

	.sidebar-top-title {
		padding: 0 12px;
		background: var(--color-bg-header, #1a1d28);
		border-bottom: 1px solid var(--color-border-subtle, #232738);
		height: 34px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary, #94a3b8);
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.header-icon {
		width: 14px;
		height: 14px;
		color: var(--color-accent-primary, #38bdf8);
	}

	.active-badge {
		font-size: 0.6rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.active-badge.video {
		background: rgba(37, 99, 235, 0.2);
		color: #60a5fa;
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.active-badge.audio {
		background: rgba(5, 150, 105, 0.2);
		color: #34d399;
		border: 1px solid rgba(16, 185, 129, 0.3);
	}

	.active-badge.image {
		background: rgba(217, 119, 6, 0.2);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.active-badge.text {
		background: rgba(139, 92, 246, 0.2);
		color: #a78bfa;
		border: 1px solid rgba(167, 139, 250, 0.3);
	}

	.clip-subhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 7px 12px;
		background: #141622;
		border-bottom: 1px solid var(--color-border-subtle, #232738);
		gap: 8px;
		flex-shrink: 0;
	}

	.clip-info-block {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.clip-type-pill {
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 1px 4px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.clip-type-pill.video {
		background: #2563eb;
		color: #fff;
	}

	.clip-type-pill.audio {
		background: #059669;
		color: #fff;
	}

	.clip-type-pill.image {
		background: #d97706;
		color: #fff;
	}

	.clip-type-pill.text {
		background: #7c3aed;
		color: #fff;
	}

	.clip-title-name {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-primary, #f8fafc);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.deselect-btn {
		background: transparent;
		border: none;
		color: var(--color-text-muted, #64748b);
		font-size: 0.75rem;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 3px;
		transition: all 0.15s ease;
	}

	.deselect-btn:hover {
		color: #ffffff;
		background: #232738;
	}

	.inspector-sections-scroll {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: 8px 10px;
		gap: 8px;
	}

	/* Primary Controls Card */
	.primary-controls-card {
		background: #161824;
		border: 1px solid var(--color-border-subtle, #232738);
		border-radius: 6px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.card-header-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-text-muted, #64748b);
		letter-spacing: 0.05em;
	}

	.primary-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: #1e2235;
		border: 1px solid #2d334d;
		color: #f1f5f9;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.primary-action-btn:hover {
		background: var(--color-accent-primary, #38bdf8);
		border-color: var(--color-accent-primary-hover, #0ea5e9);
		color: #090a0d;
	}

	.primary-action-btn .btn-icon {
		font-size: 0.85rem;
	}

	.trim-inputs-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}

	.trim-input-group {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.trim-label-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.mini-trim-btn {
		background: #1b1e2c;
		border: 1px solid #282d42;
		color: #94a3b8;
		font-size: 0.7rem;
		padding: 1px 4px;
		border-radius: 3px;
		cursor: pointer;
	}

	.mini-trim-btn:hover {
		background: #282d42;
		color: #fff;
	}

	.num-input-wrap {
		display: flex;
		align-items: center;
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		border-radius: 4px;
		padding: 2px 4px;
	}

	.num-input-wrap input {
		width: 100%;
		background: transparent;
		border: none;
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.7rem;
		outline: none;
	}

	.unit-tag {
		color: #64748b;
		font-size: 0.65rem;
		margin-left: 2px;
	}

	/* Foldable Section */
	.foldable-section {
		background: #161824;
		border: 1px solid var(--color-border-subtle, #232738);
		border-radius: 6px;
		overflow: hidden;
	}

	.section-header-row {
		display: flex;
		align-items: center;
		background: #191c2b;
		border-bottom: 1px solid var(--color-border-subtle, #232738);
	}

	.section-toggle-btn {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: none;
		padding: 7px 10px;
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.section-toggle-btn:hover {
		background: #22263a;
	}

	.chevron {
		font-size: 0.75rem;
		color: var(--color-text-secondary, #94a3b8);
	}

	.section-name {
		flex: 1;
	}

	.section-reset-link {
		background: transparent;
		border: none;
		color: var(--color-text-dim, #475569);
		font-size: 0.62rem;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 2px;
		margin-right: 4px;
	}

	.section-reset-link:hover {
		color: var(--color-accent-primary, #38bdf8);
	}

	.section-fields {
		padding: 9px 10px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.field-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.7rem;
	}

	.field-label,
	.sub-label {
		color: var(--color-text-secondary, #94a3b8);
		font-size: 0.68rem;
	}

	.select-field-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}

	.select-wrap {
		flex: 1;
		display: flex;
		justify-content: flex-end;
	}

	.dropdown-select {
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.68rem;
		padding: 3px 6px;
		border-radius: 4px;
		outline: none;
		cursor: pointer;
	}

	.dropdown-select:focus {
		border-color: var(--color-accent-primary, #38bdf8);
	}

	.multi-num-inputs {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.dim-label {
		color: #64748b;
		font-size: 0.65rem;
	}

	.multi-num-inputs input {
		width: 44px;
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.68rem;
		padding: 2px 4px;
		border-radius: 3px;
		text-align: right;
		outline: none;
	}

	.slider-field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.slider-top-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.68rem;
	}

	.slider-title {
		color: var(--color-text-secondary, #94a3b8);
		font-size: 0.68rem;
	}

	.slider-number {
		color: var(--color-accent-primary, #38bdf8);
		font-weight: 600;
		font-size: 0.68rem;
	}

	.slider-with-input {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.mini-num-box {
		width: 44px;
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.68rem;
		padding: 2px 4px;
		border-radius: 3px;
		text-align: right;
		outline: none;
	}

	.num-with-unit {
		display: flex;
		align-items: center;
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		border-radius: 3px;
		padding: 2px 4px;
	}

	.num-with-unit input {
		width: 36px;
		background: transparent;
		border: none;
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.68rem;
		text-align: right;
		outline: none;
	}

	.deg-sym {
		color: #64748b;
		font-size: 0.65rem;
		margin-left: 1px;
	}

	.accent-slider {
		width: 100%;
		height: 4px;
		accent-color: var(--color-accent-primary, #38bdf8);
		cursor: pointer;
	}

	/* Audio Specific */
	.mute-toggle-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: #1a2332;
		border: 1px solid #23344d;
		color: #60a5fa;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 6px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mute-toggle-btn:hover {
		background: #223046;
	}

	.mute-toggle-btn.is-muted {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.4);
		color: #f87171;
	}

	/* Text Specific */
	.text-editor-textarea {
		width: 100%;
		box-sizing: border-box;
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		border-radius: 4px;
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.72rem;
		padding: 6px 8px;
		outline: none;
		resize: vertical;
		font-family: inherit;
	}

	.text-editor-textarea:focus {
		border-color: var(--color-accent-primary, #38bdf8);
	}

	.segmented-align-group {
		display: flex;
		gap: 2px;
		background: #0d0f17;
		padding: 2px;
		border-radius: 4px;
		border: 1px solid var(--color-border-subtle, #232738);
	}

	.align-btn {
		background: transparent;
		border: none;
		color: var(--color-text-secondary, #94a3b8);
		font-size: 0.65rem;
		padding: 2px 6px;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.align-btn:hover {
		color: #ffffff;
	}

	.align-btn.active {
		background: var(--color-accent-primary, #38bdf8);
		color: #090a0d;
		font-weight: 700;
	}

	.color-picker-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.color-swatch-input {
		width: 22px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--color-border-subtle, #232738);
		border-radius: 3px;
		cursor: pointer;
		background: transparent;
	}

	.color-hex-input {
		width: 60px;
		background: #0d0f17;
		border: 1px solid var(--color-border-subtle, #232738);
		color: var(--color-text-primary, #f8fafc);
		font-size: 0.68rem;
		padding: 2px 4px;
		border-radius: 3px;
		outline: none;
	}

	/* Actions Grid & Buttons */
	.actions-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}

	.tool-action-btn {
		background: #1c1e2b;
		border: 1px solid #282c3e;
		color: #cbd5e1;
		font-size: 0.65rem;
		padding: 5px 3px;
		border-radius: 4px;
		cursor: pointer;
		text-align: center;
		transition: all 0.15s ease;
	}

	.tool-action-btn:hover {
		background: #282c3e;
		color: #fff;
	}

	.danger-zone-box {
		margin-top: 4px;
	}

	.tool-action-btn.delete-btn {
		width: 100%;
		color: var(--color-danger, #ef4444);
		border-color: rgba(239, 68, 68, 0.25);
		background: rgba(239, 68, 68, 0.08);
		font-weight: 600;
		padding: 6px;
	}

	.tool-action-btn.delete-btn:hover {
		background: var(--color-danger, #ef4444);
		color: #ffffff;
		border-color: var(--color-danger, #ef4444);
	}

	/* Empty State */
	.empty-inspector-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 20px 16px;
		box-sizing: border-box;
	}

	.empty-guide-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		background: #151722;
		border: 1px dashed var(--color-border-subtle, #232738);
		border-radius: 8px;
		padding: 24px 16px;
		gap: 10px;
		width: 100%;
		box-sizing: border-box;
	}

	.guide-icon-circle {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: #1a1d2d;
		border: 1px solid #282d42;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-accent-primary, #38bdf8);
	}

	.guide-svg-icon {
		width: 22px;
		height: 22px;
	}

	.guide-headline {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-primary, #f8fafc);
		margin: 0;
	}

	.guide-subtext {
		font-size: 0.72rem;
		line-height: 1.4;
		color: var(--color-text-secondary, #94a3b8);
		margin: 0;
		max-width: 200px;
	}

	.guide-pills-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		justify-content: center;
		margin-top: 4px;
	}

	.feature-pill {
		font-size: 0.6rem;
		font-weight: 500;
		color: #64748b;
		background: #10121b;
		border: 1px solid #1f2334;
		padding: 2px 6px;
		border-radius: 10px;
	}

	.font-mono {
		font-family: 'JetBrains Mono', monospace;
	}

	.mt-2 {
		margin-top: 8px;
	}
</style>
