<script lang="ts">
	import { timelineStore, timelineActions } from '$lib/stores/timeline.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { SplitClipCommand } from '$lib/core/commands/splitClip';
	import { TrimClipCommand } from '$lib/core/commands/trimClip';
	import { DeleteClipCommand } from '$lib/core/commands/deleteClip';
	import { SetClipVolumeCommand } from '$lib/core/commands/setClipVolume';
	import { SetClipSpeedCommand } from '$lib/core/commands/setClipSpeed';
	import { clipRate } from '$lib/utils/clipTiming';
	import { SetClipFilterCommand } from '$lib/core/commands/setClipFilter';
	import { SetTransformCommand } from '$lib/core/commands/setTransform';
	import { ToggleClipMuteCommand } from '$lib/core/commands/toggleClipMute';
	import { RemoveClipEffectCommand } from '$lib/core/commands/removeClipEffect';
	import { effectById, paramMeta } from '$lib/core/effects/effectRegistry';
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
	let effectsOpen = $state(true);
	let opacityOpen = $state(false);
	let colorOpen = $state(false);
	let audioFadesOpen = $state(false);

	/** Applied effects, resolved against the registry so unknown ids just vanish. */
	const appliedEffects = derived(selectedClipData, ($data) =>
		($data?.clip.effects ?? []).map((id) => effectById(id)).filter((e) => e !== null)
	);

	function removeEffect(effectId: string) {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		commandProcessor.execute(new RemoveClipEffectCommand({ clipId, effectId }));
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
		// Changing the speed resizes the clip: that is what speed now means.
		commandProcessor.execute(new SetClipSpeedCommand({ clipId, speed: val }));
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
		const clipData = $selectedClipData;
		if (!clipData) return;
		const { clip } = clipData;
		commandProcessor.execute(
			new SetTransformCommand({
				clipId: clip.id,
				transform: { ...clip.transform, [prop]: val }
			})
		);
	}

	function handleResetTransform() {
		const clipId = $timelineStore.selectedClipId;
		if (!clipId) return;
		commandProcessor.execute(
			new SetTransformCommand({
				clipId,
				transform: { x: 0, y: 0, scale: 1, rotation: 0 }
			})
		);
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
		commandProcessor.execute(new ToggleClipMuteCommand({ clipId: clip.id }));
	}

</script>

