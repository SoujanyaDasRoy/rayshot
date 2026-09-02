<script lang="ts">
	import { addPoint, movePoint, removePoint, curveToPath, IDENTITY_CURVE, type CurvePoint } from '$lib/core/rendering/curveEditing';

	let {
		points = IDENTITY_CURVE,
		onChange
	}: {
		points?: CurvePoint[];
		onChange: (next: CurvePoint[]) => void;
	} = $props();

	const SIZE = 220;
	let svgEl = $state<SVGSVGElement | null>(null);
	let dragging = $state<number | null>(null);

	function toCurveSpace(event: MouseEvent): CurvePoint {
		const rect = svgEl!.getBoundingClientRect();
		return [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
	}

	function handleBackgroundClick(event: MouseEvent) {
		if (dragging !== null) return;
		onChange(addPoint(points, toCurveSpace(event)));
	}

	function startDrag(index: number, event: MouseEvent) {
		event.stopPropagation();
		// Alt-click removes, matching how curve editors usually work.
		if (event.altKey) {
			onChange(removePoint(points, index));
			return;
		}
		dragging = index;
	}

	function handleMove(event: MouseEvent) {
		if (dragging === null) return;
		onChange(movePoint(points, dragging, toCurveSpace(event)));
	}
</script>

<svelte:window onmouseup={() => (dragging = null)} onmousemove={handleMove} />

<div class="curve-editor">
	<!-- The wrapper is the control surface; the svg just draws. Clicking the
	     plot adds a point, so the interactivity belongs on an element that is
	     allowed to have it. -->
	<button type="button" class="curve-surface" onmousedown={handleBackgroundClick} aria-label="Tone curve: click to add a point">
	<svg bind:this={svgEl} class="curve-svg" viewBox="0 0 {SIZE} {SIZE}" aria-hidden="true">
		<!-- Quarter grid: the reference an eye needs to judge a curve's shape. -->
		{#each [0.25, 0.5, 0.75] as t (t)}
			<line x1={t * SIZE} y1="0" x2={t * SIZE} y2={SIZE} class="grid-line" />
			<line x1="0" y1={t * SIZE} x2={SIZE} y2={t * SIZE} class="grid-line" />
		{/each}
		<line x1="0" y1={SIZE} x2={SIZE} y2="0" class="identity-line" />

		<path d={curveToPath(points, SIZE, SIZE)} class="curve-path" />

		<!-- Drag handles inside the surface above, not separate controls. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{#each points as point, i (i)}
			<circle
				cx={point[0] * SIZE}
				cy={(1 - point[1]) * SIZE}
				r="5"
				class="curve-point"
				class:active={dragging === i}
				onmousedown={(e) => startDrag(i, e)}
			/>
		{/each}
	</svg>
	</button>

	<p class="curve-hint">Click to add a point. Alt-click a point to remove it.</p>
</div>

<style>
	.curve-editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
	}

	.curve-surface {
		display: block;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		cursor: crosshair;
	}

	.curve-surface:focus-visible {
		outline: 2px solid var(--ms-text);
		outline-offset: 2px;
	}

	.curve-svg {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius);
		background: var(--ms-void);
		cursor: crosshair;
	}

	.grid-line {
		stroke: var(--ms-edge);
		stroke-width: 1;
	}

	.identity-line {
		stroke: var(--ms-edge-strong);
		stroke-width: 1;
		stroke-dasharray: 3 4;
	}

	.curve-path {
		fill: none;
		stroke: var(--ms-text);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.curve-point {
		fill: var(--ms-void);
		stroke: var(--ms-text);
		stroke-width: 2;
		cursor: grab;
	}

	.curve-point:hover,
	.curve-point.active {
		fill: var(--ms-text);
	}

	.curve-hint {
		margin: 0;
		font-family: var(--ms-font);
		font-size: 11px;
		color: var(--ms-text-tertiary);
	}
</style>
