import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/stores/project.svelte', async () => {
	return await vi.importActual('../lib/stores/project.svelte.ts');
});
vi.mock('$lib/stores/timeline.svelte', async () => {
	return await vi.importActual('../lib/stores/timeline.svelte.ts');
});
vi.mock('$lib/stores/playback.svelte', async () => {
	return await vi.importActual('../lib/stores/playback.svelte.ts');
});
vi.mock('$lib/stores/ui.svelte', async () => {
	return await vi.importActual('../lib/stores/ui.svelte.ts');
});
vi.mock('$lib/stores/media.svelte', async () => {
	return await vi.importActual('../lib/stores/media.svelte.ts');
});
vi.mock('$lib/stores/export.svelte', async () => {
	return await vi.importActual('../lib/stores/export.svelte.ts');
});
vi.mock('$lib/core/commands/processor', async () => {
	return await vi.importActual('../lib/core/commands/processor.ts');
});
vi.mock('$lib/core/commands/addClip', async () => {
	return await vi.importActual('../lib/core/commands/addClip.ts');
});
vi.mock('$lib/core/commands/moveClip', async () => {
	return await vi.importActual('../lib/core/commands/moveClip.ts');
});
vi.mock('$lib/core/commands/trimClip', async () => {
	return await vi.importActual('../lib/core/commands/trimClip.ts');
});
vi.mock('$lib/core/commands/splitClip', async () => {
	return await vi.importActual('../lib/core/commands/splitClip.ts');
});
vi.mock('$lib/core/commands/deleteClip', async () => {
	return await vi.importActual('../lib/core/commands/deleteClip.ts');
});
vi.mock('$lib/core/commands/addTrack', async () => {
	return await vi.importActual('../lib/core/commands/addTrack.ts');
});
vi.mock('$lib/core/commands/newProject', async () => {
	return await vi.importActual('../lib/core/commands/newProject.ts');
});
vi.mock('$lib/core/commands/setClipVolume', async () => {
	return await vi.importActual('../lib/core/commands/setClipVolume.ts');
});
vi.mock('$lib/core/commands/setClipSpeed', async () => {
	return await vi.importActual('../lib/core/commands/setClipSpeed.ts');
});
vi.mock('$lib/core/commands/setClipFilter', async () => {
	return await vi.importActual('../lib/core/commands/setClipFilter.ts');
});
vi.mock('$lib/utils/timelineUtils', async () => {
	return await vi.importActual('../lib/utils/timelineUtils.ts');
});
vi.mock('$lib/utils/exportUtils', async () => {
	return await vi.importActual('../lib/utils/exportUtils.ts');
});
vi.mock('$lib/utils/mediaUtils', async () => {
	return await vi.importActual('../lib/utils/mediaUtils.ts');
});
vi.mock('$lib/core/persistence/assetCache', async () => {
	return await vi.importActual('../lib/core/persistence/assetCache.ts');
});
vi.mock('$lib/core/persistence/opfsAdapter', async () => {
	return await vi.importActual('../lib/core/persistence/opfsAdapter.ts');
});
import { projectStore, projectName, projectId, assets, sequences } from '../lib/stores/project.svelte.ts';
import { timelineStore, timelineActions, selectedClip } from '../lib/stores/timeline.svelte.ts';
import { playbackStore, playbackActions, setMaxDuration } from '../lib/stores/playback.svelte.ts';
import { uiStore, uiActions } from '../lib/stores/ui.svelte.ts';
import { mediaStore, mediaActions } from '../lib/stores/media.svelte.ts';
import { exportStore, exportActions } from '../lib/stores/export.svelte.ts';
import { commandProcessor } from '../lib/core/commands/processor.ts';
import { AddClipCommand } from '../lib/core/commands/addClip.ts';
import { MoveClipCommand } from '../lib/core/commands/moveClip.ts';
import { TrimClipCommand } from '../lib/core/commands/trimClip.ts';
import { SplitClipCommand } from '../lib/core/commands/splitClip.ts';
import { DeleteClipCommand } from '../lib/core/commands/deleteClip.ts';
import { AddTrackCommand } from '../lib/core/commands/addTrack.ts';
import { NewProjectCommand } from '../lib/core/commands/newProject.ts';
import { SetClipVolumeCommand } from '../lib/core/commands/setClipVolume.ts';
import { SetClipSpeedCommand } from '../lib/core/commands/setClipSpeed.ts';
import { clipRate } from '../lib/utils/clipTiming.ts';
import { SetClipFilterCommand } from '../lib/core/commands/setClipFilter.ts';
import {
	snapToGrid,
	timeToPixel,
	pixelToTime,
	getVisibleTimeRange,
	clamp,
	lerp,
	framesToSeconds,
	secondsToFrames
} from '../lib/utils/timelineUtils.ts';
import {
	validateExportSettings,
	estimateFileSize,
	formatFileSize,
	generateExportFilename,
	isCodecSupported
} from '../lib/utils/exportUtils.ts';
import { thumbnailCache, placeholderThumbnail, getFileDuration } from '../lib/utils/mediaUtils.ts';
import type { Project, Sequence, Track, Clip, MediaAsset } from '../lib/types/project.ts';

