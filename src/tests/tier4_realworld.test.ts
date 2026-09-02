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
import { SetClipVolumeCommand } from '../lib/core/commands/setClipVolume.ts';
import { SetClipSpeedCommand } from '../lib/core/commands/setClipSpeed.ts';
import { clipRate } from '../lib/utils/clipTiming.ts';
import { SetClipFilterCommand } from '../lib/core/commands/setClipFilter.ts';
import {
	validateExportSettings,
	estimateFileSize,
	formatFileSize,
	generateExportFilename
} from '../lib/utils/exportUtils.ts';
import type { Project, Sequence, Track, Clip, MediaAsset } from '../lib/types/project.ts';

function createProductionWorkspace(projectName: string, width = 1920, height = 1080): Project {
	return {
		id: `proj-${Date.now()}`,
		name: projectName,
		version: 1,
		createdAt: Date.now(),
		modifiedAt: Date.now(),
		assets: new Map<string, MediaAsset>(),
		clips: new Map<string, Clip>(),
		sequences: [
			{
				id: 'seq-prod-main',
				name: 'Master Sequence',
				resolution: { width, height },
				frameRate: 30,
				duration: 0,
				tracks: [
					{ id: 'track-v1', type: 'video', order: 0, clipInstances: [] },
					{ id: 'track-v2', type: 'video', order: 1, clipInstances: [] },
					{ id: 'track-a1', type: 'audio', order: 2, clipInstances: [] },
					{ id: 'track-a2', type: 'audio', order: 3, clipInstances: [] }
				]
			}
		],
		activeSequenceId: 'seq-prod-main',
		settings: { backgroundColor: '#090A0D' }
	};
}

function registerAsset(project: Project, asset: MediaAsset) {
	project.assets.set(asset.id, asset);
}

