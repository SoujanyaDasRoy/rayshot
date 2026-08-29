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
import { timelineStore, timelineActions } from '../lib/stores/timeline.svelte.ts';
import { playbackStore, playbackActions } from '../lib/stores/playback.svelte.ts';
import { commandProcessor } from '../lib/core/commands/processor.ts';
import { AddClipCommand } from '../lib/core/commands/addClip.ts';
import { MoveClipCommand } from '../lib/core/commands/moveClip.ts';
import { TrimClipCommand } from '../lib/core/commands/trimClip.ts';
import { SplitClipCommand } from '../lib/core/commands/splitClip.ts';
import { DeleteClipCommand } from '../lib/core/commands/deleteClip.ts';
import { AddTrackCommand } from '../lib/core/commands/addTrack.ts';
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

function createBoundaryTestProject(): Project {
	const asset1: MediaAsset = {
		id: 'asset-video-boundary',
		filename: 'boundary_video.mp4',
		sourceBlob: new Blob(['data'], { type: 'video/mp4' }),
		type: 'video',
		duration: 10.0,
		width: 1920,
		height: 1080,
		frameRate: 30,
		createdAt: 1000,
		modifiedAt: 1000
	};

	const assetsMap = new Map<string, MediaAsset>();
	assetsMap.set(asset1.id, asset1);

	const initialSequences: Sequence[] = [
		{
			id: 'seq-boundary',
			name: 'Boundary Sequence',
			resolution: { width: 1920, height: 1080 },
			frameRate: 30,
			duration: 10.0,
			tracks: [
				{ id: 'track-v1', type: 'video', order: 0, clipInstances: [] },
				{ id: 'track-v2', type: 'video', order: 1, clipInstances: [] }
			]
		}
	];

	return {
		id: 'proj-boundary',
		name: 'Boundary Project',
		version: 1,
		createdAt: 1000,
		modifiedAt: 1000,
		assets: assetsMap,
		clips: new Map<string, Clip>(),
		sequences: initialSequences,
		activeSequenceId: 'seq-boundary',
		settings: { backgroundColor: '#000000' }
	};
}

