// Export-related utility functions

/**
 * Validate export settings
 * @param settings Export settings to validate
 * @returns True if valid, throws error if invalid
 */
export function validateExportSettings(settings: any): boolean {
	if (!settings.container || typeof settings.container !== 'string') {
		throw new Error('Invalid container format');
	}
	
	if (!settings.videoCodec || typeof settings.videoCodec !== 'string') {
		throw new Error('Invalid video codec');
	}
	
	if (typeof settings.width !== 'number' || settings.width <= 0) {
		throw new Error('Invalid width');
	}
	
	if (typeof settings.height !== 'number' || settings.height <= 0) {
		throw new Error('Invalid height');
	}
	
	if (typeof settings.frameRate !== 'number' || settings.frameRate <= 0) {
		throw new Error('Invalid frame rate');
	}
	
	if (typeof settings.bitrate !== 'number' || settings.bitrate <= 0) {
		throw new Error('Invalid bitrate');
	}
	
	if (!settings.audioCodec || typeof settings.audioCodec !== 'string') {
		throw new Error('Invalid audio codec');
	}
	
	if (typeof settings.audioBitrate !== 'number' || settings.audioBitrate <= 0) {
		throw new Error('Invalid audio bitrate');
	}
	
	return true;
}

/**
 * Calculate estimated file size for export
 * @param duration Duration in seconds
 * @param settings Export settings
 * @returns Estimated file size in bytes
 */
export function estimateFileSize(duration: number, settings: any): number {
	// Convert bitrates from kbps to bps, then calculate size
	const videoSizeBits = (settings.bitrate * 1000) * duration;
	const audioSizeBits = (settings.audioBitrate * 1000) * duration;
	const totalSizeBits = videoSizeBits + audioSizeBits;
	
	// Convert bits to bytes
	return Math.ceil(totalSizeBits / 8);
}

/**
 * Format file size in bytes to human readable string
 * @param bytes File size in bytes
 * @returns Human readable file size string
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Generate a unique filename for export
 * @param baseName Base name for the file
 * @param extension File extension (without dot)
 * @returns Unique filename
 */
export function generateExportFilename(baseName: string, extension: string): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return `${baseName}_${timestamp}.${extension}`;
}

/**
 * Check if a browser supports a specific media codec
 * Note: This is a simplified check. Real implementation would be more complex.
 * @param codec Codec to check (e.g., 'h264', 'aac')
 * @returns Boolean indicating support
 */
export function isCodecSupported(codec: string): boolean {
	// This is a placeholder implementation
	// In a real implementation, you would use MediaSource.isTypeSupported()
	// or check through HTMLMediaElement.canPlayType()
	
	const supportedCodecs: Record<string, boolean> = {
		'h264': true, // Generally supported
		'h265': false, // Limited support
		'vp9': true, // Good support in modern browsers
		'av01': false, // Limited support
		'aac': true, // Widely supported
		'mp3': true, // Widely supported
		'opus': true // Good support in modern browsers
	};
	
	return supportedCodecs[codec.toLowerCase()] ?? false;
}
