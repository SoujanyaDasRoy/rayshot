<script lang="ts">
	import { timelineActions, timelineStore } from '$lib/stores/timeline.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import Clip from './Clip.svelte';
	import { type Track, type Clip as ClipType } from '$lib/types/project';
	import { derived } from 'svelte/store';
	import { projectStore } from '$lib/stores/project.svelte';

	let {
		track,
		onClipAdd = (_d: { mediaAssetId: string; position: number }) => {},
		onClipMove = (_d: unknown) => {}
	} = $props<{
		track: Track;
		onClipAdd?: (d: { mediaAssetId: string; position: number }) => void;
		onClipMove?: (d: unknown) => void;
	}>();

	const clips = derived(projectStore, ($project) => $project?.clips ?? new Map());

	let draggingClipId = $state<string | null>(null);

	const SNAP_THRESHOLD = 10;
	const EDGE_SENSITIVITY = 4;

	function timeToPixels(time: number, zoomLevel: number, timeOffset: number): number {
		return (time - timeOffset) * (100 * zoomLevel);
	}

	function pixelsToTime(pixels: number, zoomLevel: number, timeOffset: number): number {
		return timeOffset + pixels / (100 * zoomLevel);
	}

	function calculateSnappingTargets(excludeClipId: string | null = null): {
		edges: number[];
		playhead: number;
	} {
		const edges: number[] = [];
		const project = $projectStore;
		if (project) {
			const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
			if (sequence) {
				for (const t of sequence.tracks) {
					for (const clipId of t.clipInstances) {
						if (excludeClipId && clipId === excludeClipId) continue;
						const clip = $clips.get(clipId);
						if (clip) {
							edges.push(clip.timelineStart);
							edges.push(clip.timelineStart + clip.timelineDuration);
						}
					}
				}
			}
		}
		const playhead = $playbackStore.currentTime;
		return { edges, playhead };
	}

	function findSnapTarget(
		positionTime: number,
		targets: { edges: number[]; playhead: number }
	): number | null {
		const { edges, playhead } = targets;
		let closest: number | null = null;
		let closestDist = Infinity;

		for (const edge of edges) {
			const dist = Math.abs(positionTime - edge);
			if (dist < closestDist && dist <= SNAP_THRESHOLD / (100 * $timelineStore.zoomLevel)) {
				closestDist = dist;
				closest = edge;
			}
		}

		const playheadDist = Math.abs(positionTime - playhead);
		if (
			playheadDist < closestDist &&
			playheadDist <= SNAP_THRESHOLD / (100 * $timelineStore.zoomLevel)
		) {
			closest = playhead;
		}

		return closest;
	}

	function handleClipMousedown(event: MouseEvent, clipId: string) {
		event.stopPropagation();
		const clip = $clips.get(clipId);
		if (!clip) return;
		draggingClipId = clipId;
		timelineActions.selectClip(clipId);
		void onClipMove;
		void timeToPixels;
		void pixelsToTime;
		void findSnapTarget;
		void calculateSnappingTargets;
		void EDGE_SENSITIVITY;
	}
</script>

<div class="track" data-track-id={track.id}>
	<div class="track-header">
		<div class="track-type">{track.type === 'video' ? 'Video' : 'Audio'}</div>
	</div>
	<div class="track-clips">
		{#each track.clipInstances as clipId}
			{#if $clips.has(clipId)}
				{@const clip = $clips.get(clipId)! as ClipType}
				<Clip
					{clip}
					trackType={track.type}
					left={0}
					width={0}
					onMousedown={(e) => handleClipMousedown(e, clip.id)}
					onTouchstart={(e) => handleClipMousedown(e as unknown as MouseEvent, clip.id)}
				/>
			{/if}
		{/each}

		<div
			class="clip-placeholder"
			data-track-id={track.id}
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => {
				e.preventDefault();
				const mediaAssetId = e.dataTransfer?.getData('text/plain');
				if (mediaAssetId) onClipAdd({ mediaAssetId, position: 0 });
			}}
			role="region"
			aria-label="Drop area for adding clips"
		>
			[+ Add Media]
		</div>
	</div>
</div>

<style>
	.track {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid #404040;
		min-height: 40px;
	}

	.track-header {
		width: 60px;
		background-color: #252525;
		padding: 0.5rem;
		font-size: 0.75rem;
		color: #808080;
		border-right: 1px solid #404040;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.track-clips {
		position: relative;
		flex: 1;
		overflow: hidden;
		background-color: #1a1a1a;
	}
</style>
