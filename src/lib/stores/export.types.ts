// Export-specific TypeScript types

export interface ExportState {
	// Export presets
	presets: Array<{
		id: string;
		name: string;
		description: string;
		settings: {
			container: string; // 'mp4', 'mov', etc.
			videoCodec: string; // 'h264', 'h265', 'vp9', etc.
			width: number;
			height: number;
			frameRate: number;
			bitrate: number; // kbps
			audioCodec: string; // 'aac', 'mp3', etc.
			audioBitrate: number; // kbps
		}
	}>;
	// Current export state
	currentExport: null | {
		presetId: string;
		progress: number; // 0 to 100
		status: 'idle' | 'exporting' | 'completed' | 'failed'
	};
	// Export queue (for future implementation)
	exportQueue: Array<{
		id: string;
		presetId: string;
		project: import('$lib/types/project').Project
	}>;
}
