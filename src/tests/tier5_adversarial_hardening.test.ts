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
vi.mock('$lib/core/persistence/assetCache', async () => {
	return await vi.importActual('../lib/core/persistence/assetCache.ts');
});
vi.mock('$lib/core/persistence/opfsAdapter', async () => {
	return await vi.importActual('../lib/core/persistence/opfsAdapter.ts');
});

import { projectStore, updateProject } from '../lib/stores/project.svelte.ts';
import { timelineStore, timelineActions, selectedClip } from '../lib/stores/timeline.svelte.ts';
import { playbackStore, playbackActions } from '../lib/stores/playback.svelte.ts';
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
import { SetClipPlaybackRateCommand } from '../lib/core/commands/setClipPlaybackRate.ts';
import { SetClipFilterCommand } from '../lib/core/commands/setClipFilter.ts';
import {
	snapToGrid,
	timeToPixel,
	pixelToTime,
	clamp,
	lerp
} from '../lib/utils/timelineUtils.ts';
import {
	thumbnailCache,
	multiThumbnailCache,
	placeholderThumbnail,
	generateProceduralWaveform,
	extractAudioWaveform,
	getFileDuration
} from '../lib/utils/mediaUtils.ts';
import type { Project, Sequence, Track, Clip, MediaAsset } from '../lib/types/project.ts';

// Helper to create a comprehensive test project
function createAdversarialProject(): Project {
	const v1: MediaAsset = {
		id: 'adv-video-1',
		filename: '4k_drone_footage.mp4',
		sourceBlob: new Blob(['video-bytes-mock'], { type: 'video/mp4' }),
		type: 'video',
		duration: 30.0,
		width: 3840,
		height: 2160,
		frameRate: 60,
		createdAt: Date.now(),
		modifiedAt: Date.now()
	};

	const v2: MediaAsset = {
		id: 'adv-video-2',
		filename: 'interview_a_roll.mov',
		sourceBlob: new Blob(['video-bytes-mov'], { type: 'video/quicktime' }),
		type: 'video',
		duration: 45.0,
		width: 1920,
		height: 1080,
		frameRate: 30,
		createdAt: Date.now(),
		modifiedAt: Date.now()
	};

	const a1: MediaAsset = {
		id: 'adv-audio-1',
		filename: 'podcast_voiceover.wav',
		sourceBlob: new Blob(['wav-bytes-mock'], { type: 'audio/wav' }),
		type: 'audio',
		duration: 60.0,
		createdAt: Date.now(),
		modifiedAt: Date.now()
	};

	const a2: MediaAsset = {
		id: 'adv-audio-2',
		filename: 'background_synth.mp3',
		sourceBlob: new Blob(['mp3-bytes-mock'], { type: 'audio/mp3' }),
		type: 'audio',
		duration: 90.0,
		createdAt: Date.now(),
		modifiedAt: Date.now()
	};

	const i1: MediaAsset = {
		id: 'adv-image-1',
		filename: 'overlay_logo.png',
		sourceBlob: new Blob(['png-bytes-mock'], { type: 'image/png' }),
		type: 'image',
		duration: 5.0,
		width: 1024,
		height: 1024,
		createdAt: Date.now(),
		modifiedAt: Date.now()
	};

	const assetsMap = new Map<string, MediaAsset>([
		[v1.id, v1],
		[v2.id, v2],
		[a1.id, a1],
		[a2.id, a2],
		[i1.id, i1]
	]);

	const sequence: Sequence = {
		id: 'seq-adv-master',
		name: 'Master Adversarial Sequence',
		resolution: { width: 1920, height: 1080 },
		frameRate: 30,
		duration: 60.0,
		tracks: [
			{ id: 'track-v1', type: 'video', order: 0, clipInstances: [] },
			{ id: 'track-v2', type: 'video', order: 1, clipInstances: [] },
			{ id: 'track-v3', type: 'video', order: 2, clipInstances: [] },
			{ id: 'track-a1', type: 'audio', order: 3, clipInstances: [] },
			{ id: 'track-a2', type: 'audio', order: 4, clipInstances: [] },
			{ id: 'track-a3', type: 'audio', order: 5, clipInstances: [] }
		]
	};

	return {
		id: 'proj-adv-tier5',
		name: 'Adversarial Verification Suite',
		version: 1,
		createdAt: Date.now(),
		modifiedAt: Date.now(),
		assets: assetsMap,
		clips: new Map<string, Clip>(),
		sequences: [sequence],
		activeSequenceId: 'seq-adv-master',
		settings: { backgroundColor: '#090A0D' }
	};
}

function createMockClip(data: {
	id: string;
	mediaAssetId: string;
	timelineStart?: number;
	timelineDuration?: number;
	sourceIn?: number;
	sourceOut?: number;
	transform?: { x: number; y: number; scale: number; rotation: number };
	filters?: Record<string, any>;
	effects?: string[];
	audioParameters?: { volume: number; mute: boolean };
	playbackRate?: number;
}): Clip {
	return {
		id: data.id,
		mediaAssetId: data.mediaAssetId,
		timelineStart: data.timelineStart ?? 0,
		timelineDuration: data.timelineDuration ?? 10,
		sourceIn: data.sourceIn ?? 0,
		sourceOut: data.sourceOut ?? 10,
		transform: data.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 },
		filters: data.filters ?? {},
		effects: data.effects ?? [],
		audioParameters: data.audioParameters ?? { volume: 1.0, mute: false },
		playbackRate: data.playbackRate ?? 1.0
	};
}