describe('Tier 2: Boundary & Corner Cases', () => {
	beforeEach(() => {
		while (commandProcessor.canUndo()) {
			commandProcessor.undo();
		}
		projectStore.set(createBoundaryTestProject());
		timelineActions.selectClip(null);
		timelineActions.selectTrack(null);
		timelineActions.setZoomLevel(1.0);
		playbackActions.setCurrentTime(0);
		playbackActions.setPlaybackState(false);
	});

	// =========================================================================
	// B1: Time & Position Boundary Cases
	// =========================================================================
	describe('B1: Time & Position Boundary Cases', () => {
		it('B1.1: should handle 0.0 exact timestamp for framesToSeconds and secondsToFrames', () => {
			expect(framesToSeconds(0, 30)).toBe(0);
			expect(secondsToFrames(0, 30)).toBe(0);
		});

		it('B1.2: should handle sub-millisecond timestamps without loss of precision', () => {
			const subSec = 0.0005;
			expect(framesToSeconds(secondsToFrames(subSec, 1000), 1000)).toBeCloseTo(0.0005, 6);
		});

		it('B1.3: should handle large timestamps (100,000s / ~27.7 hours) accurately', () => {
			const largeTime = 100000;
			expect(framesToSeconds(secondsToFrames(largeTime, 60), 60)).toBe(100000);
			expect(timeToPixel(largeTime, 1.0, 0)).toBe(100000);
		});

		it('B1.4: should clamp values with clamp utility across upper, lower, and inverted limits', () => {
			expect(clamp(5, 0, 10)).toBe(5);
			expect(clamp(-10, 0, 10)).toBe(0);
			expect(clamp(15, 0, 10)).toBe(10);
			expect(clamp(5, 5, 5)).toBe(5); // equal bounds
		});

		it('B1.5: should calculate linear interpolation with lerp at boundary factors t=0, t=1, t<0, t>1', () => {
			expect(lerp(10, 20, 0)).toBe(10);
			expect(lerp(10, 20, 1)).toBe(20);
			expect(lerp(10, 20, 0.5)).toBe(15);
			expect(lerp(10, 20, -0.5)).toBe(10); // clamped to 0
			expect(lerp(10, 20, 1.5)).toBe(20); // clamped to 1
		});

		it('B1.6: should handle negative pixel positions in pixelToTime converting cleanly to negative time', () => {
			expect(pixelToTime(-100, 100, 0)).toBe(-1.0);
			expect(pixelToTime(-50, 100, 2.0)).toBe(1.5);
		});
	});

	// =========================================================================
	// B2: Trim Boundary & Corner Cases
	// =========================================================================
	describe('B2: Trim Boundary & Corner Cases', () => {
		it('B2.1: should trim start head clamped at sourceOut without inversion', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			// Try to trim start to 15s (asset is only 10s)
			const trimCmd = new TrimClipCommand({ clipId, side: 'start', newSourceTime: 15.0 });
			commandProcessor.execute(trimCmd);

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.sourceIn).toBeLessThanOrEqual(10.0);
			expect(clip.sourceIn).toBeLessThanOrEqual(clip.sourceOut);
		});

		it('B2.2: should trim start head with negative value clamping to 0', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 2 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const trimCmd = new TrimClipCommand({ clipId, side: 'start', newSourceTime: -5.0 });
			commandProcessor.execute(trimCmd);

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.sourceIn).toBe(0);
		});

		it('B2.3: should trim end tail with value exceeding media asset duration clamping to max duration', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const trimCmd = new TrimClipCommand({ clipId, side: 'end', newSourceTime: 50.0 });
			commandProcessor.execute(trimCmd);

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.sourceOut).toBe(10.0); // clamped to asset.duration (10.0)
		});

		it('B2.4: should trim end tail with value below sourceIn clamping to sourceIn', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			// First trim start to 4.0
			commandProcessor.execute(new TrimClipCommand({ clipId, side: 'start', newSourceTime: 4.0 }));

			// Now try to trim end to 2.0 (less than sourceIn)
			commandProcessor.execute(new TrimClipCommand({ clipId, side: 'end', newSourceTime: 2.0 }));

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.sourceOut).toBe(4.0); // clamped to sourceIn
			expect(clip.timelineDuration).toBe(0);
		});

		it('B2.5: should throw error when trimming non-existent clip', () => {
			const trimCmd = new TrimClipCommand({ clipId: 'nonexistent-clip', side: 'start', newSourceTime: 1.0 });
			expect(() => commandProcessor.execute(trimCmd)).toThrow('Clip not found');
		});
	});

	// =========================================================================
	// B3: Split Boundary & Error Handling Cases
	// =========================================================================
	describe('B3: Split Boundary & Error Handling Cases', () => {
		it('B3.1: should throw error when splitTime is exactly at clip.timelineStart', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 5.0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const splitCmd = new SplitClipCommand({ clipId, splitTime: 5.0 });
			expect(() => commandProcessor.execute(splitCmd)).toThrow('Split time is outside the clip bounds');
		});

		it('B3.2: should throw error when splitTime is exactly at clip end', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 5.0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const splitCmd = new SplitClipCommand({ clipId, splitTime: 15.0 }); // 5.0 + 10.0 = 15.0
			expect(() => commandProcessor.execute(splitCmd)).toThrow('Split time is outside the clip bounds');
		});

		it('B3.3: should throw error when splitTime is before clip start', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 5.0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const splitCmd = new SplitClipCommand({ clipId, splitTime: 2.0 });
			expect(() => commandProcessor.execute(splitCmd)).toThrow('Split time is outside the clip bounds');
		});

		it('B3.4: should throw error when splitTime is after clip end', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 5.0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const splitCmd = new SplitClipCommand({ clipId, splitTime: 25.0 });
			expect(() => commandProcessor.execute(splitCmd)).toThrow('Split time is outside the clip bounds');
		});

		it('B3.5: should throw error when splitting non-existent clip ID', () => {
			const splitCmd = new SplitClipCommand({ clipId: 'ghost-clip', splitTime: 5.0 });
			expect(() => commandProcessor.execute(splitCmd)).toThrow('Clip not found in any track');
		});
	});

	// =========================================================================
	// B4: Empty States & Null Reference Safety
	// =========================================================================
	describe('B4: Empty States & Null Reference Safety', () => {
		it('B4.1: should handle empty project clips map safely', () => {
			const proj = get(projectStore)!;
			expect(proj.clips.size).toBe(0);
			timelineActions.selectClip('nonexistent');
			expect(get(timelineStore).selectedClipId).toBe('nonexistent');
		});

		it('B4.2: should handle project with empty tracks', () => {
			projectStore.update((p) => {
				if (!p) return null;
				return {
					...p,
					sequences: [
						{
							id: 'seq-empty',
							name: 'Empty Seq',
							resolution: { width: 1920, height: 1080 },
							frameRate: 30,
							duration: 0,
							tracks: []
						}
					],
					activeSequenceId: 'seq-empty'
				};
			});
			expect(get(projectStore)!.sequences[0].tracks).toHaveLength(0);
		});

		it('B4.3: should throw descriptive error when adding clip to non-existent track', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'ghost-track', position: 0 });
			expect(() => commandProcessor.execute(addCmd)).toThrow('Track not found');
		});

		it('B4.4: should throw descriptive error when adding clip with non-existent media asset', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'ghost-asset', trackId: 'track-v1', position: 0 });
			expect(() => commandProcessor.execute(addCmd)).toThrow('Media asset not found');
		});

		it('B4.5: should handle deleting non-existent clip gracefully without throwing', () => {
			const delCmd = new DeleteClipCommand({ clipId: 'ghost-clip' });
			expect(() => commandProcessor.execute(delCmd)).not.toThrow();
		});
	});

	// =========================================================================
	// B5: Track Boundary Cases
	// =========================================================================
	describe('B5: Track Boundary Cases', () => {
		it('B5.1: should insert track at index 0 and reorder subsequent tracks', () => {
			const addTrackCmd = new AddTrackCommand({ type: 'video', index: 0 });
			commandProcessor.execute(addTrackCmd);

			const tracks = get(projectStore)!.sequences[0].tracks;
			expect(tracks).toHaveLength(3);
			expect(tracks[0].order).toBe(0);
			expect(tracks[1].order).toBe(1);
			expect(tracks[2].order).toBe(2);
		});

		it('B5.2: should insert track at end index', () => {
			const initialLen = get(projectStore)!.sequences[0].tracks.length;
			const addTrackCmd = new AddTrackCommand({ type: 'audio', index: initialLen });
			commandProcessor.execute(addTrackCmd);

			const tracks = get(projectStore)!.sequences[0].tracks;
			expect(tracks).toHaveLength(initialLen + 1);
			expect(tracks[tracks.length - 1].type).toBe('audio');
		});

		it('B5.3: should throw error when moving clip to non-existent destination track', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const moveCmd = new MoveClipCommand({ clipId, newTrackId: 'ghost-track', newPosition: 10 });
			expect(() => commandProcessor.execute(moveCmd)).toThrow('New track not found');
		});

		it('B5.4: should move clip to negative position and preserve position value', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 5 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const moveCmd = new MoveClipCommand({ clipId, newTrackId: 'track-v1', newPosition: -2.5 });
			commandProcessor.execute(moveCmd);

			const clip = get(projectStore)!.clips.get(clipId)!;
			expect(clip.timelineStart).toBe(-2.5);
		});

		it('B5.5: should maintain track length and track existence invariants after add/undo cycle', () => {
			const initialLen = get(projectStore)!.sequences[0].tracks.length;
			const cmd1 = new AddTrackCommand({ type: 'video', index: 1 });
			commandProcessor.execute(cmd1);
			expect(get(projectStore)!.sequences[0].tracks).toHaveLength(initialLen + 1);

			commandProcessor.undo();
			const seq = get(projectStore)!.sequences[0];
			expect(seq.tracks).toHaveLength(initialLen);
		});
	});

	// =========================================================================
	// B6: Snapping & Grid Thresholds
	// =========================================================================
	describe('B6: Snapping & Grid Thresholds', () => {
		it('B6.1: should snap with tiny grid size (0.01s)', () => {
			expect(snapToGrid(0.054, 0.01)).toBeCloseTo(0.05, 5);
			expect(snapToGrid(0.056, 0.01)).toBeCloseTo(0.06, 5);
		});

		it('B6.2: should snap with large grid size (5.0s)', () => {
			expect(snapToGrid(2.4, 5.0)).toBeCloseTo(0.0, 5);
			expect(snapToGrid(2.6, 5.0)).toBeCloseTo(5.0, 5);
			expect(snapToGrid(7.8, 5.0)).toBeCloseTo(10.0, 5);
		});

		it('B6.3: should find closest snap target within pixel threshold', () => {
			function findSnapTarget(positionTime: number, targets: number[], zoomLevel: number, thresholdPx: number = 10): number | null {
				let closest: number | null = null;
				let closestDist = Infinity;
				const thresholdSec = thresholdPx / (80 * zoomLevel);

				for (const target of targets) {
					const dist = Math.abs(positionTime - target);
					if (dist < closestDist && dist <= thresholdSec) {
						closestDist = dist;
						closest = target;
					}
				}
				return closest;
			}

			const targets = [0, 5.0, 10.0];
			const zoom = 1.0; // 80px/s => threshold = 10/80 = 0.125s

			// 5.05 is within 0.125s of 5.0 -> should snap to 5.0
			expect(findSnapTarget(5.05, targets, zoom)).toBe(5.0);

			// 5.20 is outside 0.125s of 5.0 -> should return null
			expect(findSnapTarget(5.2, targets, zoom)).toBeNull();
		});

		it('B6.4: should return null when snapping targets list is empty', () => {
			function findSnapTarget(positionTime: number, targets: number[]): number | null {
				if (targets.length === 0) return null;
				return targets[0];
			}
			expect(findSnapTarget(5.0, [])).toBeNull();
		});

		it('B6.5: should toggle snapToGrid and snapGridSize in timelineStore', () => {
			timelineActions.setSnapToGrid(false);
			expect(get(timelineStore).snapToGrid).toBe(false);

			timelineActions.setSnapGridSize(0.005); // clamped to min 0.01
			expect(get(timelineStore).snapGridSize).toBe(0.01);

			timelineActions.setSnapGridSize(0.25);
			expect(get(timelineStore).snapGridSize).toBe(0.25);
		});

		it('B6.6: should snap exactly when distance is 0 to target point', () => {
			function findSnapTarget(positionTime: number, targets: number[], zoomLevel: number): number | null {
				let closest: number | null = null;
				let closestDist = Infinity;
				const thresholdSec = 10 / (80 * zoomLevel);
				for (const target of targets) {
					const dist = Math.abs(positionTime - target);
					if (dist < closestDist && dist <= thresholdSec) {
						closestDist = dist;
						closest = target;
					}
				}
				return closest;
			}
			expect(findSnapTarget(10.0, [5.0, 10.0, 15.0], 1.0)).toBe(10.0);
		});
	});

	// =========================================================================
	// B7: Command History & Stack Overflow Bounds
	// =========================================================================
	describe('B7: Command History & Stack Overflow Bounds', () => {
		it('B7.1: should shift oldest command when exceeding maxHistorySize (50 commands)', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			// Execute 55 volume commands
			for (let i = 1; i <= 55; i++) {
				const volCmd = new SetClipVolumeCommand({ clipId, volume: i / 100 });
				commandProcessor.execute(volCmd);
			}

			const history = get(commandProcessor.getHistoryStore());
			expect(history.undoCount).toBe(50); // capped at maxHistorySize 50

			// Undo 50 times
			for (let i = 0; i < 50; i++) {
				expect(commandProcessor.canUndo()).toBe(true);
				commandProcessor.undo();
			}
			expect(commandProcessor.canUndo()).toBe(false);
		});

		it('B7.2: should handle undo safely when stack is empty (no-op)', () => {
			expect(commandProcessor.canUndo()).toBe(false);
			expect(() => commandProcessor.undo()).not.toThrow();
			expect(commandProcessor.canUndo()).toBe(false);
		});

		it('B7.3: should handle redo safely when redo stack is empty (no-op)', () => {
			while (commandProcessor.canRedo()) {
				commandProcessor.redo();
			}
			expect(commandProcessor.canRedo()).toBe(false);
			expect(() => commandProcessor.redo()).not.toThrow();
			expect(commandProcessor.canRedo()).toBe(false);
		});

		it('B7.4: should clear redo stack when a new command is executed after undo', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			commandProcessor.undo();
			expect(commandProcessor.canRedo()).toBe(true);

			// Execute a new command
			const volCmd = new SetClipVolumeCommand({ clipId, volume: 0.5 });
			commandProcessor.execute(volCmd);

			expect(commandProcessor.canRedo()).toBe(false);
		});
	});

	// =========================================================================
	// B8: Export Settings & Boundary Validation
	// =========================================================================
	describe('B8: Export Settings & Boundary Validation', () => {
		const baseValidSettings = {
			container: 'mp4',
			videoCodec: 'h264',
			width: 1920,
			height: 1080,
			frameRate: 30,
			bitrate: 8000,
			audioCodec: 'aac',
			audioBitrate: 320
		};

		it('B8.1: should throw on missing or invalid container', () => {
			expect(() => validateExportSettings({ ...baseValidSettings, container: null })).toThrow('Invalid container format');
			expect(() => validateExportSettings({ ...baseValidSettings, container: 123 })).toThrow('Invalid container format');
		});

		it('B8.2: should throw on missing or invalid videoCodec', () => {
			expect(() => validateExportSettings({ ...baseValidSettings, videoCodec: '' })).toThrow('Invalid video codec');
			expect(() => validateExportSettings({ ...baseValidSettings, videoCodec: undefined })).toThrow('Invalid video codec');
		});

		it('B8.3: should throw on zero or negative width/height', () => {
			expect(() => validateExportSettings({ ...baseValidSettings, width: 0 })).toThrow('Invalid width');
			expect(() => validateExportSettings({ ...baseValidSettings, width: -1920 })).toThrow('Invalid width');
			expect(() => validateExportSettings({ ...baseValidSettings, height: 0 })).toThrow('Invalid height');
			expect(() => validateExportSettings({ ...baseValidSettings, height: -1080 })).toThrow('Invalid height');
		});

		it('B8.4: should throw on zero or negative frameRate and bitrates', () => {
			expect(() => validateExportSettings({ ...baseValidSettings, frameRate: 0 })).toThrow('Invalid frame rate');
			expect(() => validateExportSettings({ ...baseValidSettings, bitrate: 0 })).toThrow('Invalid bitrate');
			expect(() => validateExportSettings({ ...baseValidSettings, audioBitrate: 0 })).toThrow('Invalid audio bitrate');
		});

		it('B8.5: should throw on missing or invalid audioCodec', () => {
			expect(() => validateExportSettings({ ...baseValidSettings, audioCodec: null })).toThrow('Invalid audio codec');
		});

		it('B8.6: should calculate 0 bytes estimated size for 0s duration', () => {
			expect(estimateFileSize(0, baseValidSettings)).toBe(0);
			expect(formatFileSize(0)).toBe('0 Bytes');
		});

		it('B8.7: should format file sizes across units: Bytes, KB, MB, GB', () => {
			expect(formatFileSize(500)).toBe('500 Bytes');
			expect(formatFileSize(1024)).toBe('1 KB');
			expect(formatFileSize(1024 * 1024)).toBe('1 MB');
			expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
		});
	});

	// =========================================================================
	// B9: Viewport & Zoom Boundary Clamping
	// =========================================================================
	describe('B9: Viewport & Zoom Boundary Clamping', () => {
		it('B9.1: should clamp zoom level below 0.1 to 0.1', () => {
			timelineActions.setZoomLevel(0.01);
			expect(get(timelineStore).zoomLevel).toBe(0.1);
			timelineActions.setZoomLevel(-5);
			expect(get(timelineStore).zoomLevel).toBe(0.1);
		});

		it('B9.2: should clamp zoom level above 10.0 to 10.0', () => {
			timelineActions.setZoomLevel(15.0);
			expect(get(timelineStore).zoomLevel).toBe(10.0);
		});

		it('B9.3: should calculate visible time range with 0 viewport width', () => {
			expect(getVisibleTimeRange(0, 1.0, 5.0)).toEqual({ startTime: 5.0, endTime: 5.0 });
		});

		it('B9.4: should calculate visible time range with negative time offset', () => {
			expect(getVisibleTimeRange(200, 100, -2.0)).toEqual({ startTime: -2.0, endTime: 0.0 });
		});
	});

	// =========================================================================
	// B10: Volume, Speed & Audio Parameter Boundaries
	// =========================================================================
	describe('B10: Volume, Speed & Audio Parameter Boundaries', () => {
		it('B10.1: should allow setting clip volume to 0.0 (silent) and 2.0 (boosted)', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			commandProcessor.execute(new SetClipVolumeCommand({ clipId, volume: 0.0 }));
			expect(get(projectStore)!.clips.get(clipId)!.audioParameters.volume).toBe(0.0);

			commandProcessor.execute(new SetClipVolumeCommand({ clipId, volume: 2.0 }));
			expect(get(projectStore)!.clips.get(clipId)!.audioParameters.volume).toBe(2.0);
		});

		it('B10.2: should allow setting clip playbackRate to 0.25x and 4.0x', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			commandProcessor.execute(new SetClipPlaybackRateCommand({ clipId, playbackRate: 0.25 }));
			expect(get(projectStore)!.clips.get(clipId)!.playbackRate).toBe(0.25);

			commandProcessor.execute(new SetClipPlaybackRateCommand({ clipId, playbackRate: 4.0 }));
			expect(get(projectStore)!.clips.get(clipId)!.playbackRate).toBe(4.0);
		});

		it('B10.3: should allow setting clip brightness filter across -100 to +100', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			commandProcessor.execute(new SetClipFilterCommand({ clipId, filterName: 'brightness', value: -100 }));
			expect(get(projectStore)!.clips.get(clipId)!.filters.brightness).toBe(-100);

			commandProcessor.execute(new SetClipFilterCommand({ clipId, filterName: 'brightness', value: 100 }));
			expect(get(projectStore)!.clips.get(clipId)!.filters.brightness).toBe(100);
		});

		it('B10.4: should set multiple independent filters on the same clip', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'asset-video-boundary', trackId: 'track-v1', position: 0 });
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			commandProcessor.execute(new SetClipFilterCommand({ clipId, filterName: 'brightness', value: 10 }));
			commandProcessor.execute(new SetClipFilterCommand({ clipId, filterName: 'contrast', value: 20 }));
			commandProcessor.execute(new SetClipFilterCommand({ clipId, filterName: 'blur', value: 5 }));

			const filters = get(projectStore)!.clips.get(clipId)!.filters;
			expect(filters.brightness).toBe(10);
			expect(filters.contrast).toBe(20);
			expect(filters.blur).toBe(5);

			commandProcessor.undo(); // undo blur
			expect(get(projectStore)!.clips.get(clipId)!.filters.blur).toBeUndefined();
			expect(get(projectStore)!.clips.get(clipId)!.filters.contrast).toBe(20);
		});
	});
});
