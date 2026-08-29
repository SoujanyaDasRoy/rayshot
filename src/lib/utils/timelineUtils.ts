// Timeline-related utility functions

/**
 * Snap a value to the nearest grid point
 * @param value The value to snap
 * @param gridSize The grid size
 * @returns Snapped value
 */
export function snapToGrid(value: number, gridSize: number): number {
	return Math.round(value / gridSize) * gridSize;
}

/**
 * Convert timeline position to pixel position
 * @param time Time in seconds
 * @param zoomLevel Pixels per second
 * @param timeOffset Time at left edge of viewport (seconds)
 * @returns Pixel position
 */
export function timeToPixel(
	time: number,
	zoomLevel: number,
	timeOffset: number
): number {
	return (time - timeOffset) * zoomLevel;
}

/**
 * Convert pixel position to timeline position
 * @param pixel Pixel position
 * @param zoomLevel Pixels per second
 * @param timeOffset Time at left edge of viewport (seconds)
 * @returns Time in seconds
 */
export function pixelToTime(
	pixel: number,
	zoomLevel: number,
	timeOffset: number
): number {
	return pixel / zoomLevel + timeOffset;
}

/**
 * Calculate the visible time range based on viewport
 * @param viewportWidth Width of viewport in pixels
 * @param zoomLevel Pixels per second
 * @param timeOffset Time at left edge of viewport (seconds)
 * @returns Object with startTime and endTime
 */
export function getVisibleTimeRange(
	viewportWidth: number,
	zoomLevel: number,
	timeOffset: number
): { startTime: number; endTime: number } {
	const startTime = timeOffset;
	const endTime = timeOffset + (viewportWidth / zoomLevel);
	return { startTime, endTime };
}

/**
 * Clamp a value between min and max
 * @param value Value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 * @param start Start value
 * @param end End value
 * @param t Interpolation factor (0 to 1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * Math.max(0, Math.min(1, t));
}

/**
 * Convert frames to seconds based on frame rate
 * @param frames Number of frames
 * @param frameRate Frames per second
 * @returns Time in seconds
 */
export function framesToSeconds(frames: number, frameRate: number): number {
	return frames / frameRate;
}

/**
 * Convert seconds to frames based on frame rate
 * @param seconds Time in seconds
 * @param frameRate Frames per second
 * @returns Number of frames
 */
export function secondsToFrames(seconds: number, frameRate: number): number {
	return seconds * frameRate;
}