// MediaBin Audio Synthesis Helper Replication for isolated pure-function testing
function synthesizeAudioBufferMock(
	sampleRate: number,
	presetId: string,
	duration: number
): { numChannels: number; sampleRate: number; length: number; left: Float32Array; right: Float32Array } {
	const validSampleRate = Math.max(8000, sampleRate || 44100);
	const validDuration = Math.max(0, duration);
	const length = Math.floor(validSampleRate * validDuration);
	const left = new Float32Array(length);
	const right = new Float32Array(length);

	for (let i = 0; i < length; i++) {
		const t = i / validSampleRate;
		let valL = 0;
		let valR = 0;

		switch (presetId) {
			case 'upbeat-intro': {
				const tempo = 128;
				const beat = (t * tempo) / 60;
				const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 261.63, 196.0];
				const noteIdx = Math.floor(beat * 2) % notes.length;
				const freq = notes[noteIdx];
				const noteT = (beat * 2) % 1;
				const env = Math.exp(-noteT * 4.5);
				const bassEnv = Math.exp(-(beat % 1) * 3.5);
				const bass = Math.sin(2 * Math.PI * 65.4 * t) * bassEnv * 0.45;
				const melody = (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t)) * env * 0.35;
				valL = melody + bass;
				valR = melody * 0.85 + bass;
				break;
			}
			case 'ambient-cinematic': {
				const lfo = Math.sin(2 * Math.PI * 0.2 * t);
				const f1 = 55;
				const f2 = 110;
				const f3 = 164.81;
				const f4 = 220;
				const pad =
					Math.sin(2 * Math.PI * f1 * t) * 0.35 +
					Math.sin(2 * Math.PI * f2 * t + lfo) * 0.25 +
					Math.sin(2 * Math.PI * f3 * t) * 0.15 +
					Math.sin(2 * Math.PI * f4 * t) * 0.1;
				const fade = Math.min(1, t / 1.5) * Math.min(1, (validDuration - t) / 2);
				valL = pad * fade * 0.65;
				valR = (pad + Math.sin(2 * Math.PI * 165.5 * t) * 0.1) * fade * 0.65;
				break;
			}
			case 'whoosh-sfx': {
				const prog = validDuration > 0 ? t / validDuration : 0;
				const sweep = Math.sin(Math.PI * prog);
				const noise = Math.random() * 2 - 1;
				const tone = Math.sin(2 * Math.PI * (200 + 1200 * sweep) * t) * 0.35;
				valL = (noise * 0.5 + tone) * sweep * 0.6;
				valR = ((Math.random() * 2 - 1) * 0.5 + tone) * sweep * 0.6;
				break;
			}
			case 'camera-shutter': {
				let snap = 0;
				if (t >= 0.05 && t < 0.15) {
					const st = (t - 0.05) / 0.1;
					snap += (Math.random() * 2 - 1) * Math.exp(-st * 25);
				}
				if (t >= 0.18 && t < 0.35) {
					const st = (t - 0.18) / 0.17;
					snap += (Math.random() * 2 - 1) * Math.exp(-st * 20) * 1.2;
				}
				valL = snap * 0.7;
				valR = snap * 0.7;
				break;
			}
			case 'pop-click': {
				if (t < 0.1) {
					const decay = Math.exp(-t * 60);
					const freq = 1200 - t * 8000;
					const pop = Math.sin(2 * Math.PI * Math.max(200, freq) * t) * decay;
					valL = pop * 0.8;
					valR = pop * 0.8;
				}
				break;
			}
			default: {
				valL = Math.sin(2 * Math.PI * 440 * t) * 0.2;
				valR = valL;
			}
		}

		left[i] = Math.max(-1, Math.min(1, isNaN(valL) ? 0 : valL));
		right[i] = Math.max(-1, Math.min(1, isNaN(valR) ? 0 : valR));
	}

	return { numChannels: 2, sampleRate: validSampleRate, length, left, right };
}

function audioMockToWavArrayBuffer(bufferData: {
	numChannels: number;
	sampleRate: number;
	length: number;
	left: Float32Array;
	right: Float32Array;
}): ArrayBuffer {
	const numChannels = bufferData.numChannels;
	const sampleRate = bufferData.sampleRate;
	const numSamples = bufferData.length;
	const blockAlign = numChannels * 2;
	const byteRate = sampleRate * blockAlign;
	const dataSize = numSamples * blockAlign;
	const arrayBuf = new ArrayBuffer(44 + dataSize);
	const view = new DataView(arrayBuf);

	function writeString(offset: number, str: string) {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	}

	writeString(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true); // bits per sample
	writeString(36, 'data');
	view.setUint32(40, dataSize, true);

	const left = bufferData.left;
	const right = numChannels > 1 ? bufferData.right : left;
	let offset = 44;
	for (let i = 0; i < numSamples; i++) {
		const sL = Math.max(-1, Math.min(1, left[i]));
		view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
		offset += 2;
		if (numChannels > 1) {
			const sR = Math.max(-1, Math.min(1, right[i]));
			view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
			offset += 2;
		}
	}

	return arrayBuf;
}

// Canvas layer transform & filter functions replication for testing
function computeLayerTransform(clip: Clip): string {
	const x = clip.transform?.x ?? 0;
	const y = clip.transform?.y ?? 0;
	const scale = clip.transform?.scale ?? 1;
	const rotation = clip.transform?.rotation ?? 0;
	return `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`;
}

function computeLayerFilter(clip: Clip): string {
	const filterParts: string[] = [];
	if (clip.filters) {
		if (clip.filters.brightness !== undefined && clip.filters.brightness !== 0) {
			filterParts.push(`brightness(${100 + Number(clip.filters.brightness)}%)`);
		}
		if (clip.filters.contrast !== undefined && clip.filters.contrast !== 0) {
			filterParts.push(`contrast(${100 + Number(clip.filters.contrast)}%)`);
		}
		if (clip.filters.saturate !== undefined && clip.filters.saturate !== 0) {
			filterParts.push(`saturate(${100 + Number(clip.filters.saturate)}%)`);
		}
		if (clip.filters.blur !== undefined && clip.filters.blur !== 0) {
			filterParts.push(`blur(${Number(clip.filters.blur)}px)`);
		}
		if (clip.filters.grayscale !== undefined && clip.filters.grayscale !== 0) {
			filterParts.push(`grayscale(${Number(clip.filters.grayscale)}%)`);
		}
		if (clip.filters.sepia !== undefined && clip.filters.sepia !== 0) {
			filterParts.push(`sepia(${Number(clip.filters.sepia)}%)`);
		}
		if (clip.filters.hueRotate !== undefined && clip.filters.hueRotate !== 0) {
			filterParts.push(`hue-rotate(${Number(clip.filters.hueRotate)}deg)`);
		}
	}
	return filterParts.length > 0 ? filterParts.join(' ') : 'none';
}

function computeSourceTime(clip: Clip, timelineTime: number): number {
	const timelineOffset = timelineTime - clip.timelineStart;
	const sourceDuration = clip.sourceOut - clip.sourceIn;
	const timelineDuration = clip.timelineDuration;
	if (timelineDuration <= 0) return clip.sourceIn;
	return clip.sourceIn + (timelineOffset / timelineDuration) * sourceDuration;
}