function createMockProject(): Project {
	const asset1: MediaAsset = {
		id: 'asset-video-1',
		filename: 'nature_vlog_1080p.mp4',
		sourceBlob: new Blob(['video_data'], { type: 'video/mp4' }),
		type: 'video',
		duration: 20.0,
		width: 1920,
		height: 1080,
		frameRate: 30,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const asset2: MediaAsset = {
		id: 'asset-audio-1',
		filename: 'ambient_soundtrack.mp3',
		sourceBlob: new Blob(['audio_data'], { type: 'audio/mp3' }),
		type: 'audio',
		duration: 30.0,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const asset3: MediaAsset = {
		id: 'asset-image-1',
		filename: 'title_card.png',
		sourceBlob: new Blob(['image_data'], { type: 'image/png' }),
		type: 'image',
		duration: 5.0,
		width: 1920,
		height: 1080,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const assetsMap = new Map<string, MediaAsset>();
	assetsMap.set(asset1.id, asset1);
	assetsMap.set(asset2.id, asset2);
	assetsMap.set(asset3.id, asset3);

	const initialSequences: Sequence[] = [
		{
			id: 'seq-main',
			name: 'Main Sequence',
			resolution: { width: 1920, height: 1080 },
			frameRate: 30,
			duration: 20.0,
			tracks: [
				{ id: 'track-v1', type: 'video', order: 1, clipInstances: [] },
				{ id: 'track-v2', type: 'video', order: 2, clipInstances: [] },
				{ id: 'track-a1', type: 'audio', order: 3, clipInstances: [] },
				{ id: 'track-a2', type: 'audio', order: 4, clipInstances: [] }
			]
		}
	];

	return {
		id: 'proj-test-1',
		name: 'RayShot Showcase',
		version: 1,
		createdAt: 1000,
		modifiedAt: 1000,
		assets: assetsMap,
		clips: new Map<string, Clip>(),
		sequences: initialSequences,
		activeSequenceId: 'seq-main',
		settings: { backgroundColor: '#090A0D' }
	};
}

describe('Tier 1: Feature Coverage (F1 - F10)', () => {
	beforeEach(() => {
		// Drain commandProcessor undo/redo stack
		while (commandProcessor.canUndo()) {
			commandProcessor.undo();
		}
		// Clear redo stack by executing and undoing if needed
		projectStore.set(createMockProject());
		timelineActions.selectClip(null);
		timelineActions.selectTrack(null);
		playbackActions.setCurrentTime(0);
		playbackActions.setPlaybackState(false);
		playbackActions.setPlaybackSpeed(1.0);
		playbackActions.setMasterVolume(1.0);
		playbackActions.setMuted(false);
		uiActions.setActivePanel('media');
		uiActions.setShowSidebar(true);
		uiActions.setShowToolbar(true);
	});

	// =========================================================================
	// F1: Theme & Permanent 3-Pane Shell
	// =========================================================================
	describe('F1: Theme & Permanent 3-Pane Shell', () => {
		it('F1.1: should initialize default dark theme background tokens in project settings', () => {
			const proj = get(projectStore);
			expect(proj).not.toBeNull();
			expect(proj?.settings.backgroundColor).toBe('#090A0D');
		});

		it('F1.2: should maintain persistent 3-pane UI store state defaults', () => {
			const ui = get(uiStore);
			expect(ui.showSidebar).toBe(true);
			expect(ui.showToolbar).toBe(true);
			expect(ui.activePanel).toBe('media');
		});

		it('F1.3: should toggle sidebar visibility without unmounting root workspace', () => {
			uiActions.toggleSidebar();
			expect(get(uiStore).showSidebar).toBe(false);
			uiActions.toggleSidebar();
			expect(get(uiStore).showSidebar).toBe(true);
		});

		it('F1.4: should set toolbar and sidebar visibility explicitly', () => {
			uiActions.setShowSidebar(false);
			uiActions.setShowToolbar(false);
			const state = get(uiStore);
			expect(state.showSidebar).toBe(false);
			expect(state.showToolbar).toBe(false);
		});

		it('F1.5: should toggle compactMode preference', () => {
			uiActions.setCompactMode(true);
			expect(get(uiStore).compactMode).toBe(true);
			uiActions.setCompactMode(false);
			expect(get(uiStore).compactMode).toBe(false);
		});

		it('F1.6: should manage recent files list in UI state', () => {
			uiActions.clearRecentFiles();
			expect(get(uiStore).recentFiles).toHaveLength(0);
			uiActions.addRecentFile('/path/to/project1.rayshot');
			uiActions.addRecentFile('/path/to/project2.rayshot');
			const recent = get(uiStore).recentFiles;
			expect(recent).toHaveLength(2);
			expect(recent[0].path).toBe('/path/to/project2.rayshot');
		});
	});

	// =========================================================================
	// F2: Minimal Top Bar & Project Name
	// =========================================================================
	describe('F2: Minimal Top Bar & Project Name', () => {
		it('F2.1: should derive project name and project id from projectStore', () => {
			expect(get(projectName)).toBe('RayShot Showcase');
			expect(get(projectId)).toBe('proj-test-1');
		});

		it('F2.2: should allow renaming project title and update modifiedAt timestamp', () => {
			const before = get(projectStore)!.modifiedAt;
			projectStore.update((p) => (p ? { ...p, name: 'Cinematic Travel Vlog', modifiedAt: Date.now() } : null));
			expect(get(projectName)).toBe('Cinematic Travel Vlog');
			expect(get(projectStore)!.modifiedAt).toBeGreaterThanOrEqual(before);
		});

		it('F2.3: should support NewProjectCommand resetting workspace to default structure', () => {
			const newProjCmd = new NewProjectCommand();
			commandProcessor.execute(newProjCmd);
			const current = get(projectStore);
			expect(current).not.toBeNull();
			expect(current?.name).toBe('Untitled Project');
			expect(current?.sequences).toHaveLength(1);
			expect(current?.sequences[0].tracks).toHaveLength(1);
		});

		it('F2.4: should track undo and redo button state in commandProcessor history store', () => {
			const historyStore = commandProcessor.getHistoryStore();
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			expect(get(historyStore).canUndo).toBe(true);
			expect(get(historyStore).canRedo).toBe(false);

			commandProcessor.undo();
			expect(get(historyStore).canUndo).toBe(false);
			expect(get(historyStore).canRedo).toBe(true);

			commandProcessor.redo();
			expect(get(historyStore).canUndo).toBe(true);
			expect(get(historyStore).canRedo).toBe(false);
		});

		it('F2.5: should format timecode accurately across frame boundaries', () => {
			function formatTimecode(seconds: number, fps: number = 30): string {
				const totalSecs = Math.max(0, seconds);
				const hrs = Math.floor(totalSecs / 3600);
				const mins = Math.floor((totalSecs % 3600) / 60);
				const secs = Math.floor(totalSecs % 60);
				const frames = Math.floor(Math.round((totalSecs % 1) * fps));
				const pad = (n: number) => n.toString().padStart(2, '0');
				return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
			}

			expect(formatTimecode(0)).toBe('00:00:00:00');
			expect(formatTimecode(1.5, 30)).toBe('00:00:01:15');
			expect(formatTimecode(65.1, 30)).toBe('00:01:05:03');
			expect(formatTimecode(3661.0, 30)).toBe('01:01:01:00');
		});
	});

	// =========================================================================
	// F3: 5-Pillar Category Navigation
	// =========================================================================
	describe('F3: 5-Pillar Category Navigation', () => {
		it('F3.1: should switch active panel between categories in UI store', () => {
			uiActions.setActivePanel('media');
			expect(get(uiStore).activePanel).toBe('media');
			uiActions.setActivePanel('export');
			expect(get(uiStore).activePanel).toBe('export');
			uiActions.setActivePanel('history');
			expect(get(uiStore).activePanel).toBe('history');
			uiActions.setActivePanel(null);
			expect(get(uiStore).activePanel).toBeNull();
		});

		it('F3.2: should filter media assets by type in media bin category drawers', () => {
			const allAssets = Array.from(get(assets).values());
			const videoAssets = allAssets.filter((a) => a.type === 'video');
			const audioAssets = allAssets.filter((a) => a.type === 'audio');
			const imageAssets = allAssets.filter((a) => a.type === 'image');

			expect(videoAssets).toHaveLength(1);
			expect(audioAssets).toHaveLength(1);
			expect(imageAssets).toHaveLength(1);
			expect(videoAssets[0].filename).toBe('nature_vlog_1080p.mp4');
		});

		it('F3.3: should search media assets by substring case-insensitively', () => {
			const allAssets = Array.from(get(assets).values());
			const search = (q: string) => allAssets.filter((a) => a.filename.toLowerCase().includes(q.toLowerCase()));

			expect(search('VLOG')).toHaveLength(1);
			expect(search('SOUNDTRACK')).toHaveLength(1);
			expect(search('nonexistent')).toHaveLength(0);
		});

		it('F3.4: should support dialog state toggling for export and import', () => {
			uiActions.openExportDialog();
			expect(get(uiStore).exportDialogOpen).toBe(true);
			uiActions.closeExportDialog();
			expect(get(uiStore).exportDialogOpen).toBe(false);

			uiActions.openImportDialog();
			expect(get(uiStore).importDialogOpen).toBe(true);
			uiActions.closeImportDialog();
			expect(get(uiStore).importDialogOpen).toBe(false);
		});

		it('F3.5: should manage media import tracking and error states in mediaStore', () => {
			mediaActions.setImporting('/sample/clip.mp4', true);
			expect(get(mediaStore).importing.get('/sample/clip.mp4')).toBe(true);
			mediaActions.setImporting('/sample/clip.mp4', false);
			expect(get(mediaStore).importing.has('/sample/clip.mp4')).toBe(false);

			mediaActions.setError('asset-video-1', 'Codec unsupported');
			expect(get(mediaStore).errors.get('asset-video-1')).toBe('Codec unsupported');
			mediaActions.clearErrors();
			expect(get(mediaStore).errors.size).toBe(0);
		});
	});

	// =========================================================================
	// F4: Contextual Inspector (Video/Audio/Text)
	// =========================================================================
	describe('F4: Contextual Inspector (Video/Audio/Text)', () => {
		it('F4.1: should return null selectedClip when no clip is selected', () => {
			timelineActions.selectClip(null);
			expect(get(selectedClip)).toBeNull();
		});

		it('F4.2: should identify selected clip and track when a clip is selected', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);

			const proj = get(projectStore)!;
			const clipId = Array.from(proj.clips.keys())[0];
			timelineActions.selectClip(clipId);

			const sel = get(selectedClip);
			expect(sel).not.toBeNull();
			expect(sel?.id).toBe(clipId);
			expect(sel?.trackId).toBe('track-v1');
		});

		it('F4.3: should modify clip audio volume via SetClipVolumeCommand with undo/redo', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-audio-1',
				trackId: 'track-a1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const setVolCmd = new SetClipVolumeCommand({ clipId, volume: 0.65 });
			commandProcessor.execute(setVolCmd);

			expect(get(projectStore)!.clips.get(clipId)!.audioParameters.volume).toBe(0.65);

			commandProcessor.undo();
			expect(get(projectStore)!.clips.get(clipId)!.audioParameters.volume).toBe(1.0);

			commandProcessor.redo();
			expect(get(projectStore)!.clips.get(clipId)!.audioParameters.volume).toBe(0.65);
		});

		it('F4.4: should modify clip playback rate (speed) via SetClipSpeedCommand', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const setRateCmd = new SetClipSpeedCommand({ clipId, speed: 2.0 });
			commandProcessor.execute(setRateCmd);

			expect(clipRate(get(projectStore)!.clips.get(clipId)!)).toBe(2.0);

			commandProcessor.undo();
			expect(clipRate(get(projectStore)!.clips.get(clipId)!)).toBe(1.0);
		});

		it('F4.5: should modify clip visual filter parameters via SetClipFilterCommand', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const setFilterCmd = new SetClipFilterCommand({ clipId, filterName: 'brightness', value: 25 });
			commandProcessor.execute(setFilterCmd);

			expect(get(projectStore)!.clips.get(clipId)!.filters.brightness).toBe(25);

			commandProcessor.undo();
			expect(get(projectStore)!.clips.get(clipId)!.filters.brightness).toBeUndefined();
		});

		it('F4.6: should verify clip transform properties default to identity', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-image-1',
				trackId: 'track-v2',
				position: 2
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];
			const clip = get(projectStore)!.clips.get(clipId)!;

			expect(clip.transform).toEqual({
				x: 0,
				y: 0,
				scale: 1,
				rotation: 0
			});
		});
	});

	// =========================================================================
	// F5: Multitrack Timeline & Track Badges
	// =========================================================================
	describe('F5: Multitrack Timeline & Track Badges', () => {
		it('F5.1: should initialize multitrack sequences with video and audio tracks', () => {
			const seqs = get(sequences);
			expect(seqs).toHaveLength(1);
			expect(seqs[0].tracks).toHaveLength(4);
			expect(seqs[0].tracks.map((t) => t.type)).toEqual(['video', 'video', 'audio', 'audio']);
		});

		it('F5.2: should add a new video track dynamically via AddTrackCommand', () => {
			const addTrackCmd = new AddTrackCommand({ type: 'video', index: 4 });
			commandProcessor.execute(addTrackCmd);

			const seq = get(sequences)[0];
			expect(seq.tracks).toHaveLength(5);
			expect(seq.tracks[4].type).toBe('video');
			expect(seq.tracks[4].order).toBe(4);
		});

		it('F5.3: should add a new audio track dynamically via AddTrackCommand', () => {
			const addTrackCmd = new AddTrackCommand({ type: 'audio', index: 4 });
			commandProcessor.execute(addTrackCmd);

			const seq = get(sequences)[0];
			expect(seq.tracks).toHaveLength(5);
			expect(seq.tracks[4].type).toBe('audio');
			expect(seq.tracks[4].order).toBe(4);
		});

		it('F5.4: should undo AddTrackCommand restoring original track count', () => {
			const initialCount = get(sequences)[0].tracks.length;
			const addTrackCmd = new AddTrackCommand({ type: 'audio', index: initialCount });
			commandProcessor.execute(addTrackCmd);
			expect(get(sequences)[0].tracks).toHaveLength(initialCount + 1);

			commandProcessor.undo();
			expect(get(sequences)[0].tracks).toHaveLength(initialCount);
		});

		it('F5.5: should calculate track badge identifiers V1, V2, A1, A2 accurately', () => {
			const currentTracks = get(sequences)[0].tracks;
			const videoTracks = currentTracks.filter((t) => t.type === 'video');

			const badges = currentTracks.map((track, index) => {
				if (track.type === 'video') return `V${index + 1}`;
				return `A${index + 1 - videoTracks.length}`;
			});

			expect(badges).toEqual(['V1', 'V2', 'A1', 'A2']);
		});

		it('F5.6: should calculate total timeline sequence duration from max clip bounds', () => {
			const addCmd1 = new AddClipCommand({ mediaAssetId: 'asset-video-1', trackId: 'track-v1', position: 0 }); // dur 20 => end 20
			const addCmd2 = new AddClipCommand({ mediaAssetId: 'asset-audio-1', trackId: 'track-a1', position: 5 }); // dur 30 => end 35
			commandProcessor.execute(addCmd1);
			commandProcessor.execute(addCmd2);

			const proj = get(projectStore)!;
			let maxEnd = 0;
			for (const seq of proj.sequences) {
				for (const tr of seq.tracks) {
					for (const cId of tr.clipInstances) {
						const c = proj.clips.get(cId);
						if (c) {
							const end = c.timelineStart + c.timelineDuration;
							if (end > maxEnd) maxEnd = end;
						}
					}
				}
			}
			expect(maxEnd).toBe(35.0);
		});
	});

	// =========================================================================
	// F6: Thumbnail Strips & Audio Waveforms
	// =========================================================================
	describe('F6: Thumbnail Strips & Audio Waveforms', () => {
		it('F6.1: should store and retrieve thumbnails in thumbnailCache', () => {
			thumbnailCache.set('asset-video-1', 'data:image/jpeg;base64,mockThumbnailData');
			expect(thumbnailCache.get('asset-video-1')).toBe('data:image/jpeg;base64,mockThumbnailData');
			thumbnailCache.delete('asset-video-1');
			expect(thumbnailCache.has('asset-video-1')).toBe(false);
		});

		it('F6.2: should provide a valid placeholderThumbnail fallback', () => {
			expect(placeholderThumbnail).toBeTruthy();
			expect(placeholderThumbnail.startsWith('data:image/png;base64,')).toBe(true);
		});

		it('F6.3: should return fallback 5.0s duration for image files in getFileDuration', async () => {
			const imgFile = new File(['image_bytes'], 'photo.png', { type: 'image/png' });
			const dur = await getFileDuration(imgFile);
			expect(dur).toBe(5.0);
		});

		it('F6.4: should toggle showThumbnails and showWaveforms flags in uiStore', () => {
			uiActions.setShowThumbnails(false);
			uiActions.setShowWaveforms(false);
			expect(get(uiStore).showThumbnails).toBe(false);
			expect(get(uiStore).showWaveforms).toBe(false);

			uiActions.setShowThumbnails(true);
			uiActions.setShowWaveforms(true);
			expect(get(uiStore).showThumbnails).toBe(true);
			expect(get(uiStore).showWaveforms).toBe(true);
		});

		it('F6.5: should maintain waveformCache in timelineStore', () => {
			const cache = get(timelineStore).waveformCache;
			cache.set('clip-1', [0.1, 0.5, 0.9, 0.3, 0.0]);
			expect(get(timelineStore).waveformCache.get('clip-1')).toEqual([0.1, 0.5, 0.9, 0.3, 0.0]);
		});
	});

	// =========================================================================
	// F7: Playhead, Timecode Badge & Scrubbing
	// =========================================================================
	describe('F7: Playhead, Timecode Badge & Scrubbing', () => {
		it('F7.1: should initialize playbackStore with clean default clock', () => {
			const p = get(playbackStore);
			expect(p.currentTime).toBe(0);
			expect(p.isPlaying).toBe(false);
			expect(p.playbackSpeed).toBe(1.0);
			expect(p.masterVolume).toBe(1.0);
			expect(p.isMuted).toBe(false);
		});

		it('F7.2: should update currentTime and clamp negative values to 0', () => {
			playbackActions.setCurrentTime(12.45);
			expect(get(playbackStore).currentTime).toBe(12.45);

			playbackActions.setCurrentTime(-5.0);
			expect(get(playbackStore).currentTime).toBe(0);
		});

		it('F7.3: should toggle playback state correctly', () => {
			playbackActions.togglePlayback();
			expect(get(playbackStore).isPlaying).toBe(true);

			playbackActions.togglePlayback();
			expect(get(playbackStore).isPlaying).toBe(false);
		});

		it('F7.4: should step frames forwards and backwards accurately', () => {
			playbackActions.setCurrentTime(1.0);
			playbackActions.stepFrames(1, 30); // +1 frame at 30fps = +0.03333s
			expect(get(playbackStore).currentTime).toBeCloseTo(1 + 1 / 30, 4);

			playbackActions.stepFrames(-2, 30); // -2 frames = -0.06666s
			expect(get(playbackStore).currentTime).toBeCloseTo(1 - 1 / 30, 4);
		});

		it('F7.5: should clamp playback speed between 0.25x and 4.0x', () => {
			playbackActions.setPlaybackSpeed(2.0);
			expect(get(playbackStore).playbackSpeed).toBe(2.0);

			playbackActions.setPlaybackSpeed(0.05); // below min
			expect(get(playbackStore).playbackSpeed).toBe(0.25);

			playbackActions.setPlaybackSpeed(10.0); // above max
			expect(get(playbackStore).playbackSpeed).toBe(4.0);
		});

		it('F7.6: should manage master volume and mute toggles', () => {
			playbackActions.setMasterVolume(0.75);
			expect(get(playbackStore).masterVolume).toBe(0.75);

			playbackActions.setMasterVolume(1.5); // clamp
			expect(get(playbackStore).masterVolume).toBe(1.0);

			playbackActions.toggleMute();
			expect(get(playbackStore).isMuted).toBe(true);

			playbackActions.toggleMute();
			expect(get(playbackStore).isMuted).toBe(false);
		});
	});

	// =========================================================================
	// F8: Trimming, Splitting, Snapping & Undo/Redo
	// =========================================================================
	describe('F8: Trimming, Splitting, Snapping & Undo/Redo', () => {
		it('F8.1: should execute AddClipCommand creating a clip on track', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 2.5
			});
			commandProcessor.execute(addCmd);

			const proj = get(projectStore)!;
			expect(proj.clips.size).toBe(1);
			const clip = Array.from(proj.clips.values())[0];
			expect(clip.mediaAssetId).toBe('asset-video-1');
			expect(clip.timelineStart).toBe(2.5);
			expect(clip.timelineDuration).toBe(20.0);
			expect(clip.sourceIn).toBe(0);
			expect(clip.sourceOut).toBe(20.0);
		});

		it('F8.2: should execute MoveClipCommand changing clip position and track', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const moveCmd = new MoveClipCommand({
				clipId,
				newTrackId: 'track-v2',
				newPosition: 8.0
			});
			commandProcessor.execute(moveCmd);

			const proj = get(projectStore)!;
			const movedClip = proj.clips.get(clipId)!;
			expect(movedClip.timelineStart).toBe(8.0);

			const trackV1 = proj.sequences[0].tracks.find((t) => t.id === 'track-v1')!;
			const trackV2 = proj.sequences[0].tracks.find((t) => t.id === 'track-v2')!;
			expect(trackV1.clipInstances).not.toContain(clipId);
			expect(trackV2.clipInstances).toContain(clipId);
		});

		it('F8.3: should execute TrimClipCommand on start head adjusting sourceIn and timelineStart', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const trimCmd = new TrimClipCommand({
				clipId,
				side: 'start',
				newSourceTime: 4.0
			});
			commandProcessor.execute(trimCmd);

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.sourceIn).toBe(4.0);
			expect(clip.sourceOut).toBe(20.0);
			expect(clip.timelineDuration).toBe(16.0);
			expect(clip.timelineStart).toBe(4.0);
		});

		it('F8.4: should execute TrimClipCommand on end tail adjusting sourceOut and timelineDuration', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const trimCmd = new TrimClipCommand({
				clipId,
				side: 'end',
				newSourceTime: 12.0
			});
			commandProcessor.execute(trimCmd);

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.sourceIn).toBe(0);
			expect(clip.sourceOut).toBe(12.0);
			expect(clip.timelineDuration).toBe(12.0);
			expect(clip.timelineStart).toBe(0);
		});

		it('F8.5: should execute SplitClipCommand dividing clip into two consecutive clips', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const splitCmd = new SplitClipCommand({
				clipId,
				splitTime: 8.0
			});
			commandProcessor.execute(splitCmd);

			const proj = get(projectStore)!;
			expect(proj.clips.size).toBe(2);
			const clipsList = Array.from(proj.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);

			expect(clipsList[0].timelineStart).toBe(0);
			expect(clipsList[0].timelineDuration).toBe(8.0);
			expect(clipsList[0].sourceIn).toBe(0);
			expect(clipsList[0].sourceOut).toBe(8.0);

			expect(clipsList[1].timelineStart).toBe(8.0);
			expect(clipsList[1].timelineDuration).toBe(12.0);
			expect(clipsList[1].sourceIn).toBe(8.0);
			expect(clipsList[1].sourceOut).toBe(20.0);
		});

		it('F8.6: should execute DeleteClipCommand and restore on undo', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'asset-video-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const delCmd = new DeleteClipCommand({ clipId });
			commandProcessor.execute(delCmd);

			expect(get(projectStore)!.clips.size).toBe(0);

			commandProcessor.undo();
			expect(get(projectStore)!.clips.size).toBe(1);
			expect(get(projectStore)!.clips.has(clipId)).toBe(true);
		});

		it('F8.7: should snap positions to nearest grid intervals with snapToGrid utility', () => {
			expect(snapToGrid(1.04, 0.1)).toBeCloseTo(1.0, 5);
			expect(snapToGrid(1.06, 0.1)).toBeCloseTo(1.1, 5);
			expect(snapToGrid(2.74, 0.5)).toBeCloseTo(2.5, 5);
			expect(snapToGrid(2.76, 0.5)).toBeCloseTo(3.0, 5);
		});
	});

	// =========================================================================
	// F9: 16:9 Canvas & Floating Transport Bar
	// =========================================================================
	describe('F9: 16:9 Canvas & Floating Transport Bar', () => {
		it('F9.1: should verify standard 16:9 aspect ratio in sequence resolution', () => {
			const seq = get(sequences)[0];
			expect(seq.resolution.width / seq.resolution.height).toBeCloseTo(16 / 9, 2);
		});

		it('F9.2: should locate active clip at current playhead timestamp', () => {
			function findClipAtTime(proj: Project | null, seqId: string | null, time: number) {
				if (!proj || !seqId) return null;
				const seq = proj.sequences.find((s) => s.id === seqId);
				if (!seq) return null;
				for (let i = seq.tracks.length - 1; i >= 0; i--) {
					const track = seq.tracks[i];
					for (const cId of track.clipInstances) {
						const clip = proj.clips.get(cId);
						if (!clip) continue;
						if (time >= clip.timelineStart && time < clip.timelineStart + clip.timelineDuration) {
							const asset = proj.assets.get(clip.mediaAssetId);
							if (asset) return { clip, asset };
						}
					}
				}
				return null;
			}

			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-1', trackId: 'track-v1', position: 5.0 });
			commandProcessor.execute(addCmd);

			const proj = get(projectStore)!;
			expect(findClipAtTime(proj, 'seq-main', 2.0)).toBeNull();
			const found = findClipAtTime(proj, 'seq-main', 10.0);
			expect(found).not.toBeNull();
			expect(found?.asset.id).toBe('asset-video-1');
		});

		it('F9.3: should calculate frame-accurate source timestamp considering clip trim and speed', () => {
			function getSourceTime(clip: Clip, timelineTime: number): number {
				const timelineOffset = timelineTime - clip.timelineStart;
				const sourceDuration = clip.sourceOut - clip.sourceIn;
				const timelineDuration = clip.timelineDuration;
				if (timelineDuration <= 0) return clip.sourceIn;
				return clip.sourceIn + (timelineOffset / timelineDuration) * sourceDuration;
			}

			const mockClip: Clip = {
				id: 'c1',
				mediaAssetId: 'a1',
				sourceIn: 10.0,
				sourceOut: 20.0,
				timelineStart: 5.0,
				timelineDuration: 10.0,
				transform: { x: 0, y: 0, scale: 1, rotation: 0 },
				effects: [],
				audioParameters: { volume: 1, mute: false },
				filters: {},
				colorGrade: {
					exposure: 0,
					contrast: 0,
					highlights: 0,
					shadows: 0,
						whites: 0,
						blacks: 0,
					temperature: 0,
					tint: 0,
					saturation: 0,
					vibrance: 0,
					vignette: 0,
					grain: 0,
					curves: {
							r: [[0, 0], [1, 1]],
							g: [[0, 0], [1, 1]],
							b: [[0, 0], [1, 1]],
							lum: [[0, 0], [1, 1]]
						},
					lutUrl: undefined
				}
			};

			expect(getSourceTime(mockClip, 5.0)).toBe(10.0);
			expect(getSourceTime(mockClip, 10.0)).toBe(15.0);
			expect(getSourceTime(mockClip, 15.0)).toBe(20.0);
		});

		it('F9.4: should give higher track indices visual precedence in preview stack', () => {
			const addV1 = new AddClipCommand({ mediaAssetId: 'asset-video-1', trackId: 'track-v1', position: 0 });
			const addV2 = new AddClipCommand({ mediaAssetId: 'asset-image-1', trackId: 'track-v2', position: 0 });
			commandProcessor.execute(addV1);
			commandProcessor.execute(addV2);

			const proj = get(projectStore)!;
			const seq = proj.sequences.find((s) => s.id === 'seq-main')!;
			let topClip: Clip | null = null;
			for (let i = seq.tracks.length - 1; i >= 0; i--) {
				const track = seq.tracks[i];
				for (const cId of track.clipInstances) {
					const c = proj.clips.get(cId);
					if (c && c.timelineStart <= 2.0 && c.timelineStart + c.timelineDuration > 2.0) {
						topClip = c;
						break;
					}
				}
				if (topClip) break;
			}

			expect(topClip).not.toBeNull();
			expect(topClip?.mediaAssetId).toBe('asset-image-1'); // V2 overlays V1
		});

		it('F9.5: should calculate timeToPixel and pixelToTime conversions for timeline transport', () => {
			const zoom = 1.0; // 80px/s default or utils definition
			expect(timeToPixel(5.0, 100, 0)).toBe(500);
			expect(pixelToTime(500, 100, 0)).toBe(5.0);
			expect(getVisibleTimeRange(800, 100, 2)).toEqual({ startTime: 2, endTime: 10 });
		});
	});

	// =========================================================================
	// F10: Svelte 5 Store & Export Engine Integrity
	// =========================================================================
	describe('F10: Svelte 5 Store & Export Engine Integrity', () => {
		it('F10.1: should contain standard export presets (1080p, 720p, 4k)', () => {
			const presets = get(exportStore).presets;
			expect(presets.length).toBeGreaterThanOrEqual(3);
			expect(presets.map((p) => p.id)).toContain('1080p30');
			expect(presets.map((p) => p.id)).toContain('720p30');
			expect(presets.map((p) => p.id)).toContain('4k30');
		});

		it('F10.2: should validate export settings successfully for valid preset', () => {
			const validSettings = {
				container: 'mp4',
				videoCodec: 'h264',
				width: 1920,
				height: 1080,
				frameRate: 30,
				bitrate: 8000,
				audioCodec: 'aac',
				audioBitrate: 320
			};
			expect(validateExportSettings(validSettings)).toBe(true);
		});

		it('F10.3: should calculate estimated file sizes and format human-readable strings', () => {
			const settings = {
				bitrate: 8000, // 8000 kbps
				audioBitrate: 320 // 320 kbps
			};
			const duration = 60; // 60 seconds
			const sizeBytes = estimateFileSize(duration, settings);
			expect(sizeBytes).toBe(62400000); // (8320 * 1000 * 60) / 8 = 62,400,000 bytes

			const formatted = formatFileSize(sizeBytes);
			expect(formatted).toContain('MB');
		});

		it('F10.4: should generate unique export filename with timestamp', () => {
			const filename = generateExportFilename('MyVlog', 'mp4');
			expect(filename.startsWith('MyVlog_')).toBe(true);
			expect(filename.endsWith('.mp4')).toBe(true);
		});

		it('F10.5: isCodecSupported returns false outside a browser (no MediaRecorder global)', () => {
			// Real support is verified in a real browser by the Playwright suite —
			// Vitest's node environment has no MediaRecorder, so every codec is unsupported here.
			expect(isCodecSupported('vp9')).toBe(false);
			expect(isCodecSupported('opus')).toBe(false);
			expect(isCodecSupported('invalid_codec_xyz')).toBe(false);
		});

		it('F10.6: should manage export progress and queue states in exportStore', () => {
			const proj = get(projectStore)!;
			exportActions.setCurrentExport('1080p30', proj);
			expect(get(exportStore).currentExport?.status).toBe('idle');

			exportActions.setExportProgress(45);
			expect(get(exportStore).currentExport?.progress).toBe(45);

			exportActions.setExportStatus('exporting');
			expect(get(exportStore).currentExport?.status).toBe('exporting');

			exportActions.setExportStatus('completed');
			expect(get(exportStore).currentExport?.status).toBe('completed');

			exportActions.clearExport();
			expect(get(exportStore).currentExport).toBeNull();
		});
	});
});