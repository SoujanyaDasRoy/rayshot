<script lang="ts">
	import { DEFAULT_COLOR_GRADE } from '$lib/core/rendering/colorGradeUniforms';
	import { projectStore } from '$lib/stores/project.svelte';
	import { derived } from 'svelte/store';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { SetColorGradeCommand } from '$lib/core/commands/setColorGrade';
	import type { Clip } from '$lib/types/project';

	// Properties
	const { clip = null, onChange = () => {} } = $props<{
		clip: Clip | null;
		onChange: (colorGrade: Clip['colorGrade']) => void;
	}>();

	// Local state for color grade values (only the sliders we expose)
	let exposure = $state(0);
	let contrast = $state(0);
	let highlights = $state(0);
	let shadows = $state(0);
	let whites = $state(0);
	let blacks = $state(0);
	let temperature = $state(0);
	let tint = $state(0);
	let saturation = $state(0);
	let vibrance = $state(0);
	let vignette = $state(0);
	let grain = $state(0);
	// Note: lutUrl and curves are not exposed in this panel; they remain unchanged unless changed elsewhere.

	// Initialize from clip when it changes
	$effect(() => {
		if (clip) {
			const { exposure: e, contrast: c, highlights: h, shadows: s, whites: w, blacks: b,
				temperature: t, tint: ti, saturation: sat, vibrance: vi, vignette: vig, grain: gr } = clip.colorGrade;
			exposure = e;
			contrast = c;
			highlights = h;
			shadows = s;
			whites = w;
			blacks = b;
			temperature = t;
			tint = ti;
			saturation = sat;
			vibrance = vi;
			vignette = vig;
			grain = gr;
		}
	});

	// Update function
	function updateColorGrade<K extends keyof Clip['colorGrade']>(property: K, value: Clip['colorGrade'][K]) {
		if (!clip) return;

		const command = new SetColorGradeCommand({
			clipId: clip.id,
			propertyName: property,
			value
		});

		commandProcessor.execute(command);

		// Also update local state for immediate feedback (only for properties we have state for)
		if (property === 'exposure') exposure = value as number;
		else if (property === 'contrast') contrast = value as number;
		else if (property === 'highlights') highlights = value as number;
		else if (property === 'shadows') shadows = value as number;
		else if (property === 'whites') whites = value as number;
		else if (property === 'blacks') blacks = value as number;
		else if (property === 'temperature') temperature = value as number;
		else if (property === 'tint') tint = value as number;
		else if (property === 'saturation') saturation = value as number;
		else if (property === 'vibrance') vibrance = value as number;
		else if (property === 'vignette') vignette = value as number;
		else if (property === 'grain') grain = value as number;
		// lutUrl and curves are not updated in local state; they'll be updated via the clip binding when the project store updates.

		// Notify parent of change
		if (clip) {
			onChange(clip.colorGrade);
		}
	}

	// Reset to defaults
	function resetColorGrade() {
		if (!clip) return;

		const defaults: Partial<Clip['colorGrade']> = {
			...structuredClone(DEFAULT_COLOR_GRADE),
			lutUrl: undefined
		};

		// Execute commands for each property that changed
		Object.entries(defaults).forEach(([property, value]) => {
			if (clip && clip.colorGrade[property as keyof Clip['colorGrade']] !== value) {
				const command = new SetColorGradeCommand({
					clipId: clip.id,
					propertyName: property as keyof Clip['colorGrade'],
					value
				});
				commandProcessor.execute(command);
			}
		});

		// Update local state for the sliders
		exposure = 0;
		contrast = 0;
		highlights = 0;
		shadows = 0;
		whites = 0;
		blacks = 0;
		temperature = 0;
		tint = 0;
		saturation = 0;
		vibrance = 0;
		vignette = 0;
		grain = 0;
	}
</script>

