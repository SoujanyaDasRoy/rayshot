/**
 * How a clip's timeline box maps onto its source media.
 *
 * Speed used to be stored twice: implicitly, as the ratio between a clip's
 * source span and its timeline length, and explicitly in `clip.playbackRate`.
 * Nothing kept the two equal, and `SetClipPlaybackRateCommand` changed only the
 * second — so the element played fast between syncs while every sync snapped it
 * back to a position computed from the first. Setting 2x produced stutter, not
 * speed.
 *
 * There is now one representation. Speed is derived, never stored, so the two
 * cannot disagree — not because we are careful, but because there is no second
 * number to go stale.
 *
 * Dependency-free and structurally typed (pattern C) so the maths is testable
 * in the node project without a Clip, a store or a browser.
 */

export interface ClipTiming {
	sourceIn: number;
	sourceOut: number;
	timelineStart: number;
	timelineDuration: number;
}

/**
 * Playback speed, derived from the box. 1 is real time, 2 is twice as fast.
 *
 * Falls back to 1 for degenerate clips: the alternative is Infinity or NaN
 * reaching HTMLMediaElement.playbackRate, which throws.
 */
export function clipRate(clip: ClipTiming): number {
	const sourceSpan = clip.sourceOut - clip.sourceIn;
	if (clip.timelineDuration <= 0 || sourceSpan <= 0) return 1;
	return sourceSpan / clip.timelineDuration;
}

/** The timeline length a source span needs in order to play at `rate`. */
export function timelineDurationForRate(
	sourceIn: number,
	sourceOut: number,
	rate: number
): number {
	const sourceSpan = sourceOut - sourceIn;
	if (!(rate > 0) || !Number.isFinite(rate)) return sourceSpan;
	return sourceSpan / rate;
}

/**
 * Where in the source media a timeline moment lands.
 *
 * This was duplicated byte-for-byte in Canvas.svelte and Export.svelte. Two
 * copies of the mapping is how a preview and its exported file drift apart.
 */
export function sourceTimeAt(clip: ClipTiming, timelineTime: number): number {
	if (clip.timelineDuration <= 0) return clip.sourceIn;
	const offset = timelineTime - clip.timelineStart;
	const sourceSpan = clip.sourceOut - clip.sourceIn;
	return clip.sourceIn + (offset / clip.timelineDuration) * sourceSpan;
}
