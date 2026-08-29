// UI-specific TypeScript types

export interface UIState {
	// Active panels/sidebars
	activePanel: 'media' | 'export' | 'history' | null;
	showSidebar: boolean;
	showToolbar: boolean;
	// Dialog states
	exportDialogOpen: boolean;
	importDialogOpen: boolean;
	settingsDialogOpen: boolean;
	// UI preferences
	compactMode: boolean;
	showWaveforms: boolean;
	showThumbnails: boolean;
	// Recent files (for open recent menu)
	recentFiles: Array<{ path: string; timestamp: number }>;
}
