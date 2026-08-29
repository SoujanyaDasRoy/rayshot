import { writable } from 'svelte/store';
import type { MediaState } from './media.types';

// Transient media runtime state
export const mediaStore = writable<MediaState>({
	// Loading state for media imports
	importing: new Map<string, boolean>(), // filePath -> isImporting
	// Thumbnail generation status
	thumbnails: new Map<string, string>(), // mediaAssetId -> thumbnailUrl
	// Proxy generation status
	proxies: new Map<string, { status: 'pending' | 'processing' | 'ready' | 'failed'; progress: number }>(),
	// Processing status for media analysis
	processing: new Map<string, { status: 'idle' | 'analyzing' | 'complete' | 'failed'; progress: number }>(),
	// Errors encountered during media operations
	errors: new Map<string, string>(), // mediaAssetId -> error message
	// Runtime availability (whether media can be played)
	availability: new Map<string, boolean>() // mediaAssetId -> isAvailable
});

// Helper functions for updating media state
export const mediaActions = {
	setImporting: (filePath: string, isImporting: boolean) => {
		mediaStore.update((state) => {
			const importing = new Map(state.importing);
			if (isImporting) {
				importing.set(filePath, true);
			} else {
				importing.delete(filePath);
			}
			return { ...state, importing };
		});
	},
	
	setThumbnail: (mediaAssetId: string, thumbnailUrl: string | null) => {
		mediaStore.update((state) => {
			const thumbnails = new Map(state.thumbnails);
			if (thumbnailUrl) {
				thumbnails.set(mediaAssetId, thumbnailUrl);
			} else {
				thumbnails.delete(mediaAssetId);
			}
			return { ...state, thumbnails };
		});
	},
	
	setProxyStatus: (mediaAssetId: string, status: 'pending' | 'processing' | 'ready' | 'failed', progress: number = 0) => {
		mediaStore.update((state) => {
			const proxies = new Map(state.proxies);
			proxies.set(mediaAssetId, { status, progress });
			return { ...state, proxies };
		});
	},
	
	setProcessingStatus: (mediaAssetId: string, status: 'idle' | 'analyzing' | 'complete' | 'failed', progress: number = 0) => {
		mediaStore.update((state) => {
			const processing = new Map(state.processing);
			processing.set(mediaAssetId, { status, progress });
			return { ...state, processing };
		});
	},
	
	setError: (mediaAssetId: string, error: string | null) => {
		mediaStore.update((state) => {
			const errors = new Map(state.errors);
			if (error) {
				errors.set(mediaAssetId, error);
			} else {
				errors.delete(mediaAssetId);
			}
			return { ...state, errors };
		});
	},
	
	setAvailability: (mediaAssetId: string, isAvailable: boolean) => {
		mediaStore.update((state) => {
			const availability = new Map(state.availability);
			availability.set(mediaAssetId, isAvailable);
			return { ...state, availability };
		});
	},
	
	clearErrors: () => {
		mediaStore.update((state) => ({
			...state,
			errors: new Map()
		}));
	}
};