<div class="color-grade-panel">
	<div class="panel-header">
		<h3 class="panel-title">Color Grading</h3>
		<button class="reset-btn" onclick={resetColorGrade}>
			Reset
		</button>
	</div>

	<div class="panel-content">
		<!-- Exposure -->
		<div class="slider-group">
			<label class="slider-label" for="cg-exposure">Exposure</label>
			<div class="slider-value">{exposure.toFixed(+1)}</div>
			<input
				type="range"
				min="-2"
				max="2"
				step="0.1"
				bind:value={exposure}
			 oninput={(e) => updateColorGrade('exposure', parseFloat((e.target as HTMLInputElement).value))}
				id="cg-exposure"
				class="accent-slider"
			/>
		</div>

		<!-- Contrast -->
		<div class="slider-group">
			<label class="slider-label" for="cg-contrast">Contrast</label>
			<div class="slider-value">{contrast.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={contrast}
			 oninput={(e) => updateColorGrade('contrast', parseInt((e.target as HTMLInputElement).value))}
				id="cg-contrast"
				class="accent-slider"
			/>
		</div>

		<!-- Highlights -->
		<div class="slider-group">
			<label class="slider-label" for="cg-highlights">Highlights</label>
			<div class="slider-value">{highlights.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={highlights}
			 oninput={(e) => updateColorGrade('highlights', parseInt((e.target as HTMLInputElement).value))}
				id="cg-highlights"
				class="accent-slider"
			/>
		</div>

		<!-- Shadows -->
		<div class="slider-group">
			<label class="slider-label" for="cg-shadows">Shadows</label>
			<div class="slider-value">{shadows.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={shadows}
			 oninput={(e) => updateColorGrade('shadows', parseInt((e.target as HTMLInputElement).value))}
				id="cg-shadows"
				class="accent-slider"
			/>
		</div>

		<!-- Whites -->
		<div class="slider-group">
			<label class="slider-label" for="cg-whites">Whites</label>
			<div class="slider-value">{whites.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={whites}
			 oninput={(e) => updateColorGrade('whites', parseInt((e.target as HTMLInputElement).value))}
				id="cg-whites"
				class="accent-slider"
			/>
		</div>

		<!-- Blacks -->
		<div class="slider-group">
			<label class="slider-label" for="cg-blacks">Blacks</label>
			<div class="slider-value">{blacks.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={blacks}
			 oninput={(e) => updateColorGrade('blacks', parseInt((e.target as HTMLInputElement).value))}
				id="cg-blacks"
				class="accent-slider"
			/>
		</div>

		<!-- Temperature -->
		<div class="slider-group">
			<label class="slider-label" for="cg-temperature">Temperature</label>
			<div class="slider-value">{temperature.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={temperature}
			 oninput={(e) => updateColorGrade('temperature', parseInt((e.target as HTMLInputElement).value))}
				id="cg-temperature"
				class="accent-slider"
			/>
		</div>

		<!-- Tint -->
		<div class="slider-group">
			<label class="slider-label" for="cg-tint">Tint</label>
			<div class="slider-value">{tint.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={tint}
			 oninput={(e) => updateColorGrade('tint', parseInt((e.target as HTMLInputElement).value))}
				id="cg-tint"
				class="accent-slider"
			/>
		</div>

		<!-- Saturation -->
		<div class="slider-group">
			<label class="slider-label" for="cg-saturation">Saturation</label>
			<div class="slider-value">{saturation.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={saturation}
			 oninput={(e) => updateColorGrade('saturation', parseInt((e.target as HTMLInputElement).value))}
				id="cg-saturation"
				class="accent-slider"
			/>
		</div>

		<!-- Vibrance -->
		<div class="slider-group">
			<label class="slider-label" for="cg-vibrance">Vibrance</label>
			<div class="slider-value">{vibrance.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={vibrance}
			 oninput={(e) => updateColorGrade('vibrance', parseInt((e.target as HTMLInputElement).value))}
				id="cg-vibrance"
				class="accent-slider"
			/>
		</div>

		<!-- Vignette -->
		<div class="slider-group">
			<label class="slider-label" for="cg-vignette">Vignette</label>
			<div class="slider-value">{(vignette * 100).toFixed(0)}%</div>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={vignette}
			 oninput={(e) => updateColorGrade('vignette', parseFloat((e.target as HTMLInputElement).value))}
				id="cg-vignette"
				class="accent-slider"
			/>
		</div>

		<!-- Grain -->
		<div class="slider-group">
			<label class="slider-label" for="cg-grain">Grain</label>
			<div class="slider-value">{(grain * 100).toFixed(0)}%</div>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={grain}
			 oninput={(e) => updateColorGrade('grain', parseFloat((e.target as HTMLInputElement).value))}
				id="cg-grain"
				class="accent-slider"
			/>
		</div>
	</div>
</div>

<style>
	.color-grade-panel {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		padding: 12px;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--ms-edge);
	}

	.panel-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ms-text);
		margin: 0;
	}

	.reset-btn {
		background: transparent;
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text-secondary);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.reset-btn:hover {
		background: var(--ms-edge-strong);
		color: var(--ms-text);
	}

	.panel-content {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.slider-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.slider-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ms-text-secondary);
	}

	.slider-value {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ms-text);
		font-family: 'JetBrains Mono', monospace;
		min-width: 40px;
		text-align: right;
	}

	.accent-slider {
		width: 100%;
		height: 4px;
		accent-color: var(--ms-text);
		cursor: pointer;
	}
</style>