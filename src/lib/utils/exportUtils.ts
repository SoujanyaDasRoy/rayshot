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
 * Check if this browser's MediaRecorder can actually produce the given codec.
 * Export only ever records WebM (see exportStore presets), so only WebM-compatible
 * codecs are meaningful here — there is no real H.264/MP4 path in this pipeline.
 * @param codec Codec to check (e.g., 'vp9', 'opus')
 * @returns Boolean indicating real, runtime-checked support
 */
export function isCodecSupported(codec: string): boolean {
	if (typeof MediaRecorder === 'undefined') return false;

	const mimeTypeByCodec: Record<string, string> = {
		vp9: 'video/webm;codecs=vp9',
		vp8: 'video/webm;codecs=vp8',
		opus: 'audio/webm;codecs=opus'
	};

	const mimeType = mimeTypeByCodec[codec.toLowerCase()];
	if (!mimeType) return false;

	return MediaRecorder.isTypeSupported(mimeType);
}

/**
 * Turn a user-supplied name into something safe for a filesystem.
 * Phase 2's .rayshot save needs exactly this, which is why it is here rather
 * than inline in the export dialog where it used to live.
 */
export function sanitizeExportFilename(name: string): string {
	const cleaned = (name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
	return cleaned || 'rayshot_export';
}

/** Hand a Blob to the user as a download. The only Blob-to-disk path in the app. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
