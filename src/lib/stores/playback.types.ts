// Playback-specific TypeScript types

export interface PlaybackState {
	currentTime: number; // Current playback position in seconds
	isPlaying: boolean;
	playbackSpeed: number; // 1.0 = normal speed
	// Audio settings
	masterVolume: number; // 0 to 1
	isMuted: boolean;
}