{#snippet effectsSection(clip: Clip)}
				<!-- Collapsible Accordion: Effects -->
	<div class="foldable-section">
		<div class="section-header-row">
			<button class="section-toggle-btn" onclick={() => (effectsOpen = !effectsOpen)}>
				<span class="chevron">{effectsOpen ? '▾' : '▸'}</span>
				<span class="section-name">Effects</span>
			</button>
			{#if $appliedEffects.length > 0}
				<span class="section-count font-mono">{$appliedEffects.length}</span>
			{/if}
		</div>

		{#if effectsOpen}
			<div class="section-fields">
				{#if $appliedEffects.length === 0}
					<!-- An empty panel is an instruction, not a shrug. -->
					<p class="effects-empty">
						Drag an effect from the library onto this clip to add one.
					</p>
				{:else}
					{#each $appliedEffects as effect (effect.id)}
						<div class="applied-effect">
							<div class="applied-effect-head">
								<span class="applied-effect-name">{effect.name}</span>
								<button
									class="applied-effect-remove"
									onclick={() => removeEffect(effect.id)}
									title="Remove {effect.name}"
									aria-label="Remove {effect.name}"
								>&times;</button>
							</div>

							{#each Object.keys(effect.params) as param (param)}
								{@const meta = paramMeta(param)}
								{@const value = (clip.filters?.[param] ?? effect.params[param]) as number}
								<div class="slider-field">
									<div class="slider-top-label">
										<span class="field-label">{meta.label}</span>
										<span class="slider-number font-mono">{value}{meta.unit ?? ''}</span>
									</div>
									<input
										type="range"
										min={meta.min}
										max={meta.max}
										step={meta.step}
										{value}
										oninput={(e) =>
											handleFilterChange(param, parseFloat((e.target as HTMLInputElement).value))}
										class="accent-slider"
										aria-label="{effect.name} {meta.label}"
									/>
								</div>
							{/each}
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

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
						<span class="sub-label">Clip Speed</span>
						<div class="select-wrap">
							<select
								value={clipRate(clip)}
								onchange={(e) => handleRateChange(parseFloat((e.target as HTMLSelectElement).value))}
								class="dropdown-select font-mono"
								aria-label="Clip Speed"
							>
								<option value={0.5}>0.5x (Slow)</option>
								<option value={1.0}>1.0x (Normal)</option>
								<option value={1.5}>1.5x (Fast)</option>
								<option value={2.0}>2.0x (Double)</option>
								{#if ![0.5, 1.0, 1.5, 2.0].includes(clipRate(clip))}
									<option value={clipRate(clip)}>{clipRate(clip).toFixed(2)}x (Custom)</option>
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

				{@render effectsSection(clip)}

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
						<ColorGradePanel {clip} onChange={() => {}} />
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
						<span class="sub-label">Clip Speed</span>
						<div class="select-wrap">
							<select
								value={clipRate(clip)}
								onchange={(e) => handleRateChange(parseFloat((e.target as HTMLSelectElement).value))}
								class="dropdown-select font-mono"
								aria-label="Audio Clip Speed"
							>
								<option value={0.5}>0.5x (Slow)</option>
								<option value={1.0}>1.0x (Normal)</option>
								<option value={1.5}>1.5x (Fast)</option>
								<option value={2.0}>2.0x (Double)</option>
								{#if ![0.5, 1.0, 1.5, 2.0].includes(clipRate(clip))}
									<option value={clipRate(clip)}>{clipRate(clip).toFixed(2)}x (Custom)</option>
								{/if}
							</select>
						</div>
					</div>
				</div>

				{@render effectsSection(clip)}
			{/if}
		</div>
	{/if}
</aside>
<style>
	/*
		This file had no <style> block at all. Every class below was already in
		the markup and styled nothing — which is also why the header SVG rendered
		at the replaced-element default of 300x150 instead of an icon: an <svg>
		with no width/height and no CSS falls back to that.
	*/
	.inspector-sidebar {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: var(--ms-void);
		font-family: var(--ms-font);
		color: var(--ms-text);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.sidebar-top-title {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 590;
		color: var(--ms-text);
	}

	.header-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--ms-text-tertiary);
	}

	.icon-btn,
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--ms-text-tertiary);
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			color var(--ms-fast) var(--ms-ease);
	}

	.icon-btn:hover,
	.btn-icon:hover {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	.clip-info-block {
		padding: 12px 16px;
		border-bottom: 1px solid var(--ms-edge);
	}

	.clip-title-name {
		display: block;
		font-size: 13px;
		font-weight: 590;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.clip-subhead,
	.dim-label {
		font-size: 11px;
		color: var(--ms-text-tertiary);
	}

	.section-count {
		margin-left: auto;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--ms-edge);
		font-size: 10px;
		color: var(--ms-text-secondary);
	}

	.effects-empty {
		margin: 0;
		padding: 4px 2px;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ms-text-tertiary);
	}

	.applied-effect {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius-sm, 8px);
		background: var(--ms-raised);
	}

	.applied-effect-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.applied-effect-name {
		font-size: 12px;
		font-weight: 590;
		color: var(--ms-text);
	}

	.applied-effect-remove {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--ms-text-tertiary);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
	}

	.applied-effect-remove:hover {
		background: var(--ms-hover);
		color: var(--ms-text);
	}

	.inspector-sections-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: 16px;
	}

	.primary-controls-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 12px 16px;
		padding: 12px;
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius);
		background: var(--ms-material);
	}

	.card-header-label,
	.section-name {
		font-size: 11px;
		font-weight: 590;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ms-text-tertiary);
	}

	.foldable-section {
		border-top: 1px solid var(--ms-edge);
	}

	.section-header-row,
	.section-toggle-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 16px;
		border: none;
		background: transparent;
		color: var(--ms-text-secondary);
		font-family: inherit;
		cursor: pointer;
	}

	.section-toggle-btn:hover {
		color: var(--ms-text);
	}

	.chevron {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		transition: transform var(--ms-base) var(--ms-ease);
	}

	.section-reset-link {
		margin-left: auto;
		border: none;
		background: transparent;
		color: var(--ms-text-tertiary);
		font-family: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.section-reset-link:hover {
		color: var(--ms-text);
	}

	.section-fields {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 16px 14px;
	}

	.field-row,
	.select-field-row,
	.slider-top-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.field-label,
	.slider-title {
		font-size: 11.5px;
		color: var(--ms-text-secondary);
	}

	.slider-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.slider-with-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* Monochrome range: a hairline groove with a solid thumb. */
	.accent-slider {
		flex: 1;
		height: 3px;
		appearance: none;
		border-radius: 999px;
		background: var(--ms-edge-strong);
		cursor: pointer;
	}

	.accent-slider::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		border: none;
		border-radius: 50%;
		background: var(--ms-text);
	}

	.accent-slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: none;
		border-radius: 50%;
		background: var(--ms-text);
	}

	.accent-slider:focus-visible {
		outline: 2px solid var(--ms-text);
		outline-offset: 3px;
	}

	.multi-num-inputs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.num-input-wrap,
	.num-with-unit,
	.select-wrap {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.slider-number,
	.mini-num-box,
	.dropdown-select {
		width: 100%;
		min-width: 0;
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		background: var(--ms-material);
		color: var(--ms-text);
		font-family: var(--ms-font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.slider-number {
		width: 56px;
		flex-shrink: 0;
		text-align: right;
	}

	.slider-number:focus,
	.mini-num-box:focus,
	.dropdown-select:focus {
		outline: none;
		border-color: var(--ms-edge-lit);
		background: var(--ms-raised);
	}

	.mini-trim-btn,
	.primary-action-btn,
	.deselect-btn {
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius);
		background: var(--ms-material);
		color: var(--ms-text);
		font-family: inherit;
		font-size: 11.5px;
		font-weight: 590;
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			border-color var(--ms-fast) var(--ms-ease);
	}

	.mini-trim-btn {
		height: 24px;
		padding: 0 8px;
	}

	.primary-action-btn {
		height: 30px;
		padding: 0 14px;
		border: none;
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.primary-action-btn:hover {
		background: rgba(255, 255, 255, 0.88);
	}

	.mini-trim-btn:hover,
	.deselect-btn:hover {
		background: var(--ms-hover);
		border-color: var(--ms-edge-strong);
	}

	.deg-sym {
		font-size: 11px;
		color: var(--ms-text-tertiary);
	}

	:global(.inspector-sidebar button:focus-visible),
	:global(.inspector-sidebar select:focus-visible) {
		outline: 2px solid var(--ms-text);
		outline-offset: 2px;
	}
</style>
