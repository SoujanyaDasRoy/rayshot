<script lang="ts">
	let { side, onDrag } = $props<{
		side: 'start' | 'end';
		onDrag: (dx: number) => void;
	}>();

	let dragging = $state(false);
	let startX = 0;

	function handleMouseDown(event: MouseEvent) {
		dragging = true;
		startX = event.clientX;
		event.preventDefault();
	}

	function handleMouseMove(event: MouseEvent) {
		if (!dragging) return;
		const dx = event.clientX - startX;
		onDrag(dx);
	}

	function handleMouseUp() {
		dragging = false;
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length === 1) {
			dragging = true;
			startX = event.touches[0].clientX;
			event.preventDefault();
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (!dragging) return;
		const dx = event.touches[0].clientX - startX;
		onDrag(dx);
	}

	function handleTouchEnd() {
		dragging = false;
	}

	function handleKeyDown(event: KeyboardEvent) {
		const step = 5;
		if (event.key === 'ArrowLeft') {
			onDrag(-step);
			event.preventDefault();
		} else if (event.key === 'ArrowRight') {
			onDrag(step);
			event.preventDefault();
		}
	}
</script>

<div
	class="trim-handle"
	class:dragging={dragging}
	tabindex="0"
	role="button"
	aria-label={side === 'start' ? 'Trim start' : 'Trim end'}
	onmousedown={handleMouseDown}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	onmouseup={handleMouseUp}
	onmouseleave={handleMouseUp}
	onkeydown={handleKeyDown}
>
	<div class="handle-gripper"></div>
</div>

<style>
	.trim-handle {
		position: relative;
		width: 8px;
		height: 100%;
		background-color: transparent;
		cursor: ew-resize;
		touch-action: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.trim-handle.dragging {
		background-color: rgba(99, 102, 241, 0.2);
	}

	.handle-gripper {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 4px;
		height: 24px;
		background-color: #6366f1;
		transform: translate(-50%, -50%);
		border-radius: 2px;
	}

	.trim-handle:hover .handle-gripper {
		width: 6px;
	}
</style>
