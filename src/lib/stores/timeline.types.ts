// Timeline-specific TypeScript types

export interface TimelineState {
	selectedClipId: string | null;
	selectedTrackId: string | null;
	zoomLevel: number; // pixels per second
	timeOffset: number; // seconds at left edge of viewport
	isDragging: boolean;
	dragStartX: number;
	dragStartTime: number;
	snapToGrid: boolean;
	snapGridSize: number; // seconds
	waveformCache: Map<string, number[]>;
}

export interface TimelineAction {
	type: 'SELECT_CLIP' | 'SELECT_TRACK' | 'SET_ZOOM' | 'SET_TIME_OFFSET' | 
	      'SET_SNAP_TO_GRID' | 'SET_SNAP_GRID_SIZE' | 'START_DRAG' | 
	      'UPDATE_DRAG' | 'END_DRAG';
	payload: any;
}