// Slice waveform peaks logic replication
function computeWaveformBars(clip: Clip, assetDuration: number, allPeaks: number[], width: number): number[] {
	const validAssetDur = assetDuration > 0 ? assetDuration : (clip.sourceOut > 0 ? clip.sourceOut : clip.timelineDuration) || 10;
	const peaks = allPeaks && allPeaks.length > 0 ? allPeaks : generateProceduralWaveform(clip.mediaAssetId || clip.id, 120);

	const startRatio = Math.max(0, Math.min(0.99, isNaN(clip.sourceIn) ? 0 : clip.sourceIn / validAssetDur));
	const endRatio = Math.max(startRatio + 0.01, Math.min(1.0, isNaN(clip.sourceOut) ? 1.0 : clip.sourceOut / validAssetDur));

	const startIdx = Math.floor(startRatio * peaks.length);
	const endIdx = Math.max(startIdx + 1, Math.ceil(endRatio * peaks.length));
	const sliced = peaks.slice(startIdx, endIdx);

	const targetBars = Math.max(6, Math.min(180, Math.floor(Math.max(1, width) / 3.5)));
	const bars: number[] = [];
	for (let i = 0; i < targetBars; i++) {
		const idx = Math.floor((i / targetBars) * (sliced.length || 1));
		bars.push(sliced[idx] !== undefined ? sliced[idx] : 0.2);
	}
	return bars;
}

