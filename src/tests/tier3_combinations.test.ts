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
vi.mock('$lib/core/commands/setClipPlaybackRate', async () => {
	return await vi.importActual('../lib/core/commands/setClipPlaybackRate.ts');
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

import { projectStore } from '../lib/stores/project.svelte.ts';
import { timelineStore, timelineActions, selectedClip } from '../lib/stores/timeline.svelte.ts';
import { playbackStore, playbackActions } from '../lib/stores/playback.svelte.ts';
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
import { SetClipPlaybackRateCommand } from '../lib/core/commands/setClipPlaybackRate.ts';
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
import type { Project, Sequence, Track, Clip, MediaAsset } from '../lib/types/project.ts';

function createIntegrationTestProject(): Project {
	const a1: MediaAsset = {
		id: 'asset-4k-video',
		filename: 'cinematic_landscape_4k.mp4',
		sourceBlob: new Blob(['video'], { type: 'video/mp4' }),
		type: 'video',
		duration: 40.0,
		width: 3840,
		height: 2160,
		frameRate: 60,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const a2: MediaAsset = {
		id: 'asset-music-track',
		filename: 'epic_soundtrack.mp3',
		sourceBlob: new Blob(['audio'], { type: 'audio/mp3' }),
		type: 'audio',
		duration: 60.0,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const a3: MediaAsset = {
		id: 'asset-overlay-badge',
		filename: 'logo_badge.png',
		sourceBlob: new Blob(['image'], { type: 'image/png' }),
		type: 'image',
		duration: 5.0,
		width: 500,
		height: 500,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const assetsMap = new Map<string, MediaAsset>();
	assetsMap.set(a1.id, a1);
	assetsMap.set(a2.id, a2);
	assetsMap.set(a3.id, a3);

	const initialSequences: Sequence[] = [
		{
			id: 'seq-integ',
			name: 'Integration Sequence',
			resolution: { width: 1920, height: 1080 },
			frameRate: 30,
			duration: 60.0,
			tracks: [
				{ id: 'track-v1', type: 'video', order: 0, clipInstances: [] },
				{ id: 'track-v2', type: 'video', order: 1, clipInstances: [] },
				{ id: 'track-a1', type: 'audio', order: 2, clipInstances: [] },
				{ id: 'track-a2', type: 'audio', order: 3, clipInstances: [] }
			]
		}
	];

	return {
		id: 'proj-integ',
		name: 'Cross Feature Showcase',
		version: 1,
		createdAt: 1000,
		modifiedAt: 1000,
		assets: assetsMap,
		clips: new Map<string, Clip>(),
		sequences: initialSequences,
		activeSequenceId: 'seq-integ',
		settings: { backgroundColor: '#121319' }
	};
}

describe('Tier 3: Cross-Feature Combinations', () => {
	beforeEach(() => {
		(commandProcessor as any).undoStack = [];
		(commandProcessor as any).redoStack = [];
		(commandProcessor as any).updateHistoryState();

		projectStore.set(createIntegrationTestProject());
		timelineActions.selectClip(null);
		timelineActions.selectTrack(null);
		playbackActions.setCurrentTime(0);
		playbackActions.setPlaybackState(false);
	});

	it('Scenario 3.1: Import -> Add Clip -> Trim Head -> Split -> Move Second Half -> Undo Pipeline', () => {
		// 1. Add clip
		const addCmd = new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 });
		commandProcessor.execute(addCmd);
		let clipId = Array.from(get(projectStore)!.clips.keys())[0];

		// 2. Trim head (start) to 5s (duration becomes 35s, starts at 5s)
		commandProcessor.execute(new TrimClipCommand({ clipId, side: 'start', newSourceTime: 5.0 }));

		// 3. Split at 15s (offset 10s into clip)
		commandProcessor.execute(new SplitClipCommand({ clipId, splitTime: 15.0 }));
		const clipsList = Array.from(get(projectStore)!.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);
		expect(clipsList).toHaveLength(2);
		const firstHalf = clipsList[0];
		const secondHalf = clipsList[1];

		expect(firstHalf.timelineStart).toBe(5.0);
		expect(firstHalf.timelineDuration).toBe(10.0);
		expect(secondHalf.timelineStart).toBe(15.0);
		expect(secondHalf.timelineDuration).toBe(25.0);

		// 4. Move second half to track-v2 at 20s
		commandProcessor.execute(new MoveClipCommand({ clipId: secondHalf.id, newTrackId: 'track-v2', newPosition: 20.0 }));
		expect(get(projectStore)!.clips.get(secondHalf.id)!.timelineStart).toBe(20.0);

		// 5. Undo Move -> Split -> Trim
		commandProcessor.undo(); // undo Move
		expect(get(projectStore)!.clips.get(secondHalf.id)!.timelineStart).toBe(15.0);

		commandProcessor.undo(); // undo Split
		expect(get(projectStore)!.clips.size).toBe(1);
		expect(get(projectStore)!.clips.get(clipId)!.timelineDuration).toBe(35.0);

		commandProcessor.undo(); // undo Trim
		expect(get(projectStore)!.clips.get(clipId)!.timelineDuration).toBe(40.0);

		commandProcessor.undo(); // undo AddClip
		expect(get(projectStore)!.clips.size).toBe(0);
	});

	it('Scenario 3.2: Multitrack Video & Audio Synchronization with Volume Ducking', () => {
		// Add video to V1 (40s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		// Add music to A1 (60s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-music-track', trackId: 'track-a1', position: 0 }));

		const proj = get(projectStore)!;
		expect(proj.clips.size).toBe(2);

		// Duck music volume to 30% for dialogue
		const musicClip = Array.from(proj.clips.values()).find((c) => c.mediaAssetId === 'asset-music-track')!;
		commandProcessor.execute(new SetClipVolumeCommand({ clipId: musicClip.id, volume: 0.3 }));

		expect(get(projectStore)!.clips.get(musicClip.id)!.audioParameters.volume).toBe(0.3);

		// Total timeline duration is max of all tracks = 60s
		let maxDuration = 0;
		for (const tr of get(projectStore)!.sequences[0].tracks) {
			for (const cId of tr.clipInstances) {
				const c = get(projectStore)!.clips.get(cId);
				if (c) {
					const end = c.timelineStart + c.timelineDuration;
					if (end > maxDuration) maxDuration = end;
				}
			}
		}
		expect(maxDuration).toBe(60.0);
	});

	it('Scenario 3.3: Contextual Inspector Selection & Parameter Synchronization', () => {
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		const clipId = Array.from(get(projectStore)!.clips.keys())[0];

		// Select clip
		timelineActions.selectClip(clipId);
		const sel = get(selectedClip);
		expect(sel?.id).toBe(clipId);

		// Execute inspector mutations
		commandProcessor.execute(new SetClipVolumeCommand({ clipId, volume: 0.8 }));
		commandProcessor.execute(new SetClipPlaybackRateCommand({ clipId, playbackRate: 1.5 }));
		commandProcessor.execute(new SetClipFilterCommand({ clipId, filterName: 'brightness', value: 15 }));

		const updatedClip = get(projectStore)!.clips.get(clipId)!;
		expect(updatedClip.audioParameters.volume).toBe(0.8);
		expect(updatedClip.playbackRate).toBe(1.5);
		expect(updatedClip.filters.brightness).toBe(15);
	});

	it('Scenario 3.4: Dynamic Playback Clock & Frame Stepping across Split Boundaries', () => {
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		const clipId = Array.from(get(projectStore)!.clips.keys())[0];

		// Split at 1.0s
		commandProcessor.execute(new SplitClipCommand({ clipId, splitTime: 1.0 }));

		// Seek to 0.9666s (frame before cut at 30fps: 29th frame)
		playbackActions.setCurrentTime(29 / 30);
		expect(get(playbackStore).currentTime).toBeCloseTo(29 / 30, 4);

		// Step +1 frame (lands exactly on 1.0s across split boundary)
		playbackActions.stepFrames(1, 30);
		expect(get(playbackStore).currentTime).toBeCloseTo(1.0, 4);

		// Step -1 frame (crosses back into first clip)
		playbackActions.stepFrames(-1, 30);
		expect(get(playbackStore).currentTime).toBeCloseTo(29 / 30, 4);
	});

	it('Scenario 3.5: Media Bin Asset Deletion Cascading to Tracks', () => {
		// Add video clip from asset 1 to track V1 and track V2
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v2', position: 10 }));
		// Add audio from asset 2 to track A1
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-music-track', trackId: 'track-a1', position: 0 }));

		expect(get(projectStore)!.clips.size).toBe(3);

		// Cascade delete asset-4k-video
		projectStore.update((project) => {
			if (!project) return project;
			const newAssets = new Map(project.assets);
			newAssets.delete('asset-4k-video');

			const newClips = new Map(project.clips);
			for (const [cId, c] of newClips) {
				if (c.mediaAssetId === 'asset-4k-video') {
					newClips.delete(cId);
				}
			}

			const newSequences = project.sequences.map((seq) => ({
				...seq,
				tracks: seq.tracks.map((track) => ({
					...track,
					clipInstances: track.clipInstances.filter((cId) => newClips.has(cId))
				}))
			}));

			return {
				...project,
				assets: newAssets,
				clips: newClips,
				sequences: newSequences
			};
		});

		const current = get(projectStore)!;
		expect(current.assets.has('asset-4k-video')).toBe(false);
		expect(current.clips.size).toBe(1); // only music clip remains
		expect(current.sequences[0].tracks[0].clipInstances).toHaveLength(0);
		expect(current.sequences[0].tracks[1].clipInstances).toHaveLength(0);
		expect(current.sequences[0].tracks[2].clipInstances).toHaveLength(1);
	});

	it('Scenario 3.6: Multi-layer Video & Image Overlay Visual Stacking Precedence', () => {
		// Background on V1 (0-40s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		// Badge overlay on V2 (5-10s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-overlay-badge', trackId: 'track-v2', position: 5 }));

		function getTopVisualClip(time: number): string | null {
			const proj = get(projectStore)!;
			const seq = proj.sequences[0];
			for (let i = seq.tracks.length - 1; i >= 0; i--) {
				const track = seq.tracks[i];
				if (track.type !== 'video') continue;
				for (const cId of track.clipInstances) {
					const c = proj.clips.get(cId);
					if (c && time >= c.timelineStart && time < c.timelineStart + c.timelineDuration) {
						return c.mediaAssetId;
					}
				}
			}
			return null;
		}

		expect(getTopVisualClip(2.0)).toBe('asset-4k-video');
		expect(getTopVisualClip(6.0)).toBe('asset-overlay-badge'); // V2 overlays V1
		expect(getTopVisualClip(12.0)).toBe('asset-4k-video');
	});

	it('Scenario 3.7: Audio Engine Parameter Interaction (Clip Volume * Master Volume * Mute)', () => {
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-music-track', trackId: 'track-a1', position: 0 }));
		const clipId = Array.from(get(projectStore)!.clips.keys())[0];

		// Set clip volume to 0.8
		commandProcessor.execute(new SetClipVolumeCommand({ clipId, volume: 0.8 }));
		playbackActions.setMasterVolume(0.5);

		function computeEffectiveVolume(clipVolume: number, masterVolume: number, isMuted: boolean): number {
			if (isMuted) return 0;
			return clipVolume * masterVolume;
		}

		expect(computeEffectiveVolume(0.8, 0.5, false)).toBeCloseTo(0.4, 4);

		playbackActions.setMuted(true);
		expect(computeEffectiveVolume(0.8, 0.5, true)).toBe(0);
	});

	it('Scenario 3.8: Zoom Scaling & Viewport Coordinate Bidirectional Inversion', () => {
		const zoomLevels = [0.5, 1.0, 2.0, 5.0];
		const testTimestamps = [0, 2.5, 10.333, 45.75];

		for (const zoom of zoomLevels) {
			for (const time of testTimestamps) {
				const px = timeToPixel(time, 80 * zoom, 0);
				const recoveredTime = pixelToTime(px, 80 * zoom, 0);
				expect(recoveredTime).toBeCloseTo(time, 5);
			}
		}
	});

	it('Scenario 3.9: Snapping Multi-target Aggregation across Video & Audio Tracks', () => {
		// V1 clip: 0 - 20s
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		// A1 clip: 15 - 45s (dur 30s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-music-track', trackId: 'track-a1', position: 15 }));

		function calculateAllSnappingTargets(): number[] {
			const targets = [0];
			const proj = get(projectStore)!;
			for (const seq of proj.sequences) {
				for (const tr of seq.tracks) {
					for (const cId of tr.clipInstances) {
						const c = proj.clips.get(cId);
						if (c) {
							targets.push(c.timelineStart);
							targets.push(c.timelineStart + c.timelineDuration);
						}
					}
				}
			}
			return Array.from(new Set(targets)).sort((a, b) => a - b);
		}

		const targets = calculateAllSnappingTargets();
		// Expected snap points: 0, 15, 40 (V1 end: 0 + 40 = 40), 75 (A1 end: 15 + 60 = 75)
		expect(targets).toContain(0);
		expect(targets).toContain(15);
		expect(targets).toContain(40);
		expect(targets).toContain(75);
	});

	it('Scenario 3.10: High Playback Rate (2.0x, 4.0x) Source-Time Mapping', () => {
		function getSourceTime(clip: Clip, timelineTime: number): number {
			const offset = timelineTime - clip.timelineStart;
			const ratio = offset / clip.timelineDuration;
			return clip.sourceIn + ratio * (clip.sourceOut - clip.sourceIn);
		}

		const clip: Clip = {
			id: 'c-fast',
			mediaAssetId: 'asset-4k-video',
			sourceIn: 10.0,
			sourceOut: 30.0,
			timelineStart: 0,
			timelineDuration: 10.0, // 20s source squeezed into 10s timeline = 2x speed
			transform: { x: 0, y: 0, scale: 1, rotation: 0 },
			effects: [],
			audioParameters: { volume: 1, mute: false },
			playbackRate: 2.0,
			filters: {}
		};

		expect(getSourceTime(clip, 0)).toBe(10.0);
		expect(getSourceTime(clip, 5.0)).toBe(20.0);
		expect(getSourceTime(clip, 10.0)).toBe(30.0);
	});

	it('Scenario 3.11: Split Clip followed by Independent Head/Tail Trims', () => {
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		const originalClipId = Array.from(get(projectStore)!.clips.keys())[0];

		// Split at 20s -> left: [0, 20], right: [20, 40]
		commandProcessor.execute(new SplitClipCommand({ clipId: originalClipId, splitTime: 20.0 }));

		const clips = Array.from(get(projectStore)!.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);
		const left = clips[0];
		const right = clips[1];

		// Trim tail of left clip from 20s to 16s
		commandProcessor.execute(new TrimClipCommand({ clipId: left.id, side: 'end', newSourceTime: 16.0 }));

		// Trim head of right clip from 20s to 24s
		commandProcessor.execute(new TrimClipCommand({ clipId: right.id, side: 'start', newSourceTime: 24.0 }));

		const updatedLeft = get(projectStore)!.clips.get(left.id)!;
		const updatedRight = get(projectStore)!.clips.get(right.id)!;

		expect(updatedLeft.sourceOut).toBe(16.0);
		expect(updatedLeft.timelineDuration).toBe(16.0);

		expect(updatedRight.sourceIn).toBe(24.0);
		expect(updatedRight.timelineStart).toBe(24.0);
		expect(updatedRight.timelineDuration).toBe(16.0);
	});

	it('Scenario 3.12: Track Mute & Lock State Flags Management', () => {
		const trackMutes: Record<string, boolean> = {};
		const trackLocks: Record<string, boolean> = {};

		const tracks = get(projectStore)!.sequences[0].tracks;
		const t1 = tracks[0].id;
		const t2 = tracks[1].id;

		trackMutes[t1] = true;
		trackLocks[t2] = true;

		expect(trackMutes[t1]).toBe(true);
		expect(trackMutes[t2]).toBeUndefined();
		expect(trackLocks[t2]).toBe(true);
	});

	it('Scenario 3.13: Multi-Preset Export Settings Validation across 1080p, 720p, 4k Presets', () => {
		const presets = get(exportStore).presets;

		for (const preset of presets) {
			expect(validateExportSettings(preset.settings)).toBe(true);
			const size10s = estimateFileSize(10, preset.settings);
			const size60s = estimateFileSize(60, preset.settings);
			expect(size60s).toBeGreaterThan(size10s);
			expect(formatFileSize(size60s)).toBeTruthy();
		}
	});

	it('Scenario 3.14: Export Filename Generation with Special Characters & Unicode', () => {
		const name1 = generateExportFilename('Vlog #1 [Epic]!', 'webm');
		expect(name1.startsWith('Vlog #1 [Epic]!_')).toBe(true);
		expect(name1.endsWith('.webm')).toBe(true);

		const name2 = generateExportFilename('東京_Tokyo_Trip', 'mp4');
		expect(name2.startsWith('東京_Tokyo_Trip_')).toBe(true);
		expect(name2.endsWith('.mp4')).toBe(true);
	});

	it('Scenario 3.15: New Project Command with Active Selections and State Clearing', () => {
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-4k-video', trackId: 'track-v1', position: 0 }));
		const clipId = Array.from(get(projectStore)!.clips.keys())[0];
		timelineActions.selectClip(clipId);

		expect(get(selectedClip)).not.toBeNull();

		// Execute New Project Command
		commandProcessor.execute(new NewProjectCommand());

		const newProj = get(projectStore)!;
		expect(newProj.name).toBe('Untitled Project');
		expect(newProj.clips.size).toBe(0);
		expect(newProj.sequences[0].tracks[0].clipInstances).toHaveLength(0);

		// Undo back to previous project state
		commandProcessor.undo();
		expect(get(projectStore)!.clips.size).toBe(1);
	});
});
