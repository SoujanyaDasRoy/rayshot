/**
 * Silence Detection Engine
 * Analyzes audio waveforms or raw AudioBuffer data to find silence segments
 * (e.g. dead air, pauses in speech) for auto-cut / clean-up suggestions.
 */

export interface SilentSegment {
	start: number;
	end: number;
	duration: number;
}

export interface SilenceDetectionOptions {
	/** Amplitude threshold below which audio is considered silent [0.0 - 1.0]. Default: 0.06 */
	threshold?: number;
	/** Minimum duration in seconds to count as a silent pause. Default: 0.4s */
	minDurationSeconds?: number;
	/** Padding in seconds to preserve around speech boundaries. Default: 0.05s */
	paddingSeconds?: number;
}

/**
 * Detect silence from normalized waveform peaks
 * @param peaks Array of normalized peak values [0.0 to 1.0]
 * @param totalDuration Total audio duration in seconds
 * @param options Detection thresholds
 */
export function detectSilenceFromPeaks(
	peaks: number[],
	totalDuration: number,
	options: SilenceDetectionOptions = {}
): SilentSegment[] {
	if (!peaks || peaks.length === 0 || totalDuration <= 0) return [];

	const threshold = options.threshold ?? 0.08;
	const minDuration = options.minDurationSeconds ?? 0.4;
	const padding = options.paddingSeconds ?? 0.05;

	const timePerSample = totalDuration / peaks.length;
	const segments: SilentSegment[] = [];

	let inSilence = false;
	let silenceStartIndex = 0;

	for (let i = 0; i < peaks.length; i++) {
		const isSilent = peaks[i] <= threshold;

		if (isSilent && !inSilence) {
			inSilence = true;
			silenceStartIndex = i;
		} else if (!isSilent && inSilence) {
			inSilence = false;
			const rawStart = silenceStartIndex * timePerSample;
			const rawEnd = i * timePerSample;
			const dur = rawEnd - rawStart;

			if (dur >= minDuration) {
				const start = Math.min(rawStart + padding, rawEnd);
				const end = Math.max(rawEnd - padding, start);
				if (end - start >= 0.2) {
					segments.push({
						start: Number(start.toFixed(2)),
						end: Number(end.toFixed(2)),
						duration: Number((end - start).toFixed(2))
					});
				}
			}
		}
	}

	// Handle trailing silence
	if (inSilence) {
		const rawStart = silenceStartIndex * timePerSample;
		const rawEnd = totalDuration;
		const dur = rawEnd - rawStart;
		if (dur >= minDuration) {
			const start = Math.min(rawStart + padding, rawEnd);
			segments.push({
				start: Number(start.toFixed(2)),
				end: Number(rawEnd.toFixed(2)),
				duration: Number((rawEnd - start).toFixed(2))
			});
		}
	}

	return segments;
}