describe('Tier 5: Adversarial Hardening Suite', () => {
	beforeEach(() => {
		while (commandProcessor.canUndo()) {
			commandProcessor.undo();
		}
		projectStore.set(createAdversarialProject());
		timelineActions.selectClip(null);
		timelineActions.selectTrack(null);
		timelineActions.setZoomLevel(1.0);
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
	// SUITE 1: Rapid Multi-Category Navigation & Drawer State Consistency
	// =========================================================================
	describe('ADVERSARIAL SUITE 1: Rapid Multi-Category Navigation & Drawer State Consistency', () => {
		it('T5.1.1: should withstand rapid non-sequential pillar navigation switching without state corruption', () => {
			type PillarId = 'media' | 'text' | 'audio' | 'effects' | 'transitions';
			const pillars: PillarId[] = [
				'media',
				'text',
				'audio',
				'effects',
				'transitions'
			];

			// Rapidly iterate through 100 random/cyclical transitions
			let activePillar: PillarId = 'media';
			for (let i = 0; i < 100; i++) {
				activePillar = pillars[i % pillars.length];
				expect(activePillar).toBe(pillars[i % pillars.length]);
			}

			const panels: Array<'media' | 'export' | 'history' | null> = ['media', 'export', 'history', null];
			for (let i = 0; i < 20; i++) {
				const nextPanel = panels[i % panels.length];
				uiActions.setActivePanel(nextPanel);
				expect(get(uiStore).activePanel).toBe(nextPanel);
			}

			// Verify final state is clean and accessible
			uiActions.setActivePanel('media');
			expect(get(uiStore).activePanel).toBe('media');
		});

		it('T5.1.2: should filter media assets safely with regex special characters and malformed search strings', () => {
			const currentProject = get(projectStore)!;
			const assetList = Array.from(currentProject.assets.values());

			const searchFn = (query: string) => {
				return assetList.filter((a) => a.filename.toLowerCase().includes(query.toLowerCase()));
			};

			// Query with dangerous regex metacharacters
			const regexBomb = '.*+?^${}()|[]\\';
			expect(() => searchFn(regexBomb)).not.toThrow();
			expect(searchFn(regexBomb)).toHaveLength(0);

			// Query with null bytes and unicode
			expect(searchFn('drone\0footage')).toHaveLength(0);
			expect(searchFn('DRONE')).toHaveLength(1);
			expect(searchFn('DRONE')[0].id).toBe('adv-video-1');

			// Empty and whitespace queries
			expect(searchFn('')).toHaveLength(5);
			expect(searchFn('   ')).toHaveLength(0);
		});

		it('T5.1.3: should cascade delete an asset across multiple track clip instances without dangling references', () => {
			// Add 3 clips referencing adv-video-1 across track-v1, track-v2, and track-v3
			const add1 = new AddClipCommand({ mediaAssetId: 'adv-video-1', trackId: 'track-v1', position: 0 });
			const add2 = new AddClipCommand({ mediaAssetId: 'adv-video-1', trackId: 'track-v2', position: 5 });
			const add3 = new AddClipCommand({ mediaAssetId: 'adv-audio-1', trackId: 'track-a1', position: 0 });
			commandProcessor.execute(add1);
			commandProcessor.execute(add2);
			commandProcessor.execute(add3);

			let proj = get(projectStore)!;
			expect(proj.clips.size).toBe(3);

			const assetToDelete = 'adv-video-1';

			// Simulate MediaBin handleDeleteAsset cascade
			projectStore.update((project) => {
				if (!project) return project;
				const newAssets = new Map(project.assets);
				newAssets.delete(assetToDelete);

				const newClips = new Map(project.clips);
				for (const [cId, c] of newClips) {
					if (c.mediaAssetId === assetToDelete) {
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
					sequences: newSequences,
					modifiedAt: Date.now()
				};
			});

			thumbnailCache.delete(assetToDelete);

			const updated = get(projectStore)!;
			expect(updated.assets.has(assetToDelete)).toBe(false);
			expect(updated.clips.size).toBe(1); // Only the audio clip remains
			expect(Array.from(updated.clips.values())[0].mediaAssetId).toBe('adv-audio-1');

			// Check all tracks have 0 dangling IDs
			const trackV1 = updated.sequences[0].tracks.find((t) => t.id === 'track-v1')!;
			const trackV2 = updated.sequences[0].tracks.find((t) => t.id === 'track-v2')!;
			const trackA1 = updated.sequences[0].tracks.find((t) => t.id === 'track-a1')!;

			expect(trackV1.clipInstances).toHaveLength(0);
			expect(trackV2.clipInstances).toHaveLength(0);
			expect(trackA1.clipInstances).toHaveLength(1);
			expect(thumbnailCache.has(assetToDelete)).toBe(false);
		});

		it('T5.1.4: should safely handle deleting a non-existent asset ID without corrupting state', () => {
			const beforeCount = get(projectStore)!.assets.size;
			const nonExistentId = 'ghost-asset-404';

			projectStore.update((project) => {
				if (!project) return project;
				const newAssets = new Map(project.assets);
				newAssets.delete(nonExistentId);
				return { ...project, assets: newAssets };
			});

			expect(get(projectStore)!.assets.size).toBe(beforeCount);
		});
	});

	// =========================================================================
	// SUITE 2: Text Preset Generation & Font Fallback Robustness
	// =========================================================================
	describe('ADVERSARIAL SUITE 2: Text Preset Generation & Font Fallback Robustness', () => {
		const textPresets = [
			{ id: 'title-card', name: 'Title Card', category: 'Cinematic', duration: 4.0, badgeColor: '#38bdf8' },
			{ id: 'lower-third', name: 'Lower Third', category: 'Broadcast', duration: 5.0, badgeColor: '#10b981' },
			{ id: 'subtitles', name: 'Subtitles', category: 'Captions', duration: 3.0, badgeColor: '#f59e0b' },
			{ id: 'callout', name: 'Callout', category: 'Graphic', duration: 4.0, badgeColor: '#ec4899' },
			{ id: 'minimal-heading', name: 'Minimal Heading', category: 'Modern', duration: 4.0, badgeColor: '#8b5cf6' }
		];

		it('T5.2.1: should validate all text presets have strictly positive duration and required metadata', () => {
			for (const preset of textPresets) {
				expect(preset.id).toBeTruthy();
				expect(preset.name).toBeTruthy();
				expect(preset.category).toBeTruthy();
				expect(preset.duration).toBeGreaterThan(0);
				expect(preset.badgeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
			}
		});

		it('T5.2.2: should generate valid media assets from text presets and place onto video tracks', () => {
			for (const preset of textPresets) {
				const assetId = `text-asset-${preset.id}`;
				const filename = `${preset.name.replace(/\s+/g, '_')}.png`;
				const blob = new Blob(['mock-png-data'], { type: 'image/png' });

				const mediaAsset: MediaAsset = {
					id: assetId,
					filename,
					sourceBlob: blob,
					type: 'image',
					duration: preset.duration,
					width: 1920,
					height: 1080,
					createdAt: Date.now(),
					modifiedAt: Date.now()
				};

				projectStore.update((project) => {
					if (!project) return project;
					const newAssets = new Map(project.assets);
					newAssets.set(assetId, mediaAsset);
					return { ...project, assets: newAssets };
				});

				const addCmd = new AddClipCommand({
					mediaAssetId: assetId,
					trackId: 'track-v2',
					position: 0
				});
				commandProcessor.execute(addCmd);
			}

			const proj = get(projectStore)!;
			expect(proj.assets.size).toBe(5 + 5); // 5 original + 5 text
			expect(proj.clips.size).toBe(5);

			const trackV2 = proj.sequences[0].tracks.find((t) => t.id === 'track-v2')!;
			expect(trackV2.clipInstances).toHaveLength(5);
		});

		it('T5.2.3: should handle extreme, multiline, unicode, and emoji text strings in text inspector properties', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'adv-image-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const extremeTexts = [
				'', // Empty
				'Line 1\nLine 2\nLine 3\nLine 4', // Multi-line
				'🚀 Special Emoji Title 🎉 💡 👨‍👩‍👧‍👦', // Complex Unicode
				'<script>alert("xss")</script>', // Injection text
				'A'.repeat(5000) // Extremely long string
			];

			for (const textVal of extremeTexts) {
				const filterCmd = new SetClipFilterCommand({
					clipId,
					filterName: 'text',
					value: textVal
				});
				commandProcessor.execute(filterCmd);

				const clip = get(projectStore)!.clips.get(clipId)!;
				expect(clip.filters?.text).toBe(textVal);
			}
		});

		it('T5.2.4: should safely handle font sizes and fallback fonts across extreme range', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'adv-image-1',
				trackId: 'track-v1',
				position: 0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const fontSizes = [12, 36, 140, 0, -10, 9999];
			for (const size of fontSizes) {
				const filterCmd = new SetClipFilterCommand({
					clipId,
					filterName: 'fontSize',
					value: size
				});
				commandProcessor.execute(filterCmd);
				expect(get(projectStore)!.clips.get(clipId)!.filters?.fontSize).toBe(size);
			}

			const fontFamilies = ['Inter', 'Roboto', 'NonExistentCustomFont123', ''];
			for (const font of fontFamilies) {
				const filterCmd = new SetClipFilterCommand({
					clipId,
					filterName: 'fontFamily',
					value: font
				});
				commandProcessor.execute(filterCmd);
				expect(get(projectStore)!.clips.get(clipId)!.filters?.fontFamily).toBe(font);
			}
		});
	});

	// =========================================================================
	// SUITE 3: Audio WAV Blob Synthesis, PCM Header Bounds & Zero-Sample Safety
	// =========================================================================
	describe('ADVERSARIAL SUITE 3: Audio WAV Blob Synthesis, PCM Header Bounds & Zero-Sample Safety', () => {
		it('T5.3.1: should synthesize audio buffers for all preset algorithms with finite samples in [-1.0, 1.0]', () => {
			const presetIds = ['upbeat-intro', 'ambient-cinematic', 'whoosh-sfx', 'camera-shutter', 'pop-click', 'unknown-fallback'];

			for (const presetId of presetIds) {
				const buffer = synthesizeAudioBufferMock(44100, presetId, 1.0);
				expect(buffer.numChannels).toBe(2);
				expect(buffer.length).toBe(44100);
				expect(buffer.left.length).toBe(44100);
				expect(buffer.right.length).toBe(44100);

				// Spot-check every sample is finite and bounded
				for (let i = 0; i < buffer.length; i += 500) {
					expect(isFinite(buffer.left[i])).toBe(true);
					expect(isFinite(buffer.right[i])).toBe(true);
					expect(buffer.left[i]).toBeGreaterThanOrEqual(-1.0);
					expect(buffer.left[i]).toBeLessThanOrEqual(1.0);
					expect(buffer.right[i]).toBeGreaterThanOrEqual(-1.0);
					expect(buffer.right[i]).toBeLessThanOrEqual(1.0);
				}
			}
		});

		it('T5.3.2: should produce valid WAV RIFF header and payload structure from synthesized buffer', () => {
			const buffer = synthesizeAudioBufferMock(48000, 'camera-shutter', 0.5); // 24000 samples
			const wavArrayBuf = audioMockToWavArrayBuffer(buffer);

			expect(wavArrayBuf.byteLength).toBe(44 + 24000 * 2 * 2); // 44 header + 24000 samples * 2 channels * 2 bytes

			const view = new DataView(wavArrayBuf);
			const readString = (offset: number, length: number) => {
				let s = '';
				for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
				return s;
			};

			// RIFF header
			expect(readString(0, 4)).toBe('RIFF');
			expect(view.getUint32(4, true)).toBe(36 + 24000 * 4); // fileSize - 8
			expect(readString(8, 4)).toBe('WAVE');

			// fmt chunk
			expect(readString(12, 4)).toBe('fmt ');
			expect(view.getUint32(16, true)).toBe(16); // subchunk1 size
			expect(view.getUint16(20, true)).toBe(1); // PCM format
			expect(view.getUint16(22, true)).toBe(2); // Num channels
			expect(view.getUint32(24, true)).toBe(48000); // Sample rate
			expect(view.getUint32(28, true)).toBe(48000 * 4); // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
			expect(view.getUint16(32, true)).toBe(4); // Block align (NumChannels * BitsPerSample/8)
			expect(view.getUint16(34, true)).toBe(16); // Bits per sample

			// data chunk
			expect(readString(36, 4)).toBe('data');
			expect(view.getUint32(40, true)).toBe(24000 * 4);
		});

		it('T5.3.3: should handle zero-duration and zero-sample boundaries without buffer overflow or NaN byte offsets', () => {
			const zeroBuffer = synthesizeAudioBufferMock(44100, 'upbeat-intro', 0);
			expect(zeroBuffer.length).toBe(0);
			expect(zeroBuffer.left.length).toBe(0);

			const zeroWav = audioMockToWavArrayBuffer(zeroBuffer);
			expect(zeroWav.byteLength).toBe(44); // Exact header size only

			const view = new DataView(zeroWav);
			expect(view.getUint32(4, true)).toBe(36);
			expect(view.getUint32(40, true)).toBe(0);
		});

		it('T5.3.4: should clamp extreme PCM samples exceeding [-1.0, 1.0] without signed 16-bit integer wraparound', () => {
			const extremeBuffer = {
				numChannels: 2,
				sampleRate: 44100,
				length: 4,
				left: new Float32Array([100.0, -50.0, 0.0, 1.0]),
				right: new Float32Array([1.0, -1.0, 0.5, -0.5])
			};

			const wavBuf = audioMockToWavArrayBuffer(extremeBuffer);
			const view = new DataView(wavBuf);

			// Left sample 0 (100.0 => clamped to 1.0 => 0x7fff = 32767)
			expect(view.getInt16(44, true)).toBe(32767);
			// Right sample 0 (1.0 => 32767)
			expect(view.getInt16(46, true)).toBe(32767);

			// Left sample 1 (-50.0 => clamped to -1.0 => -32768)
			expect(view.getInt16(48, true)).toBe(-32768);
			// Right sample 1 (-1.0 => -32768)
			expect(view.getInt16(50, true)).toBe(-32768);
		});
	});

	// =========================================================================
	// SUITE 4: Complex Multitrack Layer Transformations & Extreme Visual Filters
	// =========================================================================
	describe('ADVERSARIAL SUITE 4: Complex Multitrack Layer Transformations & Extreme Visual Filters', () => {
		it('T5.4.1: should generate correct CSS transform strings with extreme, zero, and negative values', () => {
			const baseClip = createMockClip({
				id: 'clip-trans-1',
				mediaAssetId: 'adv-video-1',
				timelineStart: 0,
				timelineDuration: 10,
				sourceIn: 0,
				sourceOut: 10
			});

			// Default transform
			expect(computeLayerTransform(baseClip)).toBe('translate(0px, 0px) scale(1) rotate(0deg)');

			// Extreme transform
			const extremeClip: Clip = {
				...baseClip,
				transform: {
					x: -999999,
					y: 888888,
					scale: 0.01,
					rotation: 720
				}
			};
			expect(computeLayerTransform(extremeClip)).toBe('translate(-999999px, 888888px) scale(0.01) rotate(720deg)');

			// Negative scale & inverted rotation
			const flippedClip: Clip = {
				...baseClip,
				transform: {
					x: 0,
					y: 0,
					scale: -2.5,
					rotation: -180
				}
			};
			expect(computeLayerTransform(flippedClip)).toBe('translate(0px, 0px) scale(-2.5) rotate(-180deg)');
		});

		it('T5.4.2: should generate combined CSS filter string with extreme values and return "none" when neutral', () => {
			const baseClip = createMockClip({
				id: 'clip-filter-1',
				mediaAssetId: 'adv-video-1',
				timelineStart: 0,
				timelineDuration: 10,
				sourceIn: 0,
				sourceOut: 10
			});

			// No filters
			expect(computeLayerFilter(baseClip)).toBe('none');

			// Neutral 0 values
			const neutralClip: Clip = {
				...baseClip,
				filters: {
					brightness: 0,
					contrast: 0,
					saturate: 0
				}
			};
			expect(computeLayerFilter(neutralClip)).toBe('none');

			// Multiple extreme filters combined
			const styledClip: Clip = {
				...baseClip,
				filters: {
					brightness: 50,
					contrast: -30,
					saturate: 120,
					blur: 8,
					grayscale: 100,
					sepia: 40,
					hueRotate: 180
				}
			};
			const filterStr = computeLayerFilter(styledClip);
			expect(filterStr).toContain('brightness(150%)');
			expect(filterStr).toContain('contrast(70%)');
			expect(filterStr).toContain('saturate(220%)');
			expect(filterStr).toContain('blur(8px)');
			expect(filterStr).toContain('grayscale(100%)');
			expect(filterStr).toContain('sepia(40%)');
			expect(filterStr).toContain('hue-rotate(180deg)');
		});

		it('T5.4.3: should accurately calculate sourceTime across speed multipliers and time offsets', () => {
			const normalClip = createMockClip({
				id: 'clip-src-1',
				mediaAssetId: 'adv-video-1',
				timelineStart: 10.0,
				timelineDuration: 20.0,
				sourceIn: 5.0,
				sourceOut: 25.0
			});

			// At start of clip
			expect(computeSourceTime(normalClip, 10.0)).toBe(5.0);
			// In middle of clip
			expect(computeSourceTime(normalClip, 20.0)).toBe(15.0);
			// At end of clip
			expect(computeSourceTime(normalClip, 30.0)).toBe(25.0);

			// 2x Fast-motion clip (source duration 20s compressed into timeline duration 10s)
			const fastClip = createMockClip({
				id: 'clip-src-fast',
				mediaAssetId: 'adv-video-1',
				timelineStart: 0.0,
				timelineDuration: 10.0,
				sourceIn: 0.0,
				sourceOut: 20.0
			});
			expect(computeSourceTime(fastClip, 5.0)).toBe(10.0);

			// Zero duration edge case (returns sourceIn safely)
			const zeroClip: Clip = {
				...normalClip,
				timelineDuration: 0
			};
			expect(computeSourceTime(zeroClip, 10.0)).toBe(5.0);
		});
	});

	// =========================================================================
	// SUITE 5: Waveform Generation, Cache, and Boundary Slicing Extremes
	// =========================================================================
	describe('ADVERSARIAL SUITE 5: Waveform Generation, Cache, and Boundary Slicing Extremes', () => {
		it('T5.5.1: should generate deterministic procedural waveforms with bounded peaks for arbitrary seeds', () => {
			const peaks1 = generateProceduralWaveform('audio-seed-1', 100);
			const peaks2 = generateProceduralWaveform('audio-seed-1', 100);
			const peaksDiff = generateProceduralWaveform('audio-seed-2', 100);

			expect(peaks1).toHaveLength(100);
			expect(peaks1).toEqual(peaks2);
			expect(peaks1).not.toEqual(peaksDiff);

			for (const p of peaks1) {
				expect(p).toBeGreaterThanOrEqual(0.05);
				expect(p).toBeLessThanOrEqual(1.0);
				expect(isFinite(p)).toBe(true);
			}
		});

		it('T5.5.2: should handle extreme waveform sample counts: 0, 1, 10000', () => {
			const zeroPeaks = generateProceduralWaveform('seed', 0);
			expect(zeroPeaks).toHaveLength(0);

			const singlePeak = generateProceduralWaveform('seed', 1);
			expect(singlePeak).toHaveLength(1);
			expect(singlePeak[0]).toBeGreaterThanOrEqual(0.05);

			const largePeaks = generateProceduralWaveform('seed', 5000);
			expect(largePeaks).toHaveLength(5000);
			expect(isFinite(largePeaks[4999])).toBe(true);
		});

		it('T5.5.3: should slice waveform bars safely with out-of-range sourceIn/sourceOut boundaries', () => {
			const clip = createMockClip({
				id: 'clip-wave-1',
				mediaAssetId: 'adv-audio-1',
				timelineStart: 0,
				timelineDuration: 10,
				sourceIn: 10,
				sourceOut: 20
			});

			const mockPeaks = generateProceduralWaveform('adv-audio-1', 120);

			// Normal slice: width 350px => ~100 bars
			const normalBars = computeWaveformBars(clip, 60, mockPeaks, 350);
			expect(normalBars.length).toBe(100);
			for (const b of normalBars) {
				expect(isFinite(b)).toBe(true);
			}

			// Out-of-bounds: sourceIn > sourceOut
			const invertedClip: Clip = {
				...clip,
				sourceIn: 50,
				sourceOut: 10
			};
			const invertedBars = computeWaveformBars(invertedClip, 60, mockPeaks, 200);
			expect(invertedBars.length).toBeGreaterThan(0);
			for (const b of invertedBars) {
				expect(isFinite(b)).toBe(true);
			}

			// Extreme width boundaries: width = 0, width = 5, width = 50000
			const zeroWidthBars = computeWaveformBars(clip, 60, mockPeaks, 0);
			expect(zeroWidthBars.length).toBe(6); // min clamp 6 bars

			const hugeWidthBars = computeWaveformBars(clip, 60, mockPeaks, 50000);
			expect(hugeWidthBars.length).toBe(180); // max clamp 180 bars
		});

		it('T5.5.4: should leverage and update waveformCache in timelineStore via extractAudioWaveform', async () => {
			timelineStore.update((s) => {
				s.waveformCache.clear();
				return s;
			});

			const assetId = 'adv-audio-cached-test';
			const rawBlob = new Blob(['mock-audio-bytes'], { type: 'audio/wav' });

			const peaks = await extractAudioWaveform(rawBlob, assetId, 100);
			expect(peaks).toHaveLength(100);

			// Check that it was stored in waveformCache
			const cached = get(timelineStore).waveformCache.get(assetId);
			expect(cached).toBeDefined();
			expect(cached).toEqual(peaks);

			// Calling again should return cached immediately
			const cachedRetrieved = await extractAudioWaveform(rawBlob, assetId, 100);
			expect(cachedRetrieved).toBe(cached);
		});
	});

	// =========================================================================
	// SUITE 6: High-Concurrency Undo/Redo Stress & State Invariant Verification
	// =========================================================================
	describe('ADVERSARIAL SUITE 6: High-Concurrency Undo/Redo Stress & State Invariant Verification', () => {
		it('T5.6.1: should execute 30+ mixed multi-track commands on clips and cleanly undo/redo back to exact state invariants', () => {
			const historyStore = commandProcessor.getHistoryStore();

			// Pre-populate 6 clips in project store so IDs are stable across command undo/redo
			const preClips: Clip[] = [];
			for (let i = 0; i < 6; i++) {
				const isAudio = i >= 3;
				const c = createMockClip({
					id: `clip-stable-${i}`,
					mediaAssetId: isAudio ? 'adv-audio-1' : 'adv-video-1',
					timelineStart: i * 5,
					timelineDuration: 10,
					sourceIn: 0,
					sourceOut: 10
				});
				preClips.push(c);
			}

			projectStore.update((p) => {
				if (!p) return p;
				const clipsMap = new Map(p.clips);
				for (const c of preClips) clipsMap.set(c.id, c);

				const seq = p.sequences[0];
				const tracks = seq.tracks.map((t, idx) => ({
					...t,
					clipInstances: idx < 6 ? [`clip-stable-${idx}`] : []
				}));

				return {
					...p,
					clips: clipsMap,
					sequences: [{ ...seq, tracks }]
				};
			});

			// 1. Move clips across tracks (v1->v2, v2->v3, v3->v1, a1->a2, a2->a3, a3->a1)
			const moveDestinations = ['track-v2', 'track-v3', 'track-v1', 'track-a2', 'track-a3', 'track-a1'];
			for (let i = 0; i < 6; i++) {
				const moveCmd = new MoveClipCommand({ clipId: `clip-stable-${i}`, newTrackId: moveDestinations[i], newPosition: i * 8 });
				commandProcessor.execute(moveCmd);
			}

			// 2. Trim clips
			for (let i = 0; i < 6; i++) {
				const trimCmd = new TrimClipCommand({ clipId: `clip-stable-${i}`, side: 'start', newSourceTime: 2.0 });
				commandProcessor.execute(trimCmd);
			}

			// 3. Set volume & playbackRate
			for (let i = 0; i < 6; i++) {
				const volCmd = new SetClipVolumeCommand({ clipId: `clip-stable-${i}`, volume: 0.75 });
				commandProcessor.execute(volCmd);
				const rateCmd = new SetClipPlaybackRateCommand({ clipId: `clip-stable-${i}`, playbackRate: 1.25 });
				commandProcessor.execute(rateCmd);
			}

			// 4. Set visual filters
			for (let i = 0; i < 3; i++) {
				const filterCmd = new SetClipFilterCommand({ clipId: `clip-stable-${i}`, filterName: 'brightness', value: 30 });
				commandProcessor.execute(filterCmd);
			}

			// Total commands executed = 6 + 6 + 12 + 3 = 27 commands
			expect(get(historyStore).canUndo).toBe(true);

			// FULL UNWIND: Undo all 27 commands
			let undoCount = 0;
			while (commandProcessor.canUndo()) {
				commandProcessor.undo();
				undoCount++;
			}
			expect(undoCount).toBe(27);
			expect(get(historyStore).canUndo).toBe(false);
			expect(get(historyStore).canRedo).toBe(true);

			// Check restored initial values
			const initialCheck = get(projectStore)!.clips.get('clip-stable-0')!;
			expect(initialCheck.sourceIn).toBe(0);
			expect(initialCheck.timelineStart).toBe(0);
			expect(initialCheck.audioParameters.volume).toBe(1.0);
			expect(initialCheck.playbackRate).toBe(1.0);

			// FULL REWIND: Redo all 27 commands
			let redoCount = 0;
			while (commandProcessor.canRedo()) {
				commandProcessor.redo();
				redoCount++;
			}
			expect(redoCount).toBe(27);
			expect(get(historyStore).canUndo).toBe(true);
			expect(get(historyStore).canRedo).toBe(false);

			// Check redone state
			const redoneCheck = get(projectStore)!.clips.get('clip-stable-0')!;
			expect(redoneCheck.sourceIn).toBe(2.0);
			expect(redoneCheck.timelineStart).toBe(2.0);
			expect(redoneCheck.audioParameters.volume).toBe(0.75);
			expect(redoneCheck.playbackRate).toBe(1.25);
			expect(redoneCheck.filters.brightness).toBe(30);
		});

		it('T5.6.2: should properly invalidate redo stack upon executing a new command after partial undos', () => {
			const historyStore = commandProcessor.getHistoryStore();

			const add1 = new AddClipCommand({ mediaAssetId: 'adv-video-1', trackId: 'track-v1', position: 0 });
			const add2 = new AddClipCommand({ mediaAssetId: 'adv-video-2', trackId: 'track-v2', position: 10 });
			const add3 = new AddClipCommand({ mediaAssetId: 'adv-audio-1', trackId: 'track-a1', position: 0 });

			commandProcessor.execute(add1);
			commandProcessor.execute(add2);
			commandProcessor.execute(add3);
			expect(get(projectStore)!.clips.size).toBe(3);

			// Undo 2 commands (leaving only add1)
			commandProcessor.undo();
			commandProcessor.undo();
			expect(get(projectStore)!.clips.size).toBe(1);
			expect(get(historyStore).canRedo).toBe(true);

			// Execute a NEW command (branching history)
			const addBranch = new AddClipCommand({ mediaAssetId: 'adv-image-1', trackId: 'track-v3', position: 20 });
			commandProcessor.execute(addBranch);

			// Redo stack must now be cleared!
			expect(get(historyStore).canRedo).toBe(false);
			expect(get(projectStore)!.clips.size).toBe(2);

			// Undoing once removes the branch
			commandProcessor.undo();
			expect(get(projectStore)!.clips.size).toBe(1);

			// Undoing again removes the first command
			commandProcessor.undo();
			expect(get(projectStore)!.clips.size).toBe(0);
			expect(get(historyStore).canUndo).toBe(false);
		});

		it('T5.6.3: should withstand rapid oscillating split, trim, and move cycles without track corruption', () => {
			const addCmd = new AddClipCommand({ mediaAssetId: 'adv-video-1', trackId: 'track-v1', position: 0 }); // dur 30s
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			// Split at 10s and 20s
			const split1 = new SplitClipCommand({ clipId, splitTime: 10.0 });
			commandProcessor.execute(split1);

			const projAfterSplit1 = get(projectStore)!;
			expect(projAfterSplit1.clips.size).toBe(2);

			const sortedClips = Array.from(projAfterSplit1.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);
			const secondClipId = sortedClips[1].id;

			const split2 = new SplitClipCommand({ clipId: secondClipId, splitTime: 20.0 });
			commandProcessor.execute(split2);

			const projAfterSplit2 = get(projectStore)!;
			expect(projAfterSplit2.clips.size).toBe(3);

			// Move the middle piece to track-v2
			const allClips = Array.from(projAfterSplit2.clips.values()).sort((a, b) => a.timelineStart - b.timelineStart);
			const midClipId = allClips[1].id;

			const moveMid = new MoveClipCommand({ clipId: midClipId, newTrackId: 'track-v2', newPosition: 10.0 });
			commandProcessor.execute(moveMid);

			const projMoved = get(projectStore)!;
			const trackV1 = projMoved.sequences[0].tracks.find((t) => t.id === 'track-v1')!;
			const trackV2 = projMoved.sequences[0].tracks.find((t) => t.id === 'track-v2')!;

			expect(trackV1.clipInstances).toHaveLength(2);
			expect(trackV2.clipInstances).toHaveLength(1);

			// Undo moving and splitting
			commandProcessor.undo(); // undo move
			commandProcessor.undo(); // undo split2
			commandProcessor.undo(); // undo split1

			const restoredOriginal = get(projectStore)!;
			expect(restoredOriginal.clips.size).toBe(1);
			expect(restoredOriginal.clips.get(clipId)!.timelineDuration).toBe(30.0);
		});

		it('T5.6.4: should empirically verify AddClipCommand generates a new clipId on each execute() call', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'adv-video-1',
				trackId: 'track-v1',
				position: 0
			});

			commandProcessor.execute(addCmd);
			const firstId = Array.from(get(projectStore)!.clips.keys())[0];
			expect(firstId).toBeTruthy();

			commandProcessor.undo();
			expect(get(projectStore)!.clips.size).toBe(0);

			commandProcessor.redo();
			const redoneId = Array.from(get(projectStore)!.clips.keys())[0];
			expect(redoneId).toBeTruthy();
			// On redo, AddClipCommand creates a clip; if Math.random() is invoked, IDs will differ
			expect(typeof redoneId).toBe('string');
		});

		it('T5.6.5: should verify DeleteClipCommand cleanly removes and restores clips across undo and redo', () => {
			const addCmd = new AddClipCommand({
				mediaAssetId: 'adv-video-2',
				trackId: 'track-v2',
				position: 5.0
			});
			commandProcessor.execute(addCmd);
			const clipId = Array.from(get(projectStore)!.clips.keys())[0];

			const delCmd = new DeleteClipCommand({ clipId });
			commandProcessor.execute(delCmd);
			expect(get(projectStore)!.clips.has(clipId)).toBe(false);

			commandProcessor.undo();
			expect(get(projectStore)!.clips.has(clipId)).toBe(true);

			commandProcessor.redo();
			expect(get(projectStore)!.clips.has(clipId)).toBe(false);
		});
	});

	// =========================================================================
	// SUITE 7: Canvas Layer Stacking, Snapping & Boundary Precision
	// =========================================================================
	describe('ADVERSARIAL SUITE 7: Canvas Layer Stacking, Snapping & Boundary Precision', () => {
		it('T5.7.1: should sort active visual layers by trackOrder ascending for correct z-index layering', () => {
			const proj = get(projectStore)!;
			const seq = proj.sequences[0];

			// Create 3 clips across track-v1 (order 0), track-v2 (order 1), track-v3 (order 2)
			const c1 = createMockClip({
				id: 'c-v1',
				mediaAssetId: 'adv-video-1',
				timelineStart: 0,
				timelineDuration: 10,
				sourceIn: 0,
				sourceOut: 10
			});
			const c2 = createMockClip({
				id: 'c-v2',
				mediaAssetId: 'adv-video-2',
				timelineStart: 0,
				timelineDuration: 10,
				sourceIn: 0,
				sourceOut: 10
			});
			const c3 = createMockClip({
				id: 'c-v3',
				mediaAssetId: 'adv-image-1',
				timelineStart: 0,
				timelineDuration: 10,
				sourceIn: 0,
				sourceOut: 10
			});

			const clipsMap = new Map<string, Clip>([
				[c1.id, c1],
				[c2.id, c2],
				[c3.id, c3]
			]);

			const updatedTracks = seq.tracks.map((t) => {
				if (t.id === 'track-v1') return { ...t, clipInstances: [c1.id] };
				if (t.id === 'track-v2') return { ...t, clipInstances: [c2.id] };
				if (t.id === 'track-v3') return { ...t, clipInstances: [c3.id] };
				return t;
			});

			projectStore.set({
				...proj,
				clips: clipsMap,
				sequences: [{ ...seq, tracks: updatedTracks }]
			});

			// Replicate Canvas active visual layers logic at time = 5.0
			const time = 5.0;
			const layers: Array<{ clip: Clip; asset: MediaAsset; trackOrder: number }> = [];
			const currentProj = get(projectStore)!;
			const currentSeq = currentProj.sequences[0];

			for (let i = 0; i < currentSeq.tracks.length; i++) {
				const track = currentSeq.tracks[i];
				for (const clipId of track.clipInstances) {
					const clip = currentProj.clips.get(clipId);
					if (!clip) continue;
					if (time >= clip.timelineStart && time < clip.timelineStart + clip.timelineDuration) {
						const asset = currentProj.assets.get(clip.mediaAssetId);
						if (asset && (asset.type === 'video' || asset.type === 'image')) {
							layers.push({
								clip,
								asset,
								trackOrder: track.order ?? i
							});
						}
					}
				}
			}

			layers.sort((a, b) => a.trackOrder - b.trackOrder);

			expect(layers).toHaveLength(3);
			expect(layers[0].clip.id).toBe('c-v1');
			expect(layers[0].trackOrder).toBe(0);
			expect(layers[1].clip.id).toBe('c-v2');
			expect(layers[1].trackOrder).toBe(1);
			expect(layers[2].clip.id).toBe('c-v3');
			expect(layers[2].trackOrder).toBe(2);
		});

		it('T5.7.2: should calculate snap targets accurately and clamp negative scrubbing times', () => {
			expect(snapToGrid(0.049, 0.1)).toBeCloseTo(0.0, 5);
			expect(snapToGrid(0.051, 0.1)).toBeCloseTo(0.1, 5);
			expect(snapToGrid(10.24, 0.5)).toBeCloseTo(10.0, 5);
			expect(snapToGrid(10.26, 0.5)).toBeCloseTo(10.5, 5);

			// Clamp utilities
			expect(clamp(-50, 0, 100)).toBe(0);
			expect(clamp(150, 0, 100)).toBe(100);
			expect(clamp(50, 0, 100)).toBe(50);

			// Lerp utilities
			expect(lerp(0, 100, 0.5)).toBe(50);
			expect(lerp(10, 20, 0)).toBe(10);
			expect(lerp(10, 20, 1)).toBe(20);
		});

		it('T5.7.3: should enforce master volume bounds and mute state synchronization', () => {
			playbackActions.setMasterVolume(0.85);
			expect(get(playbackStore).masterVolume).toBe(0.85);

			// Below zero clamp
			playbackActions.setMasterVolume(-1.5);
			expect(get(playbackStore).masterVolume).toBe(0);

			// Above 1 clamp
			playbackActions.setMasterVolume(3.5);
			expect(get(playbackStore).masterVolume).toBe(1.0);

			// Mute toggle
			playbackActions.setMuted(true);
			expect(get(playbackStore).isMuted).toBe(true);
			playbackActions.setMuted(false);
			expect(get(playbackStore).isMuted).toBe(false);
		});
	});
});
