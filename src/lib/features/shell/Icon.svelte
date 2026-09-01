<script lang="ts">
	import { ICONS, SOLID_PAINT, type IconName } from './icons';

	let {
		name,
		size = 18,
		selected = false,
		class: className = ''
	}: {
		name: IconName;
		size?: number;
		selected?: boolean;
		class?: string;
	} = $props();

	const glyph = $derived(ICONS[name]);
	const fillsIn = $derived(SOLID_PAINT[name] === 'fill');
</script>

<svg
	class="icon {className}"
	class:selected
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	aria-hidden="true"
	focusable="false"
>
	<!-- Resting form -->
	<g class="resting" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
		{@html glyph.outline}
	</g>
	<!-- Selected form: fills in, or gains weight when there is nothing to fill -->
	<g
		class="chosen"
		fill={fillsIn ? 'currentColor' : 'none'}
		stroke="currentColor"
		stroke-width={fillsIn ? 0 : 2.3}
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		{@html glyph.solid}
	</g>
</svg>

<style>
	.icon {
		display: block;
		flex-shrink: 0;
	}

	.resting,
	.chosen {
		transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.chosen {
		opacity: 0;
	}

	.icon.selected .resting {
		opacity: 0;
	}

	.icon.selected .chosen {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.resting,
		.chosen {
			transition: none;
		}
	}
</style>
