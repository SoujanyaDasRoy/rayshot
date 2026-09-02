// Timeline navigation maths: pixel/time conversion, adaptive ruler ticks and
// anchor-preserving zoom.
//
// Dependency-free on purpose (pattern C) so the node test project can import it
// without resolving `$lib`, and so the numbers can be tested without a browser.

/** Pixels one second occupies at zoom 1. Matches the timeline's own scale. */
export const PX_PER_SECOND = 80;

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.0;

/** Below this, two labels touch and the ruler reads as noise. */
const MIN_MAJOR_PX = 72;
/** Below this, minor ticks stop being ticks and become a grey smear. */
const MIN_MINOR_PX = 14;

/**
 * A hard ceiling on ticks per render. A two-hour sequence at full zoom is ~1.7
 * million pixels wide; emitting a tick per step there stalls the browser before
 * it paints. The ruler coarsens instead.
 *
 * ponytail: a flat cap, not viewport virtualization. Swap for a visible-range
 * window if long sequences ever feel coarse in the middle of the timeline.
 */
export const MAX_TICKS = 1200;

/** The steps a ruler is allowed to land on, in seconds. */
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export function timeToPx(time: number, zoom: number): number {
	return time * PX_PER_SECOND * zoom;
}

export function pxToTime(px: number, zoom: number): number {
	return px / (PX_PER_SECOND * zoom);
}

export function clampZoom(zoom: number): number {
	if (!Number.isFinite(zoom)) return zoom > 0 ? MAX_ZOOM : MIN_ZOOM;
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export interface RulerStep {
	/** Seconds between labelled ticks. */
	major: number;
	/** Seconds between unlabelled ticks, or 0 when there is no room for them. */
	minor: number;
}

/** The coarsest ruler that still reads at this zoom. */
export function rulerStep(zoom: number): RulerStep {
	let major = STEPS[STEPS.length - 1];
	for (const step of STEPS) {
		if (timeToPx(step, zoom) >= MIN_MAJOR_PX) {
			major = step;
			break;
		}
	}

	let minor = 0;
	for (const divisor of [5, 2]) {
		if (timeToPx(major / divisor, zoom) >= MIN_MINOR_PX) {
			minor = major / divisor;
			break;
		}
	}

	return { major, minor };
}

export interface RulerTick {
	time: number;
	px: number;
	/** Null on minor ticks — they carry position, not a reading. */
	label: string | null;
}

export function rulerTicks(duration: number, zoom: number): RulerTick[] {
	const span = Math.max(0, duration);
	let { major, minor } = rulerStep(zoom);
	let ratio = minor > 0 ? Math.max(1, Math.round(major / minor)) : 1;

	// Coarsen until the tick count fits the budget: minors go first, then the
	// major step climbs the ladder.
	while (span / (major / ratio) + 1 > MAX_TICKS) {
		if (ratio > 1) {
			ratio = 1;
			continue;
		}
		const next = STEPS.find((step) => step > major);
		if (next === undefined) {
			major = Math.max(major, span / (MAX_TICKS - 1));
			break;
		}
		major = next;
	}

	const unit = major / ratio;
	const ticks: RulerTick[] = [];
	const count = Math.floor(span / unit);
	for (let i = 0; i <= count; i++) {
		const time = i * unit;
		ticks.push({
			time,
			px: timeToPx(time, zoom),
			label: i % ratio === 0 ? formatRulerLabel(time, major) : null
		});
	}
	return ticks;
}

/**
 * Scroll offset that keeps the moment under the cursor under the cursor while
 * the zoom changes. Without it, wheel-zoom walks the timeline away from
 * whatever you were looking at.
 */
export function zoomAtAnchor(
	nextZoom: number,
	currentZoom: number,
	scrollLeft: number,
	anchorX: number
): number {
	const timeUnderAnchor = pxToTime(scrollLeft + anchorX, currentZoom);
	return Math.max(0, timeToPx(timeUnderAnchor, nextZoom) - anchorX);
}

/** The zoom that puts the whole sequence on screen at once. */
export function fitZoom(duration: number, viewportWidth: number): number {
	if (duration <= 0) return MAX_ZOOM;
	return clampZoom(viewportWidth / (duration * PX_PER_SECOND));
}

export function formatRulerLabel(seconds: number, step: number): string {
	const total = Math.max(0, seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	const pad = (n: number) => Math.floor(n).toString().padStart(2, '0');

	// Tenths only where the ruler is fine enough to distinguish them.
	if (step < 1) {
		const tenths = secs.toFixed(1).padStart(4, '0');
		return hours > 0 ? `${hours}:${pad(minutes)}:${tenths}` : `${minutes}:${tenths}`;
	}
	if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
	return `${minutes}:${pad(secs)}`;
}
