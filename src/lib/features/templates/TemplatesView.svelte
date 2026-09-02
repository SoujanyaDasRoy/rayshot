<script lang="ts">
	import Icon from '$lib/features/shell/Icon.svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { timelineStore } from '$lib/stores/timeline.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { AddClipCommand } from '$lib/core/commands/addClip';
	import { thumbnailCache, placeholderThumbnail, addAsset } from '$lib/utils/mediaUtils';
	import { get } from 'svelte/store';
	import type { MediaAsset } from '$lib/types/project';

	let activeCategory = $state<'all' | 'youtube' | 'social' | 'podcast' | 'cinematic'>('all');
	let toastMessage = $state<string | null>(null);

	interface VideoTemplate {
		id: string;
		name: string;
		category: 'youtube' | 'social' | 'podcast' | 'cinematic';
		aspectRatio: string;
		duration: number;
		description: string;
		gradient: string;
		badge: string;
	}

	const templates: VideoTemplate[] = [
		{
			id: 'tmpl-yt-endscreen',
			name: 'YouTube End Screen Subscribe',
			category: 'youtube',
			aspectRatio: '16:9',
			duration: 10.0,
			description: 'Dynamic subscribe circle + 2 video recommendation placeholders with animated progress bar.',
			gradient: 'linear-gradient(135deg, var(--ms-raised), var(--ms-raised))',
			badge: 'YouTube'
		},
		{
			id: 'tmpl-tiktok-split',
			name: 'TikTok / Reels Viral Split-Screen',
			category: 'social',
			aspectRatio: '9:16',
			duration: 15.0,
			description: '50/50 dual split-screen layout with centered bold caption banner.',
			gradient: 'linear-gradient(135deg, var(--ms-raised), var(--ms-edge-strong))',
			badge: '9:16 Shorts'
		},
		{
			id: 'tmpl-podcast-intro',
			name: 'Podcast Host & Guest Lower-Third',
			category: 'podcast',
			aspectRatio: '16:9',
			duration: 8.0,
			description: 'Clean broadcast layout with waveform graphic, guest handle, and topic tag.',
			gradient: 'linear-gradient(135deg, var(--ms-raised), var(--ms-edge-strong))',
			badge: 'Podcast'
		},
		{
			id: 'tmpl-cinematic-letterbox',
			name: 'Cinematic 2.39:1 Anamorphic Intro',
			category: 'cinematic',
			aspectRatio: '2.39:1',
			duration: 6.0,
			description: 'Deep anamorphic bars with centered minimalist gold typography and subtle vignette.',
			gradient: 'linear-gradient(135deg, var(--ms-raised), var(--ms-edge-strong))',
			badge: 'Cinematic'
		},
		{
			id: 'tmpl-social-quote',
			name: 'Social Media Key Takeaway Quote',
			category: 'social',
			aspectRatio: '1:1',
			duration: 7.0,
			description: 'High-contrast square format for Instagram & LinkedIn with bold quotation highlights.',
			gradient: 'linear-gradient(135deg, var(--ms-raised), var(--ms-edge-strong))',
			badge: '1:1 Square'
		},
		{
			id: 'tmpl-product-hero',
			name: 'SaaS Product Feature Showcase',
			category: 'youtube',
			aspectRatio: '16:9',
			duration: 12.0,
			description: 'Mac window container mockup with title, callout arrows, and CTA badge.',
			gradient: 'linear-gradient(135deg, var(--ms-void), var(--ms-raised))',
			badge: 'Product'
		}
	];

	const filteredTemplates = $derived.by(() => {
		if (activeCategory === 'all') return templates;
		return templates.filter((t) => t.category === activeCategory);
	});

	function showToast(msg: string) {
		toastMessage = msg;
		setTimeout(() => (toastMessage = null), 2500);
	}

	async function applyTemplate(tmpl: VideoTemplate) {
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 1080;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Draw aesthetic template graphic
		const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
		grad.addColorStop(0, 'var(--ms-void)');
		grad.addColorStop(1, 'var(--ms-edge)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 1920, 1080);

		ctx.fillStyle = 'var(--ms-text)';
		ctx.fillRect(160, 200, 8, 120);

		ctx.font = 'bold 64px system-ui, sans-serif';
		ctx.fillStyle = 'var(--ms-text)';
		ctx.fillText(tmpl.name.toUpperCase(), 190, 260);

		ctx.font = '32px system-ui, sans-serif';
		ctx.fillStyle = 'var(--ms-text-secondary)';
		ctx.fillText(tmpl.description.slice(0, 60) + '...', 190, 310);

		const dataUrl = canvas.toDataURL('image/png');
		const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || new Blob()), 'image/png'));

		const assetId = crypto.randomUUID();
		const mediaAsset: MediaAsset = {
			id: assetId,
			filename: `${tmpl.name.replace(/\s+/g, '_')}.png`,
			type: 'image',
			duration: tmpl.duration,
			width: 1920,
			height: 1080,
			mimeType: 'image/png',
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			sourceBlob: blob
		};

		addAsset(mediaAsset);

		thumbnailCache.set(assetId, dataUrl);

		const project = get(projectStore);
		if (project && project.activeSequenceId) {
			const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
			if (sequence && sequence.tracks.length > 0) {
				const track = sequence.tracks[0];
				const playheadTime = get(playbackStore).currentTime;
				const addCmd = new AddClipCommand({
					mediaAssetId: assetId,
					trackId: track.id,
					position: playheadTime
				});
				commandProcessor.execute(addCmd);
			}
		}

		showToast(`Applied "${tmpl.name}" template to project!`);
	}
