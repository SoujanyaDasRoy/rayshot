/**
 * Resample cached audio peaks down to the handful of bars a clip is wide
 * enough to actually show.
 *
 * Deliberately dependency-free (no store imports) so it stays unit-testable in
 * the node Vitest project, which cannot resolve bare `$lib/...` specifiers.
 * The caller owns looking peaks up and supplying a procedural fallback.
 */

/** Below this many bars a clip reads as noise, not a waveform. */
const MIN_BARS = 6;
/** Past this the bars are sub-pixel; more only costs DOM nodes. */
const MAX_BARS = 180;
/** One bar per ~3.5px keeps a visible gap between 2px bars. */
const PX_PER_BAR = 3.5;
/** Height used where there is no peak data to draw. */
const BASELINE = 0.2;

export function waveformBars(
	peaks: number[],
	sourceIn: number,
	sourceOut: number,
	assetDuration: number,
	widthPx: number
): number[] {
	const targetBars = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.floor(widthPx / PX_PER_BAR)));

	if (!peaks || peaks.length === 0) {
		return Array(targetBars).fill(BASELINE);
	}

	// A zero/absent duration would make every ratio NaN, so fall back to
	// showing the whole waveform rather than nothing.
	const duration = assetDuration > 0 ? assetDuration : 0;
	const startRatio = duration > 0 ? clamp01(sourceIn / duration) : 0;
	const endRatio = duration > 0 ? clamp01(sourceOut / duration) : 1;

	const startIdx = Math.floor(startRatio * peaks.length);
	// Always keep at least one source peak, so a zero-length or inverted
	// window still draws something instead of collapsing to an empty slice.
	const endIdx = Math.max(startIdx + 1, Math.ceil(endRatio * peaks.length));
	const sliced = peaks.slice(startIdx, endIdx);

	const bars: number[] = [];
	for (let i = 0; i < targetBars; i++) {
		const idx = Math.floor((i / targetBars) * sliced.length);
		const peak = sliced[idx];
		bars.push(Number.isFinite(peak) ? clamp01(peak) : BASELINE);
	}
	return bars;
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}
