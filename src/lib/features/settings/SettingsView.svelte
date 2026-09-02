<script lang="ts">
	import Icon from '$lib/features/shell/Icon.svelte';
	import { projectStore, updateProject } from '$lib/stores/project.svelte';
	import { isOpfsAvailable } from '$lib/core/persistence/opfsAdapter';

	let projectName = $state($projectStore?.name || 'RayShot_Project_1');
	let selectedAspect = $state<'16:9' | '9:16' | '1:1' | '4:5' | '2.39:1'>('16:9');
	let frameRate = $state<number>(30);
	let backgroundColor = $state<string>('#000000');
	let autoSaveEnabled = $state(true);
	let opfsSupported = $state(false);
	let toastMessage = $state<string | null>(null);

	$effect(() => {
		opfsSupported = isOpfsAvailable();
		if ($projectStore?.settings?.backgroundColor) {
			backgroundColor = $projectStore.settings.backgroundColor;
		}
	});

	function saveSettings() {
		updateProject({
			name: projectName,
			settings: { backgroundColor }
		});
		toastMessage = 'Project settings saved successfully!';
		setTimeout(() => (toastMessage = null), 2400);
	}
</script>

<div class="settings-view-container">
	<div class="settings-header">
		<div>
			<h1 class="settings-title">Project & Workspace Settings</h1>
			<p class="settings-subtitle">Configure resolution presets, timeline frame rates, background canvas, and local persistence engine.</p>
		</div>

		<button type="button" class="btn-save-settings" onclick={saveSettings}>
			<Icon name="import" size={14} />
			<span>Save Settings</span>
		</button>
	</div>

	{#if toastMessage}
		<div class="toast-popup">
			<span>{toastMessage}</span>
		</div>
	{/if}

	<div class="settings-form-grid">
		<!-- Section 1: Project Identity -->
		<div class="settings-card">
			<h2 class="card-title">Project Details</h2>
			<div class="form-field">
				<label for="settings-proj-name" class="field-label">Project Name</label>
				<input id="settings-proj-name" type="text" bind:value={projectName} class="field-input" />
			</div>

			<div class="form-field">
				<label for="settings-aspect" class="field-label">Sequence Aspect Ratio</label>
				<select id="settings-aspect" bind:value={selectedAspect} class="field-select">
					<option value="16:9">16:9 Landscape (1920x1080 / 4K UHD)</option>
					<option value="9:16">9:16 Vertical (TikTok, Instagram Reels, YouTube Shorts)</option>
					<option value="1:1">1:1 Square (Instagram Feed, Square Video)</option>
					<option value="4:5">4:5 Portrait (Social Portrait)</option>
					<option value="2.39:1">2.39:1 Anamorphic Cinematic Widescreen</option>
				</select>
			</div>

			<div class="form-field">
				<label for="settings-framerate" class="field-label">Timeline Frame Rate</label>
				<select id="settings-framerate" bind:value={frameRate} class="field-select">
					<option value={23.976}>23.976 fps (Cinematic Film Standard)</option>
					<option value={24}>24.000 fps (DCI Cinema Standard)</option>
					<option value={30}>30.000 fps (Web & YouTube Standard)</option>
					<option value={60}>60.000 fps (High Motion / Smooth Gaming)</option>
				</select>
			</div>
		</div>

		<!-- Section 2: Canvas & Visuals -->
		<div class="settings-card">
			<h2 class="card-title">Canvas & Rendering</h2>
			<div class="form-field">
				<label for="settings-bg-color" class="field-label">Canvas Background Color</label>
				<div class="flex items-center gap-3">
					<input id="settings-bg-color" type="color" bind:value={backgroundColor} class="color-picker-input" />
					<span class="font-mono text-xs text-on-surface-variant">{backgroundColor}</span>
				</div>
			</div>

			<div class="form-field">
				<label for="settings-render-pipeline" class="field-label">Rendering Pipeline</label>
				<select id="settings-render-pipeline" class="field-select">
					<option value="gpu">Hardware Accelerated WebCodecs & WebGL (High Speed)</option>
					<option value="canvas">Canvas 2D Context (Broad Compatibility)</option>
				</select>
			</div>
		</div>

		<!-- Section 3: Storage & OPFS Persistence -->
		<div class="settings-card col-span-2">
			<h2 class="card-title">Storage & Local Auto-Save</h2>
			<div class="storage-info-row">
				<div class="storage-stat">
					<span class="stat-label">OPFS Sandbox Engine</span>
					<span class="stat-value text-emerald-400">
						{opfsSupported ? '✓ Active & Connected' : 'IndexedDB Fallback'}
					</span>
				</div>
				<div class="storage-stat">
					<span class="stat-label">Debounced Auto-Save</span>
					<span class="stat-value text-primary">
						{autoSaveEnabled ? '✓ Enabled (800ms post-action)' : 'Disabled'}
					</span>
				</div>
				<div class="storage-stat">
					<span class="stat-label">Privacy Model</span>
					<span class="stat-value text-sky-400">100% Client-Side Sandboxed</span>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.settings-view-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: var(--ms-void);
		color: var(--ms-text);
		padding: 24px 32px;
		overflow-y: auto;
		box-sizing: border-box;
	}

	.settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--ms-material);
		padding-bottom: 16px;
	}

	.settings-title {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0 0 4px 0;
	}

	.settings-subtitle {
		font-size: 0.8rem;
		color: var(--ms-text-secondary);
		margin: 0;
	}

	.btn-save-settings {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--ms-text);
		color: var(--ms-void);
		border: none;
		border-radius: 8px;
		padding: 8px 18px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
	}

	.btn-save-settings:hover {
		background: var(--ms-text);
	}

	.settings-form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		max-width: 1000px;
	}

	.settings-card {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 12px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0;
		border-bottom: 1px solid var(--ms-raised);
		padding-bottom: 10px;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ms-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.field-input,
	.field-select {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		color: var(--ms-text);
		padding: 8px 12px;
		font-size: 0.85rem;
		outline: none;
	}

	.field-input:focus,
	.field-select:focus {
		border-color: var(--ms-text);
	}

	.color-picker-input {
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		background: transparent;
	}

	.storage-info-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	.storage-stat {
		background: var(--ms-void);
		border: 1px solid var(--ms-raised);
		border-radius: 8px;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--ms-text-tertiary);
		font-weight: 600;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 0.85rem;
		font-weight: 700;
	}

	.col-span-2 {
		grid-column: span 2;
	}

	.toast-popup {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--ms-raised);
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text);
		padding: 10px 20px;
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		font-size: 0.85rem;
		font-weight: 600;
		z-index: 1000;
	}
</style>
