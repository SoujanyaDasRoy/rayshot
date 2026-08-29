import { writable } from 'svelte/store';
import type { UIState } from './ui.types';

// UI state (zoom, panels, etc.)
export const uiStore = writable<UIState>({
	// Active panels/sidebars
	activePanel: 'media', // 'media' | 'export' | 'history' | null
	showSidebar: true,
	showToolbar: true,
	// Dialog states
	exportDialogOpen: false,
	importDialogOpen: false,
	settingsDialogOpen: false,
	// UI preferences
	compactMode: false,
	showWaveforms: true,
	showThumbnails: true,
	// Recent files (for open recent menu)
	recentFiles: [] as Array<{ path: string; timestamp: number }>
});

// Helper functions for updating UI state
export const uiActions = {
	setActivePanel: (panel: 'media' | 'export' | 'history' | null) => {
		uiStore.update((state) => ({
			...state,
			activePanel: panel
		}));
	},
	
	toggleSidebar: () => {
		uiStore.update((state) => ({
			...state,
			showSidebar: !state.showSidebar
		}));
	},
	
	setShowSidebar: (show: boolean) => {
		uiStore.update((state) => ({
			...state,
			showSidebar: show
		}));
	},
	
	setShowToolbar: (show: boolean) => {
		uiStore.update((state) => ({
			...state,
			showToolbar: show
		}));
	},
	
	openExportDialog: () => {
		uiStore.update((state) => ({
			...state,
			exportDialogOpen: true
		}));
	},
	
	closeExportDialog: () => {
		uiStore.update((state) => ({
			...state,
			exportDialogOpen: false
		}));
	},
	
	openImportDialog: () => {
		uiStore.update((state) => ({
			...state,
			importDialogOpen: true
		}));
	},
	
	closeImportDialog: () => {
		uiStore.update((state) => ({
			...state,
			importDialogOpen: false
		}));
	},
	
	openSettingsDialog: () => {
		uiStore.update((state) => ({
			...state,
			settingsDialogOpen: true
		}));
	},
	
	closeSettingsDialog: () => {
		uiStore.update((state) => ({
			...state,
			settingsDialogOpen: false
		}));
	},
	
	setCompactMode: (compact: boolean) => {
		uiStore.update((state) => ({
			...state,
			compactMode: compact
		}));
	},
	
	setShowWaveforms: (show: boolean) => {
		uiStore.update((state) => ({
			...state,
			showWaveforms: show
		}));
	},
	
	setShowThumbnails: (show: boolean) => {
		uiStore.update((state) => ({
			...state,
			showThumbnails: show
		}));
	},
	
	addRecentFile: (path: string) => {
		uiStore.update((state) => {
			const recentFiles = [...state.recentFiles];
			// Remove if already exists
			const index = recentFiles.findIndex(f => f.path === path);
			if (index >= 0) {
				recentFiles.splice(index, 1);
			}
			// Add to front
			recentFiles.unshift({ path, timestamp: Date.now() });
			// Keep only last 10
			if (recentFiles.length > 10) {
				recentFiles.splice(10);
			}
			return { ...state, recentFiles };
		});
	},
	
	clearRecentFiles: () => {
		uiStore.update((state) => ({
			...state,
			recentFiles: []
		}));
	}
};