</script>

<div class="templates-view-container">
	<div class="templates-header">
		<div>
			<h1 class="templates-title">Creative Video Templates</h1>
			<p class="templates-subtitle">Ready-made layouts for YouTube, TikTok, Podcasts, and Cinematic productions.</p>
		</div>

		<!-- Category Filter Pills -->
		<div class="category-pills-row">
			<button
				type="button"
				class="cat-pill"
				class:active={activeCategory === 'all'}
				onclick={() => (activeCategory = 'all')}
			>
				All
			</button>
			<button
				type="button"
				class="cat-pill"
				class:active={activeCategory === 'youtube'}
				onclick={() => (activeCategory = 'youtube')}
			>
				YouTube
			</button>
			<button
				type="button"
				class="cat-pill"
				class:active={activeCategory === 'social'}
				onclick={() => (activeCategory = 'social')}
			>
				Shorts & Reels
			</button>
			<button
				type="button"
				class="cat-pill"
				class:active={activeCategory === 'podcast'}
				onclick={() => (activeCategory = 'podcast')}
			>
				Podcast
			</button>
			<button
				type="button"
				class="cat-pill"
				class:active={activeCategory === 'cinematic'}
				onclick={() => (activeCategory = 'cinematic')}
			>
				Cinematic
			</button>
		</div>
	</div>

	{#if toastMessage}
		<div class="toast-popup">
			<span>{toastMessage}</span>
		</div>
	{/if}

	<!-- Templates Grid -->
	<div class="templates-grid">
		{#each filteredTemplates as tmpl (tmpl.id)}
			<div class="template-card">
				<div class="template-preview-box" style="background: {tmpl.gradient};">
					<div class="mockup-frame">
						<span class="mock-badge">{tmpl.badge}</span>
						<span class="mock-title">{tmpl.name}</span>
						<span class="mock-dur font-mono">{tmpl.duration.toFixed(0)}s • {tmpl.aspectRatio}</span>
					</div>
				</div>

				<div class="template-info-box">
					<div class="template-meta-row">
						<h3 class="template-name">{tmpl.name}</h3>
						<span class="aspect-badge">{tmpl.aspectRatio}</span>
					</div>
					<p class="template-desc">{tmpl.description}</p>

					<button
						type="button"
						class="btn-apply-template"
						onclick={() => applyTemplate(tmpl)}
					>
						<Icon name="templates" size={14} />
						<span>Use Template</span>
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.templates-view-container {
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

	.templates-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		border-bottom: 1px solid var(--ms-material);
		padding-bottom: 16px;
		gap: 16px;
	}

	.templates-title {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0 0 4px 0;
	}

	.templates-subtitle {
		font-size: 0.8rem;
		color: var(--ms-text-secondary);
		margin: 0;
	}

	.category-pills-row {
		display: flex;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 8px;
		padding: 4px;
		gap: 4px;
	}

	.cat-pill {
		padding: 6px 14px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--ms-text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cat-pill.active {
		background: var(--ms-text);
		color: var(--ms-void);
		box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
	}

	.templates-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}

	@media (max-width: 1100px) {
		.templates-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.template-card {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: all 0.2s ease;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}

	.template-card:hover {
		border-color: var(--ms-edge-strong);
		transform: translateY(-3px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}

	.template-preview-box {
		width: 100%;
		aspect-ratio: 16 / 9;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		box-sizing: border-box;
		position: relative;
	}

	.mockup-frame {
		width: 100%;
		height: 100%;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(6px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 12px;
		box-sizing: border-box;
		gap: 6px;
	}

	.mock-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.12);
		padding: 2px 8px;
		border-radius: 20px;
		color: var(--ms-text-secondary);
	}

	.mock-title {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--ms-text);
		text-align: center;
	}

	.mock-dur {
		font-size: 0.7rem;
		color: var(--ms-text-secondary);
	}

	.template-info-box {
		padding: 16px;
		display: flex;
		flex-direction: column;
		flex: 1;
		gap: 8px;
	}

	.template-meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.template-name {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--ms-text);
		margin: 0;
	}

	.aspect-badge {
		font-size: 0.68rem;
		font-weight: 700;
		background: var(--ms-raised);
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text);
		padding: 2px 6px;
		border-radius: 4px;
	}

	.template-desc {
		font-size: 0.78rem;
		color: var(--ms-text-secondary);
		line-height: 1.4;
		margin: 0;
		flex: 1;
	}

	.btn-apply-template {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: var(--ms-text);
		color: var(--ms-void);
		border: none;
		border-radius: 6px;
		padding: 8px 14px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 8px;
		transition: all 0.15s ease;
	}

	.btn-apply-template:hover {
		background: var(--ms-text);
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
