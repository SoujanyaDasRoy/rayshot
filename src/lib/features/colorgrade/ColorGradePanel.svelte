<script lang="ts">
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
			exposure: 0,
			contrast: 0,
			highlights: 0,
			shadows: 0,
			whites: 0,
			blacks: 0,
			temperature: 0,
			tint: 0,
			saturation: 0,
			vibrance: 0,
			vignette: 0,
			grain: 0,
			lutUrl: undefined,
			curves: {
				r: [[0, 0], [1, 1]],
				g: [[0, 0], [1, 1]],
				b: [[0, 0], [1, 1]],
				lum: [[0, 0], [1, 1]]
			}
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
		<button class="reset-btn" on:click={resetColorGrade}>
			Reset
		</button>
	</div>

	<div class="panel-content">
		<!-- Exposure -->
		<div class="slider-group">
			<label class="slider-label">Exposure</label>
			<div class="slider-value">{exposure.toFixed(+1)}</div>
			<input
				type="range"
				min="-2"
				max="2"
				step="0.1"
				bind:value={exposure}
				on:input={(e) => updateColorGrade('exposure', parseFloat((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Contrast -->
		<div class="slider-group">
			<label class="slider-label">Contrast</label>
			<div class="slider-value">{contrast.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={contrast}
				on:input={(e) => updateColorGrade('contrast', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Highlights -->
		<div class="slider-group">
			<label class="slider-label">Highlights</label>
			<div class="slider-value">{highlights.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={highlights}
				on:input={(e) => updateColorGrade('highlights', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Shadows -->
		<div class="slider-group">
			<label class="slider-label">Shadows</label>
			<div class="slider-value">{shadows.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={shadows}
				on:input={(e) => updateColorGrade('shadows', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Whites -->
		<div class="slider-group">
			<label class="slider-label">Whites</label>
			<div class="slider-value">{whites.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={whites}
				on:input={(e) => updateColorGrade('whites', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Blacks -->
		<div class="slider-group">
			<label class="slider-label">Blacks</label>
			<div class="slider-value">{blacks.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={blacks}
				on:input={(e) => updateColorGrade('blacks', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Temperature -->
		<div class="slider-group">
			<label class="slider-label">Temperature</label>
			<div class="slider-value">{temperature.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={temperature}
				on:input={(e) => updateColorGrade('temperature', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Tint -->
		<div class="slider-group">
			<label class="slider-label">Tint</label>
			<div class="slider-value">{tint.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={tint}
				on:input={(e) => updateColorGrade('tint', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Saturation -->
		<div class="slider-group">
			<label class="slider-label">Saturation</label>
			<div class="slider-value">{saturation.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={saturation}
				on:input={(e) => updateColorGrade('saturation', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Vibrance -->
		<div class="slider-group">
			<label class="slider-label">Vibrance</label>
			<div class="slider-value">{vibrance.toFixed(0)}</div>
			<input
				type="range"
				min="-100"
				max="100"
				step="1"
				bind:value={vibrance}
				on:input={(e) => updateColorGrade('vibrance', parseInt((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Vignette -->
		<div class="slider-group">
			<label class="slider-label">Vignette</label>
			<div class="slider-value">{(vignette * 100).toFixed(0)}%</div>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={vignette}
				on:input={(e) => updateColorGrade('vignette', parseFloat((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>

		<!-- Grain -->
		<div class="slider-group">
			<label class="slider-label">Grain</label>
			<div class="slider-value">{(grain * 100).toFixed(0)}%</div>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={grain}
				on:input={(e) => updateColorGrade('grain', parseFloat((e.target as HTMLInputElement).value))}
				class="accent-slider"
			/>
		</div>
	</div>
</div>

<style>
	.color-grade-panel {
		background: #161824;
		border: 1px solid #232738;
		border-radius: 6px;
		padding: 12px;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid #232738;
	}

	.panel-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: #f1f5f9;
		margin: 0;
	}

	.reset-btn {
		background: transparent;
		border: 1px solid #475569;
		color: #94a3b8;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.reset-btn:hover {
		background: #475569;
		color: #f1f5f9;
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
		color: #94a3b8;
	}

	.slider-value {
		font-size: 0.75rem;
		font-weight: 600;
		color: #38bdf8;
		font-family: 'JetBrains Mono', monospace;
		min-width: 40px;
		text-align: right;
	}

	.accent-slider {
		width: 100%;
		height: 4px;
		accent-color: #38bdf8;
		cursor: pointer;
	}
</style>