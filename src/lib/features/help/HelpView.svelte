<script lang="ts">
	import Icon from '$lib/features/shell/Icon.svelte';
	interface ShortcutItem {
		key: string;
		action: string;
		category: string;
	}

	const shortcuts: ShortcutItem[] = [
		{ key: '1 – 5', action: 'Switch Sidebar Panel (Media, Record, Templates, Effects, Text)', category: 'Navigation' },
		{ key: 'Space', action: 'Play / Pause Video Preview', category: 'Playback' },
		{ key: 'S', action: 'Split Clip at Current Playhead', category: 'Editing' },
		{ key: 'Delete / Backspace', action: 'Delete Selected Clip', category: 'Editing' },
		{ key: 'Ctrl + Z (Cmd + Z)', action: 'Undo Last Action', category: 'History' },
		{ key: 'Ctrl + Y (Cmd + Shift + Z)', action: 'Redo Last Action', category: 'History' },
		{ key: '← / →', action: 'Step Backward / Forward 1 Frame', category: 'Playback' },
		{ key: 'M', action: 'Toggle Master Mute', category: 'Audio' },
		{ key: '+ / -', action: 'Zoom Timeline In / Out', category: 'Timeline' }
	];
</script>

<div class="help-view-container">
	<div class="help-header">
		<div>
			<h1 class="help-title">Help & Documentation</h1>
			<p class="help-subtitle">Keyboard shortcuts, workflow guides, and RayShot creator community.</p>
		</div>

		<a
			href="https://discord.gg/z2mNFZYzW4"
			target="_blank"
			rel="noreferrer"
			class="btn-discord-join"
		>
			<Icon name="help" size={14} />
			<span>Join Discord Community</span>
		</a>
	</div>

	<div class="help-content-grid">
		<!-- Shortcuts Cheat Sheet -->
		<div class="help-card col-span-2">
			<h2 class="card-title">⚡ Keyboard Shortcuts Reference</h2>
			<div class="shortcuts-grid">
				{#each shortcuts as sc}
					<div class="shortcut-row">
						<span class="shortcut-desc">{sc.action}</span>
						<kbd class="shortcut-kbd">{sc.key}</kbd>
					</div>
				{/each}
			</div>
		</div>

		<!-- Quickstart Guide -->
		<div class="help-card">
			<h2 class="card-title">🎬 Getting Started</h2>
			<ol class="guide-steps-list">
				<li>
					<strong>1. Import Footage:</strong> Drag and drop video, audio, or image files onto the editor or click <em>Import</em> in the Media Library.
				</li>
				<li>
					<strong>2. Add to Timeline:</strong> Double-click any asset or click <em>Add to Timeline</em> to create a clip.
				</li>
				<li>
					<strong>3. Cut & Split:</strong> Move the playhead to any timestamp and press <kbd>S</kbd> to split.
				</li>
				<li>
					<strong>4. Export Video:</strong> Click the purple <em>Export Video</em> button in the top right to generate your final MP4/WebM.
				</li>
			</ol>
		</div>

		<!-- Community & Support -->
		<div class="help-card">
			<h2 class="card-title">💬 Community & Support</h2>
			<p class="text-xs text-on-surface-variant leading-relaxed">
				RayShot is open source and actively developed. Need help, want to suggest new features, or report a bug?
			</p>
			<div class="mt-4 flex flex-col gap-2">
				<a
					href="https://discord.gg/z2mNFZYzW4"
					target="_blank"
					rel="noreferrer"
					class="community-link-btn"
				>
					<span>💬 Discord Creator Server</span>
					<span class="text-xs text-primary font-mono">discord.gg/z2mNFZYzW4</span>
				</a>
				<a
					href="https://github.com/SoujanyaDasRoy/rayshot"
					target="_blank"
					rel="noreferrer"
					class="community-link-btn"
				>
					<span>🐙 GitHub Repository</span>
					<span class="text-xs text-secondary font-mono">github.com/SoujanyaDasRoy/rayshot</span>
				</a>
			</div>
		</div>
	</div>
</div>

<style>
	.help-view-container {
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

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--ms-material);
		padding-bottom: 16px;
	}

	.help-title {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0 0 4px 0;
	}

	.help-subtitle {
		font-size: 0.8rem;
		color: var(--ms-text-secondary);
		margin: 0;
	}

	.btn-discord-join {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: var(--ms-text);
		color: var(--ms-void);
		text-decoration: none;
		border-radius: 8px;
		padding: 8px 16px;
		font-size: 0.82rem;
		font-weight: 600;
		transition: all 0.15s ease;
		box-shadow: 0 2px 8px rgba(88, 101, 242, 0.3);
	}

	.btn-discord-join:hover {
		background: var(--ms-text);
		transform: translateY(-1px);
	}

	.help-content-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		max-width: 1000px;
	}

	.help-card {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 12px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.card-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0;
		border-bottom: 1px solid var(--ms-raised);
		padding-bottom: 10px;
	}

	.shortcuts-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 16px;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--ms-void);
		border: 1px solid var(--ms-raised);
		padding: 8px 12px;
		border-radius: 6px;
	}

	.shortcut-desc {
		font-size: 0.78rem;
		color: var(--ms-text-secondary);
	}

	.shortcut-kbd {
		background: var(--ms-raised);
		border: 1px solid var(--ms-edge-strong);
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 0.72rem;
		font-family: monospace;
		color: var(--ms-text);
		font-weight: 600;
	}

	.guide-steps-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 0.8rem;
		color: var(--ms-text-secondary);
	}

	.guide-steps-list strong {
		color: var(--ms-text);
	}

	.guide-steps-list kbd {
		background: var(--ms-raised);
		border: 1px solid var(--ms-edge-strong);
		border-radius: 3px;
		padding: 1px 4px;
		color: var(--ms-text);
	}

	.community-link-btn {
		display: flex;
		flex-direction: column;
		background: var(--ms-void);
		border: 1px solid var(--ms-raised);
		border-radius: 8px;
		padding: 10px 14px;
		text-decoration: none;
		color: var(--ms-text);
		font-size: 0.82rem;
		font-weight: 600;
		gap: 3px;
		transition: all 0.15s ease;
	}

	.community-link-btn:hover {
		background: var(--ms-material);
		border-color: var(--ms-edge-strong);
	}

	.col-span-2 {
		grid-column: span 2;
	}
</style>