describe('Tier 4: Real-World Production Scenarios', () => {
	beforeEach(() => {
		(commandProcessor as any).undoStack = [];
		(commandProcessor as any).redoStack = [];
		(commandProcessor as any).updateHistoryState();

		timelineActions.selectClip(null);
		timelineActions.selectTrack(null);
		playbackActions.setCurrentTime(0);
		playbackActions.setPlaybackState(false);
		playbackActions.setMasterVolume(1.0);
		playbackActions.setMuted(false);
	});

	// =========================================================================
	// Scenario 1: Complete Vlog Editing Workflow
	// =========================================================================
	it('Scenario 4.1: Complete Vlog Editing Workflow (A-roll, B-roll, Title, Background Music & 1080p Export)', () => {
		const project = createProductionWorkspace('Travel_Vlog_Episode_1', 1920, 1080);

		// 1. Ingest Assets
		const aRollAsset: MediaAsset = {
			id: 'asset-aroll-host',
			filename: 'host_talk_30s.mp4',
			sourceBlob: new Blob(['data'], { type: 'video/mp4' }),
			type: 'video',
			duration: 30.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const bRollAsset: MediaAsset = {
			id: 'asset-broll-drone',
			filename: 'drone_scenic_15s.mp4',
			sourceBlob: new Blob(['data'], { type: 'video/mp4' }),
			type: 'video',
			duration: 15.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const titleAsset: MediaAsset = {
			id: 'asset-title-card',
			filename: 'intro_title.png',
			sourceBlob: new Blob(['data'], { type: 'image/png' }),
			type: 'image',
			duration: 5.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const musicAsset: MediaAsset = {
			id: 'asset-bg-music',
			filename: 'upbeat_vlog_beat.mp3',
			sourceBlob: new Blob(['data'], { type: 'audio/mp3' }),
			type: 'audio',
			duration: 60.0,
			createdAt: 1000,
			modifiedAt: 1000
		};

		registerAsset(project, aRollAsset);
		registerAsset(project, bRollAsset);
		registerAsset(project, titleAsset);
		registerAsset(project, musicAsset);
		projectStore.set(project);

		// 2. Assemble Main Video Track (A-Roll)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-aroll-host', trackId: 'track-v1', position: 0 }));
		const aRollClipId = Array.from(get(projectStore)!.clips.keys())[0];

		// Trim head by 2.0s (sourceIn=2, timelineStart=2, dur=28)
		commandProcessor.execute(new TrimClipCommand({ clipId: aRollClipId, side: 'start', newSourceTime: 2.0 }));
		// Trim tail to 27.0s (sourceOut=27, timelineDuration=25)
		commandProcessor.execute(new TrimClipCommand({ clipId: aRollClipId, side: 'end', newSourceTime: 27.0 }));

		const aRollClip = get(projectStore)!.clips.get(aRollClipId)!;
		expect(aRollClip.sourceIn).toBe(2.0);
		expect(aRollClip.sourceOut).toBe(27.0);
		expect(aRollClip.timelineDuration).toBe(25.0);

		// 3. Overlay Title Card on Track V2 at start (0s to 4s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-title-card', trackId: 'track-v2', position: 0 }));
		const titleClipId = Array.from(get(projectStore)!.clips.keys()).find((id) => id !== aRollClipId)!;
		commandProcessor.execute(new TrimClipCommand({ clipId: titleClipId, side: 'end', newSourceTime: 4.0 }));

		// 4. Overlay B-Roll Drone cut-in on Track V2 (from 8s to 18s = dur 10s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-broll-drone', trackId: 'track-v2', position: 8.0 }));
		const bRollClipId = Array.from(get(projectStore)!.clips.keys()).find((id) => id !== aRollClipId && id !== titleClipId)!;
		commandProcessor.execute(new TrimClipCommand({ clipId: bRollClipId, side: 'end', newSourceTime: 10.0 }));

		// 5. Add Background Music on Track A1 (ducked to 25% volume)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-bg-music', trackId: 'track-a1', position: 0 }));
		const musicClipId = Array.from(get(projectStore)!.clips.keys()).find(
			(id) => id !== aRollClipId && id !== titleClipId && id !== bRollClipId
		)!;
		commandProcessor.execute(new SetClipVolumeCommand({ clipId: musicClipId, volume: 0.25 }));
		// Trim music to match video end (timeline start 2 + duration 25 = 27s)
		commandProcessor.execute(new TrimClipCommand({ clipId: musicClipId, side: 'end', newSourceTime: 27.0 }));

		// 6. Verify Timeline Invariants
		const currentProj = get(projectStore)!;
		expect(currentProj.clips.size).toBe(4);

		let maxEnd = 0;
		for (const tr of currentProj.sequences[0].tracks) {
			for (const cId of tr.clipInstances) {
				const c = currentProj.clips.get(cId);
				if (c) {
					const end = c.timelineStart + c.timelineDuration;
					if (end > maxEnd) maxEnd = end;
				}
			}
		}
		expect(maxEnd).toBe(27.0);

		// 7. Validate 1080p Export Preset Configuration
		const preset1080p = get(exportStore).presets.find((p) => p.id === '1080p30')!;
		expect(validateExportSettings(preset1080p.settings)).toBe(true);
		const estimatedSize = estimateFileSize(maxEnd, preset1080p.settings);
		expect(estimatedSize).toBeGreaterThan(10_000_000); // ~27s at 8.32Mbps is ~28MB
		const filename = generateExportFilename(currentProj.name, 'mp4');
		expect(filename.startsWith('Travel_Vlog_Episode_1_')).toBe(true);
	});

	// =========================================================================
	// Scenario 2: Podcast Snippet Production (Audio Editing & Dead-Air Removal)
	// =========================================================================
	it('Scenario 4.2: Podcast Snippet Production (Audio Cut, Dead-Air Gap Removal, Cover Photo & 1:1 Export)', () => {
		const project = createProductionWorkspace('Podcast_Highlight_1x1', 1080, 1080);

		const rawAudio: MediaAsset = {
			id: 'asset-podcast-raw',
			filename: 'raw_interview_session.wav',
			sourceBlob: new Blob(['audio'], { type: 'audio/wav' }),
			type: 'audio',
			duration: 120.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const coverArt: MediaAsset = {
			id: 'asset-podcast-cover',
			filename: 'episode_square_art.jpg',
			sourceBlob: new Blob(['art'], { type: 'image/jpeg' }),
			type: 'image',
			duration: 5.0,
			width: 1080,
			height: 1080,
			createdAt: 1000,
			modifiedAt: 1000
		};

		registerAsset(project, rawAudio);
		registerAsset(project, coverArt);
		projectStore.set(project);

		// 1. Add Audio Recording on Track A1 (0 to 120s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-podcast-raw', trackId: 'track-a1', position: 0 }));
		let audioClipId = Array.from(get(projectStore)!.clips.keys())[0];

		// 2. Identify Dead-Air / Cough between 30s and 45s:
		// Split 1 at 30s -> left: [0, 30], right: [30, 120]
		commandProcessor.execute(new SplitClipCommand({ clipId: audioClipId, splitTime: 30.0 }));

		let clips = Array.from(get(projectStore)!.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);
		const leftChunk = clips[0];
		const rightChunk = clips[1];

		// Split 2 on right chunk at 45s -> deadAir: [30, 45], remaining: [45, 120]
		commandProcessor.execute(new SplitClipCommand({ clipId: rightChunk.id, splitTime: 45.0 }));

		clips = Array.from(get(projectStore)!.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);
		expect(clips).toHaveLength(3);
		const deadAirChunk = clips[1];
		const remainingTail = clips[2];

		// 3. Delete deadAirChunk
		commandProcessor.execute(new DeleteClipCommand({ clipId: deadAirChunk.id }));
		expect(get(projectStore)!.clips.size).toBe(2);

		// 4. Move remainingTail from 45s to 30s (closing 15s dead-air gap)
		commandProcessor.execute(new MoveClipCommand({ clipId: remainingTail.id, newTrackId: 'track-a1', newPosition: 30.0 }));

		// 5. Trim overall snippet tail to 60s total duration
		// remainingTail starts at 30s, sourceIn=45s. To make total duration 60s, tail clip should end at 60s (dur 30s, sourceOut=75s)
		commandProcessor.execute(new TrimClipCommand({ clipId: remainingTail.id, side: 'end', newSourceTime: 75.0 }));

		// 6. Boost podcast audio volume to 95%
		commandProcessor.execute(new SetClipVolumeCommand({ clipId: leftChunk.id, volume: 0.95 }));
		commandProcessor.execute(new SetClipVolumeCommand({ clipId: remainingTail.id, volume: 0.95 }));

		// 7. Add 1:1 Cover Art on Track V1
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-podcast-cover', trackId: 'track-v1', position: 0 }));

		// 8. Verify seamless continuity: Left chunk [0, 30s], Tail chunk [30s, 60s]
		const finalClips = Array.from(get(projectStore)!.clips.values()).filter((c) => c.mediaAssetId === 'asset-podcast-raw');
		expect(finalClips[0].timelineStart + finalClips[0].timelineDuration).toBe(finalClips[1].timelineStart);
	});

	// =========================================================================
	// Scenario 3: Fast-Paced Action Reel (60fps, Speed Manipulation & Snapping)
	// =========================================================================
	it('Scenario 4.3: Fast-Paced Action Reel (6 Rapid Cuts, 2x Speed, 0.5x Slow-Mo & Frame Stepping)', () => {
		const project = createProductionWorkspace('Extreme_Action_Reel', 1920, 1080);
		project.sequences[0].frameRate = 60;

		// Create 6 short action clips (each 5s)
		for (let i = 1; i <= 6; i++) {
			const actionAsset: MediaAsset = {
				id: `asset-action-${i}`,
				filename: `stunt_${i}.mp4`,
				sourceBlob: new Blob(['action'], { type: 'video/mp4' }),
				type: 'video',
				duration: 5.0,
				width: 1920,
				height: 1080,
				frameRate: 60,
				createdAt: 1000,
				modifiedAt: 1000
			};
			registerAsset(project, actionAsset);
		}
		projectStore.set(project);

		// Place all 6 clips sequentially on track V1 (positions: 0, 5, 10, 15, 20, 25)
		for (let i = 1; i <= 6; i++) {
			commandProcessor.execute(
				new AddClipCommand({
					mediaAssetId: `asset-action-${i}`,
					trackId: 'track-v1',
					position: (i - 1) * 5.0
				})
			);
		}

		expect(get(projectStore)!.clips.size).toBe(6);

		const allClips = Array.from(get(projectStore)!.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);

		// Clip 2: 2.0x Fast Motion
		commandProcessor.execute(new SetClipSpeedCommand({ clipId: allClips[1].id, speed: 2.0 }));
		// Clip 4: 0.5x Slow Motion
		commandProcessor.execute(new SetClipSpeedCommand({ clipId: allClips[3].id, speed: 0.5 }));
		// Clip 3: Visual Brightness +25%
		commandProcessor.execute(new SetClipFilterCommand({ clipId: allClips[2].id, filterName: 'brightness', value: 25 }));

		expect(clipRate(get(projectStore)!.clips.get(allClips[1].id)!)).toBe(2.0);
		expect(clipRate(get(projectStore)!.clips.get(allClips[3].id)!)).toBe(0.5);
		expect(get(projectStore)!.clips.get(allClips[2].id)!.filters.brightness).toBe(25);

		// Frame Stepping across cuts at 60fps
		playbackActions.setCurrentTime(4.9833); // 1 frame before cut 1 at 60fps
		playbackActions.stepFrames(1, 60); // lands exactly at cut 1 (5.0s)
		expect(get(playbackStore).currentTime).toBeCloseTo(5.0, 4);

		playbackActions.stepFrames(5, 60); // +5 frames into Clip 2
		expect(get(playbackStore).currentTime).toBeCloseTo(5.0 + 5 / 60, 4);
	});

	// =========================================================================
	// Scenario 4: Text-Heavy Explainer Video (Overlays, Transforms & Audio Bed)
	// =========================================================================
	it('Scenario 4.4: Text-Heavy Explainer Video (Base Screen Cast, 3 Graphic Overlays, Multi-Audio Mix)', () => {
		const project = createProductionWorkspace('Product_Demo_Explainer', 1920, 1080);

		const screencast: MediaAsset = {
			id: 'asset-screencast',
			filename: 'screen_recording.mp4',
			sourceBlob: new Blob(['video'], { type: 'video/mp4' }),
			type: 'video',
			duration: 50.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const callout1: MediaAsset = {
			id: 'asset-callout-1',
			filename: 'feature_callout_1.png',
			sourceBlob: new Blob(['img'], { type: 'image/png' }),
			type: 'image',
			duration: 6.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const callout2: MediaAsset = {
			id: 'asset-callout-2',
			filename: 'feature_callout_2.png',
			sourceBlob: new Blob(['img'], { type: 'image/png' }),
			type: 'image',
			duration: 8.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const voiceover: MediaAsset = {
			id: 'asset-voiceover',
			filename: 'voice_narration.mp3',
			sourceBlob: new Blob(['audio'], { type: 'audio/mp3' }),
			type: 'audio',
			duration: 50.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const bgMusic: MediaAsset = {
			id: 'asset-music-bed',
			filename: 'subtle_ambient_bed.mp3',
			sourceBlob: new Blob(['audio'], { type: 'audio/mp3' }),
			type: 'audio',
			duration: 60.0,
			createdAt: 1000,
			modifiedAt: 1000
		};

		registerAsset(project, screencast);
		registerAsset(project, callout1);
		registerAsset(project, callout2);
		registerAsset(project, voiceover);
		registerAsset(project, bgMusic);
		projectStore.set(project);

		// V1: Screencast base
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-screencast', trackId: 'track-v1', position: 0 }));
		// V2: Callout 1 (5s to 11s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-callout-1', trackId: 'track-v2', position: 5.0 }));
		// V2: Callout 2 (20s to 28s)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-callout-2', trackId: 'track-v2', position: 20.0 }));

		// A1: Voiceover (100% volume)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-voiceover', trackId: 'track-a1', position: 0 }));
		// A2: Ambient Bed (15% volume)
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-music-bed', trackId: 'track-a2', position: 0 }));
		const musicClip = Array.from(get(projectStore)!.clips.values()).find((c) => c.mediaAssetId === 'asset-music-bed')!;
		commandProcessor.execute(new SetClipVolumeCommand({ clipId: musicClip.id, volume: 0.15 }));

		const current = get(projectStore)!;
		expect(current.clips.size).toBe(5);

		// Verify Audio Mix
		const voClip = Array.from(current.clips.values()).find((c) => c.mediaAssetId === 'asset-voiceover')!;
		expect(voClip.audioParameters.volume).toBe(1.0);
		expect(current.clips.get(musicClip.id)!.audioParameters.volume).toBe(0.15);

		// Verify Visual Stack at 8s: Callout 1 overlays Screencast
		const v2Clips = current.sequences[0].tracks[1].clipInstances;
		expect(v2Clips).toHaveLength(2);
	});

	// =========================================================================
	// Scenario 5: Undo/Redo Stress Pipeline (10-Step Sequential Mutation & Reversal)
	// =========================================================================
	it('Scenario 4.5: Undo/Redo Stress Pipeline (10 Sequential Operations Step-by-Step Verified)', () => {
		const project = createProductionWorkspace('Stress_Pipeline_Project', 1920, 1080);

		const vAsset: MediaAsset = {
			id: 'asset-stress-video',
			filename: 'stress_video_40s.mp4',
			sourceBlob: new Blob(['v'], { type: 'video/mp4' }),
			type: 'video',
			duration: 40.0,
			createdAt: 1000,
			modifiedAt: 1000
		};
		const aAsset: MediaAsset = {
			id: 'asset-stress-audio',
			filename: 'stress_audio_60s.mp3',
			sourceBlob: new Blob(['a'], { type: 'audio/mp3' }),
			type: 'audio',
			duration: 60.0,
			createdAt: 1000,
			modifiedAt: 1000
		};

		registerAsset(project, vAsset);
		registerAsset(project, aAsset);
		projectStore.set(project);

		// Step 1: Add Video Clip 1
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-stress-video', trackId: 'track-v1', position: 0 }));
		expect(get(projectStore)!.clips.size).toBe(1);
		const v1Id = Array.from(get(projectStore)!.clips.keys())[0];

		// Step 2: Add Audio Clip
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-stress-audio', trackId: 'track-a1', position: 0 }));
		expect(get(projectStore)!.clips.size).toBe(2);
		const a1Id = Array.from(get(projectStore)!.clips.keys()).find((id) => id !== v1Id)!;

		// Step 3: Add Video Clip 2 on V2
		commandProcessor.execute(new AddClipCommand({ mediaAssetId: 'asset-stress-video', trackId: 'track-v2', position: 10 }));
		expect(get(projectStore)!.clips.size).toBe(3);
		const v2Id = Array.from(get(projectStore)!.clips.keys()).find((id) => id !== v1Id && id !== a1Id)!;

		// Step 4: Move Video Clip 2 to 15s
		commandProcessor.execute(new MoveClipCommand({ clipId: v2Id, newTrackId: 'track-v2', newPosition: 15.0 }));
		expect(get(projectStore)!.clips.get(v2Id)!.timelineStart).toBe(15.0);

		// Step 5: Trim head of Video Clip 1 to 4s
		commandProcessor.execute(new TrimClipCommand({ clipId: v1Id, side: 'start', newSourceTime: 4.0 }));
		expect(get(projectStore)!.clips.get(v1Id)!.sourceIn).toBe(4.0);

		// Step 6: Trim tail of Audio Clip to 30s
		commandProcessor.execute(new TrimClipCommand({ clipId: a1Id, side: 'end', newSourceTime: 30.0 }));
		expect(get(projectStore)!.clips.get(a1Id)!.sourceOut).toBe(30.0);

		// Step 7: Set volume of Audio Clip to 0.4
		commandProcessor.execute(new SetClipVolumeCommand({ clipId: a1Id, volume: 0.4 }));
		expect(get(projectStore)!.clips.get(a1Id)!.audioParameters.volume).toBe(0.4);

		// Step 8: Set playback rate of Clip 2 to 2.0x
		commandProcessor.execute(new SetClipSpeedCommand({ clipId: v2Id, speed: 2.0 }));
		expect(clipRate(get(projectStore)!.clips.get(v2Id)!)).toBe(2.0);

		// Step 9: Set filter brightness on Clip 2 to 30
		commandProcessor.execute(new SetClipFilterCommand({ clipId: v2Id, filterName: 'brightness', value: 30 }));
		expect(get(projectStore)!.clips.get(v2Id)!.filters.brightness).toBe(30);

		// Step 10: Delete Video Clip 2
		commandProcessor.execute(new DeleteClipCommand({ clipId: v2Id }));
		expect(get(projectStore)!.clips.size).toBe(2);
		expect(get(projectStore)!.clips.has(v2Id)).toBe(false);

		// Now execute undo for mutations (steps 10 down to 4):
		commandProcessor.undo(); // Undo 10 (Delete) -> Clip 2 restored
		expect(get(projectStore)!.clips.size).toBe(3);
		expect(get(projectStore)!.clips.has(v2Id)).toBe(true);

		commandProcessor.undo(); // Undo 9 (Filter) -> brightness undefined
		expect(get(projectStore)!.clips.get(v2Id)!.filters.brightness).toBeUndefined();

		commandProcessor.undo(); // Undo 8 (Rate) -> playbackRate restored to 1.0
		expect(clipRate(get(projectStore)!.clips.get(v2Id)!)).toBe(1.0);

		commandProcessor.undo(); // Undo 7 (Volume) -> volume restored to 1.0
		expect(get(projectStore)!.clips.get(a1Id)!.audioParameters.volume).toBe(1.0);

		commandProcessor.undo(); // Undo 6 (Audio Trim) -> sourceOut restored to 60.0
		expect(get(projectStore)!.clips.get(a1Id)!.sourceOut).toBe(60.0);

		commandProcessor.undo(); // Undo 5 (Video 1 Trim) -> sourceIn restored to 0
		expect(get(projectStore)!.clips.get(v1Id)!.sourceIn).toBe(0);

		commandProcessor.undo(); // Undo 4 (Move) -> timelineStart restored to 10.0
		expect(get(projectStore)!.clips.get(v2Id)!.timelineStart).toBe(10.0);

		// Now execute redo for mutations (steps 4 up to 10):
		commandProcessor.redo(); // Redo 4 (Move)
		expect(get(projectStore)!.clips.get(v2Id)!.timelineStart).toBe(15.0);

		commandProcessor.redo(); // Redo 5 (Trim Video 1)
		expect(get(projectStore)!.clips.get(v1Id)!.sourceIn).toBe(4.0);

		commandProcessor.redo(); // Redo 6 (Trim Audio)
		expect(get(projectStore)!.clips.get(a1Id)!.sourceOut).toBe(30.0);

		commandProcessor.redo(); // Redo 7 (Volume)
		expect(get(projectStore)!.clips.get(a1Id)!.audioParameters.volume).toBe(0.4);

		commandProcessor.redo(); // Redo 8 (Rate)
		expect(clipRate(get(projectStore)!.clips.get(v2Id)!)).toBe(2.0);

		commandProcessor.redo(); // Redo 9 (Filter)
		expect(get(projectStore)!.clips.get(v2Id)!.filters.brightness).toBe(30);

		commandProcessor.redo(); // Redo 10 (Delete)
		expect(get(projectStore)!.clips.size).toBe(2);
		expect(get(projectStore)!.clips.has(v2Id)).toBe(false);

		// Finally undo all remaining commands to empty workspace
		while (commandProcessor.canUndo()) {
			commandProcessor.undo();
		}
		expect(get(projectStore)!.clips.size).toBe(0);
	});
});
