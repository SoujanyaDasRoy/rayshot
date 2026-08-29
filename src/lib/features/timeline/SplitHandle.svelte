<script lang="ts">
	let { onClick, active = false } = $props<{
		onClick?: () => void;
		active?: boolean;
	}>();

	function handleClick() {
		onClick?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onClick?.();
		}
	}
</script>

<div
	class="split-handle"
	class:active={active}
	tabindex="0"
	onclick={handleClick}
	onkeydown={handleKeydown}
	role="button"
	aria-label="Split clip at playhead"
>
	<div class="handle-line"></div>
	{#if active}
		<div class="handle-dot"></div>
	{/if}
</div>

<style>
	.split-handle {
		position: relative;
		width: 4px;
		height: 100%;
		cursor: pointer;
		user-select: none;
		transition: background-color 0.2s ease;
	}

	.split-handle:not(.active) {
		background-color: rgba(255, 255, 255, 0.3);
	}

	.split-handle.active {
		background-color: rgba(255, 255, 255, 0.6);
	}

	.handle-line {
		position: absolute;
		top: 0;
		left: 50%;
		width: 2px;
		height: 100%;
		background-color: white;
		transform: translateX(-50%);
	}

	.handle-dot {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 8px;
		height: 8px;
		background-color: #ff6b6b;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.4);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(255, 107, 107, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
		}
	}

	.split-handle:focus-visible {
		outline: 2px solid #ff6b6b;
		outline-offset: 2px;
	}
</style>
