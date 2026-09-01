import { writable } from 'svelte/store';
import type { ExportState } from './export.types';
import type { Project } from '$lib/types/project';

// Export presets and progress
export const exportStore = writable<ExportState>({
	// Export presets
	// Container is always WebM: MediaRecorder can't reliably produce real MP4/H.264
	// in Chromium, so these presets describe what this app can actually export.
	presets: [
		{
			id: '1080p30',
			name: '1080p30',
			description: '1920x1080 @ 30fps WebM (VP9)',
			settings: {
				container: 'webm',
				videoCodec: 'vp9',
				width: 1920,
				height: 1080,
				frameRate: 30,
				bitrate: 8000, // kbps
				audioCodec: 'opus',
				audioBitrate: 320 // kbps
			}
		},
		{
			id: '720p30',
			name: '720p30',
			description: '1280x720 @ 30fps WebM (VP9)',
			settings: {
				container: 'webm',
				videoCodec: 'vp9',
				width: 1280,
				height: 720,
				frameRate: 30,
				bitrate: 4500, // kbps
				audioCodec: 'opus',
				audioBitrate: 160 // kbps
			}
		},
		{
			id: '4k30',
			name: '4k30',
			description: '3840x2160 @ 30fps WebM (VP9)',
			settings: {
				container: 'webm',
				videoCodec: 'vp9',
				width: 3840,
				height: 2160,
				frameRate: 30,
				bitrate: 20000, // kbps
				audioCodec: 'opus',
				audioBitrate: 320 // kbps
			}
		}
	],
	// Current export state
	currentExport: null, // { presetId: string, progress: number, status: 'idle' | 'exporting' | 'completed' | 'failed' }
	// Export queue (for future implementation)
	exportQueue: [] as Array<{ id: string; presetId: string; project: Project }>
});

// Helper functions for updating export state
export const exportActions = {
	setCurrentExport: (presetId: string | null, project: Project | null) => {
		exportStore.update((state) => {
			return {
				...state,
				currentExport: presetId && project ? {
					presetId,
					progress: 0,
					status: 'idle'
				} : null
			};
		});
	},
	
	setExportProgress: (progress: number) => {
		exportStore.update((state) => {
			if (!state.currentExport) return state;
			return {
				...state,
				currentExport: {
					...state.currentExport,
					progress: Math.max(0, Math.min(100, progress)) // Clamp between 0 and 100
				}
			};
		});
	},
	
	setExportStatus: (status: 'idle' | 'exporting' | 'completed' | 'failed') => {
		exportStore.update((state) => {
			if (!state.currentExport) return state;
			return {
				...state,
				currentExport: {
					...state.currentExport,
					status
				}
			};
		});
	},
	
	clearExport: () => {
		exportStore.update((state) => ({
			...state,
			currentExport: null
		}));
	},
	
	addToExportQueue: (project: Project, presetId: string) => {
		exportStore.update((state) => {
			const exportQueue = [...state.exportQueue];
			exportQueue.push({
				id: Math.random().toString(36).substr(2, 9),
				presetId,
				project: { ...project } // Create a copy
			});
			return { ...state, exportQueue };
		});
	},
	
	removeFromExportQueue: (id: string) => {
		exportStore.update((state) => {
			const exportQueue = [...state.exportQueue];
			const index = exportQueue.findIndex(item => item.id === id);
			if (index >= 0) {
				exportQueue.splice(index, 1);
			}
			return { ...state, exportQueue };
		});
	}
};
