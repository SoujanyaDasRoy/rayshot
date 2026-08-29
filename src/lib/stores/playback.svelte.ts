import { writable, get } from 'svelte/store';
import type { PlaybackState } from './playback.types';

// Playback state/controls
export const playbackStore = writable<PlaybackState>({
	currentTime: 0, // Current playback position in seconds
	isPlaying: false,
	playbackSpeed: 1.0, // 1.0 = normal speed
	// Audio settings
	masterVolume: 1.0, // 0 to 1
	isMuted: false
});

let animationFrameId: number | null = null;
let lastTimestamp: number | null = null;
let maxTimelineDuration = 0;

export function setMaxDuration(duration: number) {
	maxTimelineDuration = Math.max(0, duration);
}

function tick(timestamp: number) {
	if (lastTimestamp === null) {
		lastTimestamp = timestamp;
	}

	const deltaSeconds = (timestamp - lastTimestamp) / 1000;
	lastTimestamp = timestamp;

	playbackStore.update((state) => {
		if (!state.isPlaying) return state;

		const nextTime = state.currentTime + deltaSeconds * state.playbackSpeed;

		// Stop playback if we reached or exceeded the sequence duration
		if (maxTimelineDuration > 0 && nextTime >= maxTimelineDuration) {
			stopPlaybackLoop();
			return {
				...state,
				currentTime: maxTimelineDuration,
				isPlaying: false
			};
		}

		return {
			...state,
			currentTime: nextTime
		};
	});

	const currentState = get(playbackStore);
	if (currentState.isPlaying) {
		animationFrameId = requestAnimationFrame(tick);
	} else {
		stopPlaybackLoop();
	}
}

function startPlaybackLoop() {
	if (typeof window === 'undefined') return;
	if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
	lastTimestamp = null;
	animationFrameId = requestAnimationFrame(tick);
}

function stopPlaybackLoop() {
	if (typeof window === 'undefined') return;
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	lastTimestamp = null;
}

// Helper functions for updating playback state
export const playbackActions = {
	setCurrentTime: (time: number) => {
		const clampedTime = Math.max(0, time);
		playbackStore.update((state) => ({
			...state,
			currentTime: clampedTime
		}));
	},

	setPlaybackState: (isPlaying: boolean) => {
		playbackStore.update((state) => {
			if (state.isPlaying === isPlaying) return state;
			if (isPlaying) {
				// If at end of sequence, loop back to start
				let startTime = state.currentTime;
				if (maxTimelineDuration > 0 && startTime >= maxTimelineDuration - 0.05) {
					startTime = 0;
				}
				startPlaybackLoop();
				return { ...state, isPlaying: true, currentTime: startTime };
			} else {
				stopPlaybackLoop();
				return { ...state, isPlaying: false };
			}
		});
	},

	togglePlayback: () => {
		const state = get(playbackStore);
		playbackActions.setPlaybackState(!state.isPlaying);
	},

	stepFrames: (frames: number, fps: number = 30) => {
		const frameDuration = 1 / fps;
		playbackStore.update((state) => {
			if (state.isPlaying) {
				stopPlaybackLoop();
			}
			const newTime = Math.max(0, state.currentTime + frames * frameDuration);
			return {
				...state,
				isPlaying: false,
				currentTime: maxTimelineDuration > 0 ? Math.min(newTime, maxTimelineDuration) : newTime
			};
		});
	},

	setPlaybackSpeed: (speed: number) => {
		playbackStore.update((state) => ({
			...state,
			playbackSpeed: Math.max(0.25, Math.min(4.0, speed))
		}));
	},

	setMasterVolume: (volume: number) => {
		playbackStore.update((state) => ({
			...state,
			masterVolume: Math.max(0, Math.min(1, volume))
		}));
	},

	setMuted: (muted: boolean) => {
		playbackStore.update((state) => ({
			...state,
			isMuted: muted
		}));
	},

	toggleMute: () => {
		playbackStore.update((state) => ({
			...state,
			isMuted: !state.isMuted
		}));
	}
};
