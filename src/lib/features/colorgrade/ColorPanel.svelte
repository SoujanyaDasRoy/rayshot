<script lang="ts">
	import type { Clip } from '$lib/types/project';
	import ColorGradePanel from './ColorGradePanel.svelte';
	import CurveEditor from './CurveEditor.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { SetColorGradeCommand } from '$lib/core/commands/setColorGrade';
	import { IDENTITY_CURVE, type CurvePoint } from '$lib/core/rendering/curveEditing';

	let { clip }: { clip: Clip } = $props();

	type TabId = 'primaries' | 'curves';
	const TABS: { id: TabId; label: string }[] = [
		{ id: 'primaries', label: 'Primaries' },
		{ id: 'curves', label: 'Curves' }
	];

	let activeTab = $state<TabId>('primaries');
	type Channel = 'lum' | 'r' | 'g' | 'b';
	const CHANNELS: { id: Channel; label: string }[] = [
		{ id: 'lum', label: 'Luma' },
		{ id: 'r', label: 'R' },
		{ id: 'g', label: 'G' },
		{ id: 'b', label: 'B' }
	];
	let activeChannel = $state<Channel>('lum');

	const curves = $derived(clip.colorGrade?.curves);
	const activePoints = $derived(
		(curves?.[activeChannel] as CurvePoint[] | undefined) ?? IDENTITY_CURVE
	);

	function updateCurve(next: CurvePoint[]) {
		const base = curves ?? {
			r: IDENTITY_CURVE,
			g: IDENTITY_CURVE,
			b: IDENTITY_CURVE,
			lum: IDENTITY_CURVE
		};
		commandProcessor.execute(
			new SetColorGradeCommand({
				clipId: clip.id,
				propertyName: 'curves',
				value: { ...base, [activeChannel]: next } as Clip['colorGrade']['curves']
			})
		);
	}
</script>

<div class="color-panel">
	<div class="tabs" role="tablist" aria-label="Colour tools">
		{#each TABS as tab (tab.id)}
			<button
				type="button"
				class="tab"
				class:active={activeTab === tab.id}
				role="tab"
				aria-selected={activeTab === tab.id}
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'primaries'}
		<ColorGradePanel {clip} onChange={() => {}} />
	{:else}
		<div class="channel-row" role="tablist" aria-label="Curve channel">
			{#each CHANNELS as channel (channel.id)}
				<button
					type="button"
					class="channel"
					class:active={activeChannel === channel.id}
					role="tab"
					aria-selected={activeChannel === channel.id}
					onclick={() => (activeChannel = channel.id)}
				>
					{channel.label}
				</button>
			{/each}
		</div>
		<CurveEditor points={activePoints} onChange={updateCurve} />
	{/if}
</div>

<style>
	.color-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
		font-family: var(--ms-font);
	}

	.tabs {
		display: flex;
		gap: 2px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ms-edge);
	}

	.tab {
		flex: 1;
		height: 26px;
		border: none;
		border-radius: var(--ms-radius);
		background: transparent;
		color: var(--ms-text-tertiary);
		font-family: inherit;
		font-size: 12px;
		font-weight: 590;
		cursor: pointer;
		transition:
			background var(--ms-fast) var(--ms-ease),
			color var(--ms-fast) var(--ms-ease);
	}

	.tab:hover:not(.active) {
		background: var(--ms-hover);
		color: var(--ms-text-secondary);
	}

	.tab.active {
		background: var(--ms-selected);
		box-shadow: inset 0 1px 0 var(--ms-edge-lit);
		color: var(--ms-text);
	}

	.channel-row {
		display: flex;
		gap: 4px;
		padding: 10px 12px 0;
	}

	.channel {
		flex: 1;
		height: 22px;
		border: 1px solid var(--ms-edge);
		border-radius: 999px;
		background: transparent;
		color: var(--ms-text-tertiary);
		font-family: var(--ms-font-mono);
		font-size: 10.5px;
		cursor: pointer;
	}

	.channel.active {
		background: var(--ms-selected);
		border-color: var(--ms-edge-strong);
		color: var(--ms-text);
	}
</style>
