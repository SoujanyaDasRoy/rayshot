// Project-related TypeScript interfaces and types

export interface MediaAsset {
	id: string;
	filename: string;
	// Absent when a project is restored before its bytes are rehydrated from
	// IndexedDB, or when the media is genuinely gone (imported on another
	// device). Callers must guard — see rehydrateAssetBlobs.
	sourceBlob?: Blob;
	type: 'video' | 'audio' | 'image';
	duration: number; // in seconds
	width?: number;
	height?: number;
	frameRate?: number;
	// MIME type of the blob (e.g., 'video/mp4')
	mimeType?: string;
	// Metadata for persistence
	createdAt: number;
	modifiedAt: number;
	// Set only when imported via "Import Folder" — the device folder's own name.
	// Individually-imported files have no folder.
	folder?: string;
}

export interface Track {
	id: string;
	type: 'video' | 'audio';
	order: number;
	// Tracks don't directly contain clips - they reference clip instances
	// but for simplicity in the store, we'll maintain an ordered list
	clipInstances: string[]; // Array of clip instance IDs in order
}

export interface Clip {
	id: string;
	mediaAssetId: string;
	sourceIn: number; // Start time in source media (seconds)
	sourceOut: number; // End time in source media (seconds)
	timelineStart: number; // Start time on timeline (seconds)
	timelineDuration: number; // Duration on timeline (seconds)
	// Transform properties (position, scale, rotation, etc.)
	transform: {
		x: number;
		y: number;
		scale: number;
		rotation: number; // in degrees
	};
	// Visual properties
	effects: string[]; // List of effect IDs
	transitionIn?: string; // Transition ID for incoming transition
	transitionOut?: string; // Transition ID for outgoing transition
	// Audio properties
	audioParameters: {
		volume: number; // 0 to 1
		mute: boolean;
	};
	// Playback properties
	playbackRate: number; // 1 = normal speed
	// Filter properties
	filters: Record<string, any>; // Map of filter names to their parameters
	// Color grading properties
	colorGrade: {
		exposure: number; // -2 to +2 stops
		contrast: number; // -100 to +100
		highlights: number; // -100 to +100
		shadows: number; // -100 to +100
		whites: number; // -100 to +100
		blacks: number; // -100 to +100
		temperature: number; // -100 cool to +100 warm
		tint: number; // -100 green to +100 magenta
		saturation: number; // -100 to +100
		vibrance: number; // -100 to +100
		vignette: number; // 0 to 1
		grain: number; // 0 to 1
		lutUrl?: string; // uploaded .cube LUT blob URL
		curves: {
			r: [number, number][];
			g: [number, number][];
			b: [number, number][];
			lum: [number, number][];
		};
	};
}

export interface Sequence {
	id: string;
	name: string;
	resolution: {
		width: number;
		height: number;
	};
	frameRate: number; // frames per second
	duration: number; // total duration in seconds
	tracks: Track[];
}

export interface Project {
	id: string;
	name: string;
	version: number;
	createdAt: number;
	modifiedAt: number;
	assets: Map<string, MediaAsset>;
	clips: Map<string, Clip>;
	sequences: Sequence[];
	// Currently active sequence ID
	activeSequenceId: string | null;
	// Project settings
	settings: {
		backgroundColor: string; // CSS color
	};
}