// Media-specific TypeScript types

export interface MediaState {
	// Loading state for media imports
	importing: Map<string, boolean>; // filePath -> isImporting
	// Thumbnail generation status
	thumbnails: Map<string, string>; // mediaAssetId -> thumbnailUrl
	// Proxy generation status
	proxies: Map<string, { 
		status: 'pending' | 'processing' | 'ready' | 'failed'; 
		progress: number 
	}>;
	// Processing status for media analysis
	processing: Map<string, { 
		status: 'idle' | 'analyzing' | 'complete' | 'failed'; 
		progress: number 
	}>;
	// Errors encountered during media operations
	errors: Map<string, string>; // mediaAssetId -> error message
	// Runtime availability (whether media can be played)
	availability: Map<string, boolean>; // mediaAssetId -> isAvailable
}
