<script lang="ts">
	import { commandProcessor } from '$lib/core/commands/processor';
	import { SetTransformCommand } from '$lib/core/commands/setTransform';
	import {
		getTransformCorners,
		moveDeltaToNative,
		scaleFromPointer,
		rotationFromPointer,
		snapAngle,
		type Point
	} from '$lib/core/rendering/transformHandles';
	import type { Clip } from '$lib/types/project';

	let {
		clip,
		sequenceWidth,
		sequenceHeight,
		stageEl,
		interactive = true
	}: {
		clip: Clip;
		sequenceWidth: number;
		sequenceHeight: number;
		stageEl: HTMLElement;
		interactive?: boolean;
	} = $props();

	/**
	 * Renders to `<body>`, not inside the viewer stage.
	 *
	 * The stage clips its own content at the frame edge on purpose (that is
	 * what a 16:9 crop means), and its parent in +page.svelte clips again for
	 * the same reason the transport row stays put. The rotate handle floats
	 * above the box, which is exactly the region those two ancestors exist to
	 * hide. `position: fixed` is the one thing that ignores both without
	 * needing to touch either — it is clipped only by the viewport itself.
	 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	let stageRect = $state<DOMRect | null>(null);

	function measure() {
		stageRect = stageEl?.getBoundingClientRect() ?? null;
	}

	$effect(() => {
		if (!stageEl) return;
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(stageEl);
		// The stage can move without changing size — a panel opening beside
		// it, say — so position (not just size) needs its own listener.
		window.addEventListener('scroll', measure, true);
		window.addEventListener('resize', measure);
		return () => {
			ro.disconnect();
			window.removeEventListener('scroll', measure, true);
			window.removeEventListener('resize', measure);
		};
	});

	const corners = $derived(
		stageRect
			? getTransformCorners(clip, stageRect.width, stageRect.height, sequenceWidth, sequenceHeight)
			: null
	);

	type DragKind = 'move' | 'scale' | 'rotate';
	let dragKind = $state<DragKind | null>(null);
	let dragStart = { x: 0, y: 0 };
	let dragOriginTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

	function applyTransform(next: Partial<Clip['transform']>) {
		commandProcessor.execute(
			new SetTransformCommand({
				clipId: clip.id,
				transform: { ...dragOriginTransform, ...clip.transform, ...next }
			})
		);
	}

	function beginDrag(event: MouseEvent, kind: DragKind) {
		if (!interactive) return;
		event.preventDefault();
		event.stopPropagation();
		dragKind = kind;
		dragStart = { x: event.clientX, y: event.clientY };
		dragOriginTransform = {
			x: clip.transform?.x ?? 0,
			y: clip.transform?.y ?? 0,
			scale: clip.transform?.scale ?? 1,
			rotation: clip.transform?.rotation ?? 0
		};
	}

	function onWindowMousemove(event: MouseEvent) {
		if (!dragKind || !stageRect) return;
		const pointer: Point = { x: event.clientX, y: event.clientY };

		if (dragKind === 'move') {
			const { dx, dy } = moveDeltaToNative(
				event.clientX - dragStart.x,
				event.clientY - dragStart.y,
				stageRect.width,
				stageRect.height,
				sequenceWidth,
				sequenceHeight
			);
			applyTransform({ x: dragOriginTransform.x + dx, y: dragOriginTransform.y + dy });
			return;
		}

		if (!corners) return;

		// Scale and rotate are both anchored on the box's own centre in
		// screen space. Read from the live `corners` derivation, not cached
		// at drag-start, so a panel resizing mid-drag cannot leave the
		// anchor pointing at a centre that no longer exists — x/y do not
		// change during a scale or rotate drag, so this is exactly the
		// drag-start centre except when the stage itself has moved.
		const center: Point = {
			x: stageRect.left + corners.center.x,
			y: stageRect.top + corners.center.y
		};

		if (dragKind === 'scale') {
			const scale = scaleFromPointer(center, dragStart, pointer, dragOriginTransform.scale);
			applyTransform({ scale });
		} else {
			const raw = rotationFromPointer(center, pointer);
			applyTransform({ rotation: snapAngle(raw, 15, 4) });
		}
	}

	function onWindowMouseup() {
		dragKind = null;
	}

	$effect(() => {
		window.addEventListener('mousemove', onWindowMousemove);
		window.addEventListener('mouseup', onWindowMouseup);
		return () => {
			window.removeEventListener('mousemove', onWindowMousemove);
			window.removeEventListener('mouseup', onWindowMouseup);
		};
	});
</script>

{#if stageRect && corners}
	<div
		class="transform-overlay-root"
		use:portal
		style="left: {stageRect.left}px; top: {stageRect.top}px; width: {stageRect.width}px; height: {stageRect.height}px;"
	>
		<svg class="transform-overlay-svg" width={stageRect.width} height={stageRect.height}>
			<polygon
				class="transform-box"
				class:locked={!interactive}
				points="{corners.tl.x},{corners.tl.y} {corners.tr.x},{corners.tr.y} {corners.br.x},{corners.br.y} {corners.bl.x},{corners.bl.y}"
				fill="transparent"
				pointer-events={interactive ? 'fill' : 'none'}
				onmousedown={(e) => beginDrag(e, 'move')}
				role="presentation"
			/>

			{#if interactive}
				<line
					x1={(corners.tl.x + corners.tr.x) / 2}
					y1={(corners.tl.y + corners.tr.y) / 2}
					x2={corners.rotateHandle.x}
					y2={corners.rotateHandle.y}
					class="rotate-stem"
				/>

				{#each [corners.tl, corners.tr, corners.br, corners.bl] as corner, i (i)}
					<!-- A larger transparent circle underneath widens the grab
					     target without making the visible dot look oversized. -->
					<circle
						cx={corner.x}
						cy={corner.y}
						r="13"
						class="handle-hit-area"
						onmousedown={(e) => beginDrag(e, 'scale')}
						role="presentation"
						aria-hidden="true"
					/>
					<circle
						cx={corner.x}
						cy={corner.y}
						r="6.5"
						class="scale-handle"
						onmousedown={(e) => beginDrag(e, 'scale')}
						role="slider"
						tabindex="-1"
						aria-label="Resize"
						aria-valuenow={Math.round((clip.transform?.scale ?? 1) * 100)}
					/>
				{/each}

				<circle
					cx={corners.rotateHandle.x}
					cy={corners.rotateHandle.y}
					r="13"
					class="handle-hit-area"
					onmousedown={(e) => beginDrag(e, 'rotate')}
					role="presentation"
					aria-hidden="true"
				/>
				<circle
					cx={corners.rotateHandle.x}
					cy={corners.rotateHandle.y}
					r="7"
					class="rotate-handle"
					onmousedown={(e) => beginDrag(e, 'rotate')}
					role="slider"
					tabindex="-1"
					aria-label="Rotate"
					aria-valuenow={Math.round(clip.transform?.rotation ?? 0)}
				/>
			{/if}
		</svg>
	</div>
{/if}

<style>
	/* Monochrome, matching the rest of the chrome — the handles are tools,
	   not user data, so they get no colour of their own. */
	.transform-overlay-root {
		position: fixed;
		z-index: 400;
		pointer-events: none;
	}

	.transform-overlay-svg {
		display: block;
		overflow: visible;
	}

	/* A dark halo behind the white stroke, so the box reads against bright
	   or white footage as reliably as it does against dark footage — a
	   plain white line disappears exactly on the content it would most
	   need to outline. */
	.transform-box {
		stroke: #ffffff;
		stroke-width: 2;
		cursor: move;
		filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9));
	}

	.transform-box.locked {
		stroke: rgba(255, 255, 255, 0.6);
		stroke-dasharray: 5 4;
	}

	.rotate-stem {
		stroke: #ffffff;
		stroke-width: 1.5;
		opacity: 0.85;
		filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.9));
	}

	.handle-hit-area {
		fill: transparent;
		pointer-events: fill;
	}

	.scale-handle {
		fill: #ffffff;
		stroke: #000000;
		stroke-width: 1.5;
		cursor: nwse-resize;
		pointer-events: fill;
	}

	.rotate-handle {
		fill: #ffffff;
		stroke: #000000;
		stroke-width: 1.5;
		cursor: grab;
		pointer-events: fill;
	}

	.rotate-handle:active {
		cursor: grabbing;
	}
</style>
