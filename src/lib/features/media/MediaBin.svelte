<script lang="ts">
	import Icon from '$lib/features/shell/Icon.svelte';
	import { VIDEO_EFFECTS, AUDIO_EFFECTS, effectById } from '$lib/core/effects/effectRegistry';
	import { onDestroy } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { timelineStore } from '$lib/stores/timeline.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { uiStore, uiActions } from '$lib/stores/ui.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { AddClipCommand } from '$lib/core/commands/addClip';
	import { SetClipFilterCommand } from '$lib/core/commands/setClipFilter';
	import { AddClipEffectCommand } from '$lib/core/commands/addClipEffect';
	import { SetClipTransitionCommand } from '$lib/core/commands/setClipTransition';
	import { importMediaFiles, thumbnailCache, placeholderThumbnail, addAsset } from '$lib/utils/mediaUtils';
	import { get } from 'svelte/store';
	import type { MediaAsset, Project, Clip } from '$lib/types/project';

	// Category pillars
	type PillarId = 'media' | 'text' | 'audio' | 'effects' | 'transitions';

	let { activePillar = 'media' } = $props<{ activePillar?: PillarId }>();
	let fileInput = $state<HTMLInputElement | null>(null);
	let isDragOver = $state(false);
	let searchQuery = $state('');
	let mediaFilter = $state<'all' | 'video' | 'audio' | 'image'>('all');
	let viewMode = $state<'grid' | 'list'>('grid');
	let selectedAssetId = $state<string | null>(null);
	let toastMessage = $state<string | null>(null);
	let toastTimeout: ReturnType<typeof setTimeout> | null = null;

	// Audio preview state
	let audioCtx: AudioContext | null = null;
	let activeAudioSource: AudioBufferSourceNode | null = null;
	let playingAudioPresetId = $state<string | null>(null);

	function showToast(msg: string) {
		if (toastTimeout) clearTimeout(toastTimeout);
		toastMessage = msg;
		toastTimeout = setTimeout(() => {
			toastMessage = null;
		}, 2600);
	}

	function getAudioContext(): AudioContext {
		if (!audioCtx || audioCtx.state === 'closed') {
			const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			audioCtx = new AudioContextClass();
		}
		if (audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
		return audioCtx;
	}

	onDestroy(() => {
		if (activeAudioSource) {
			try {
				activeAudioSource.stop();
			} catch {
				// ignore
			}
		}
		if (audioCtx && audioCtx.state !== 'closed') {
			audioCtx.close().catch(() => {});
		}
		if (toastTimeout) clearTimeout(toastTimeout);
	});

	// Presets data definitions
	interface TextPreset {
		id: string;
		name: string;
		category: string;
		description: string;
		duration: number;
		previewText: string;
		previewSub: string;
		badgeColor: string;
	}

	const textPresets: TextPreset[] = [
		{
			id: 'title-card',
			name: 'Title Card',
			category: 'Cinematic',
			description: 'Bold centered cinematic title with dramatic presence',
			duration: 4.0,
			previewText: 'CINEMATIC TITLE',
			previewSub: 'CREATIVE VISION',
			badgeColor: 'var(--ms-text)'
		},
		{
			id: 'lower-third',
			name: 'Lower Third',
			category: 'Broadcast',
			description: 'Modern lower-third broadcast banner for names & titles',
			duration: 5.0,
			previewText: 'Alex Morgan',
			previewSub: 'Director of Photography',
			badgeColor: 'var(--ms-text-secondary)'
		},
		{
			id: 'subtitles',
			name: 'Subtitles',
			category: 'Captions',
			description: 'Clean dialogue subtitle caption bar with high legibility',
			duration: 3.0,
			previewText: 'Captioned dialogue spoken here',
			previewSub: 'Clear readability bar',
			badgeColor: 'var(--ms-text-secondary)'
		},
		{
			id: 'callout',
			name: 'Callout',
			category: 'Graphic',
			description: 'Vibrant highlight box with accent badge for key details',
			duration: 4.0,
			previewText: '★ KEY HIGHLIGHT',
			previewSub: 'Dynamic 4K Resolution',
			badgeColor: 'var(--ms-text-secondary)'
		},
		{
			id: 'minimal-heading',
			name: 'Minimal Heading',
			category: 'Modern',
			description: 'Understated elegant typography for chapter titles',
			duration: 4.0,
			previewText: 'CHAPTER ONE',
			previewSub: 'Clean Minimalist Style',
			badgeColor: 'var(--ms-text)'
		}
	];

	interface AudioPreset {
		id: string;
		name: string;
		type: 'Music' | 'SFX' | 'Ambient';
		duration: number;
		bpm?: number;
		description: string;
	}

	const audioPresets: AudioPreset[] = [
		{
			id: 'upbeat-intro',
			name: 'Upbeat Intro',
			type: 'Music',
			duration: 8.0,
			bpm: 128,
			description: 'Energetic electronic intro melody with punchy beats'
		},
		{
			id: 'ambient-cinematic',
			name: 'Ambient Cinematic',
			type: 'Ambient',
			duration: 12.0,
			description: 'Atmospheric deep drone with warm harmonic swells'
		},
		{
			id: 'whoosh-sfx',
			name: 'Whoosh SFX',
			type: 'SFX',
			duration: 1.5,
			description: 'Fast dynamic transition swish sound effect'
		},
		{
			id: 'camera-shutter',
			name: 'Camera Shutter',
			type: 'SFX',
			duration: 0.8,
			description: 'Crisp dual-click mechanical camera shutter snap'
		},
		{
			id: 'pop-click',
			name: 'Pop Click',
			type: 'SFX',
			duration: 0.5,
			description: 'Subtle clean UI notification pop sound'
		}
	];

	interface EffectPreset {
		id: string;
		name: string;
		tag: string;
		description: string;
		filterKey: string;
		filterValue: unknown;
		cssFilter: string;
		gradient: string;
	}

	const effectPresets: EffectPreset[] = [
		{
			id: 'cinematic-lut',
			name: 'Cinematic LUT',
			tag: 'Color Grade',
			description: 'Rich contrast with teal-orange split tones and film curve',
			filterKey: 'brightness',
			filterValue: 10,
			cssFilter: 'contrast(1.25) saturate(1.2) brightness(1.05) hue-rotate(-5deg)',
			gradient: 'linear-gradient(135deg, var(--ms-text-secondary), var(--ms-text-secondary))'
		},
		{
			id: 'vibrant-pop',
			name: 'Vibrant Pop',
			tag: 'Punchy',
			description: 'High saturation and vivid dynamic range for social clips',
			filterKey: 'brightness',
			filterValue: 20,
			cssFilter: 'saturate(1.7) contrast(1.25) brightness(1.1)',
			gradient: 'linear-gradient(135deg, var(--ms-text-secondary), var(--ms-text))'
		},
		{
			id: 'vintage-film',
			name: 'Vintage Film',
			tag: 'Retro',
			description: 'Warm sepia nostalgia with faded blacks and analog warmth',
			filterKey: 'brightness',
			filterValue: -5,
			cssFilter: 'sepia(0.55) contrast(0.95) brightness(1.1)',
			gradient: 'linear-gradient(135deg, var(--ms-text-secondary), var(--ms-raised))'
		},
		{
			id: 'bw-noir',
			name: 'B&W Noir',
			tag: 'Monochrome',
			description: 'Dramatic black & white with deep high-contrast shadows',
			filterKey: 'brightness',
			filterValue: -10,
			cssFilter: 'grayscale(1) contrast(1.4) brightness(0.95)',
			gradient: 'linear-gradient(135deg, var(--ms-text), var(--ms-raised))'
		},
		{
			id: 'soft-vignette',
			name: 'Soft Vignette',
			tag: 'Mood',
			description: 'Atmospheric darkened frame perimeter focusing viewer eyes',
			filterKey: 'brightness',
			filterValue: 5,
			cssFilter: 'contrast(1.15) brightness(1.02) drop-shadow(0 0 15px rgba(0,0,0,0.85))',
			gradient: 'radial-gradient(circle, var(--ms-text) 20%, #000000 90%)'
		}
	];

	interface TransitionPreset {
		id: string;
		name: string;
		duration: number;
		description: string;
		animationClass: string;
	}

	const transitionPresets: TransitionPreset[] = [
		{
			id: 'cross-dissolve',
			name: 'Cross Dissolve',
			duration: 1.0,
			description: 'Smooth opacity blending between consecutive clips',
			animationClass: 'anim-dissolve'
		},
		{
			id: 'fade-to-black',
			name: 'Fade to Black',
			duration: 0.8,
			description: 'Dip to solid black for dramatic scene transitions',
			animationClass: 'anim-fade-black'
		},
		{
			id: 'slide-left',
			name: 'Slide Left',
			duration: 0.6,
			description: 'Dynamic lateral push sliding the next scene in',
			animationClass: 'anim-slide-left'
		},
		{
			id: 'wipe-right',
			name: 'Wipe Right',
			duration: 0.7,
			description: 'Linear directional cut uncovering new footage',
			animationClass: 'anim-wipe-right'
		},
		{
			id: 'zoom-dissolve',
			name: 'Zoom Dissolve',
			duration: 0.8,
			description: 'Kinetic zoom-in dissolve scaling into the next frame',
			animationClass: 'anim-zoom-dissolve'
		}
	];

	// Filtered imported media assets
	const filteredAssets = $derived.by(() => {
		const project = $projectStore;
		if (!project || !project.assets) return [];
		const list = Array.from(project.assets.entries());
		return list.filter(([_, asset]) => {
			if (mediaFilter === 'video' && asset.type !== 'video') return false;
			if (mediaFilter === 'audio' && asset.type !== 'audio') return false;
			if (mediaFilter === 'image' && asset.type !== 'image') return false;
			if (searchQuery.trim()) {
				return asset.filename.toLowerCase().includes(searchQuery.toLowerCase());
			}
			return true;
		});
	});

	// Media Import handlers
	async function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement | null;
		if (!target || !target.files || target.files.length === 0) return;
		await importMediaFiles(Array.from(target.files), false);
		target.value = '';
		showToast('Imported media file(s) into project');
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			await importMediaFiles(Array.from(e.dataTransfer.files), false);
			showToast('Imported dropped files into project');
		}
	}

	function handleDeleteAsset(assetId: string, event: MouseEvent) {
		event.stopPropagation();
		projectStore.update((project) => {
			if (!project) return project;
			const newAssets = new Map(project.assets);
			newAssets.delete(assetId);

			const newClips = new Map(project.clips);
			for (const [cId, c] of newClips) {
				if (c.mediaAssetId === assetId) {
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
		thumbnailCache.delete(assetId);
		if (selectedAssetId === assetId) selectedAssetId = null;
		showToast('Asset removed from project');
	}

	function addAssetToTimeline(assetId: string) {
		const project = get(projectStore);
		if (!project || !project.activeSequenceId) return;
		const asset = project.assets.get(assetId);
		if (!asset) return;

		const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
		if (!sequence) return;

		const isAudio = asset.type === 'audio';
		let targetTrack = sequence.tracks.find((t) => t.type === (isAudio ? 'audio' : 'video'));
		if (!targetTrack && sequence.tracks.length > 0) {
			targetTrack = sequence.tracks[0];
		}
		if (!targetTrack) return;

		const playheadTime = get(playbackStore).currentTime;
		const addCmd = new AddClipCommand({
			mediaAssetId: assetId,
			trackId: targetTrack.id,
			position: playheadTime
		});
		commandProcessor.execute(addCmd);
		showToast(`Added "${asset.filename}" to timeline`);
	}

	// Audio Synthesis & Preview
	function synthesizeAudioBuffer(ctx: BaseAudioContext, presetId: string, duration: number): AudioBuffer {
		const sampleRate = ctx.sampleRate || 44100;
		const length = Math.floor(sampleRate * duration);
		const buffer = ctx.createBuffer(2, length, sampleRate);
		const left = buffer.getChannelData(0);
		const right = buffer.getChannelData(1);

		for (let i = 0; i < length; i++) {
			const t = i / sampleRate;
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
					const fade = Math.min(1, t / 1.5) * Math.min(1, (duration - t) / 2);
					valL = pad * fade * 0.65;
					valR = (pad + Math.sin(2 * Math.PI * 165.5 * t) * 0.1) * fade * 0.65;
					break;
				}
				case 'whoosh-sfx': {
					const prog = t / duration;
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

			left[i] = Math.max(-1, Math.min(1, valL));
			right[i] = Math.max(-1, Math.min(1, valR));
		}

		return buffer;
	}

	function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
		const numChannels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const numSamples = buffer.length;
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
		view.setUint16(20, 1, true);
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, byteRate, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, 16, true);
		writeString(36, 'data');
		view.setUint32(40, dataSize, true);

		const left = buffer.getChannelData(0);
		const right = numChannels > 1 ? buffer.getChannelData(1) : left;
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

		return new Blob([arrayBuf], { type: 'audio/wav' });
	}

	function generateAudioWaveformThumbnail(color = 'var(--ms-text-secondary)'): string {
		const canvas = document.createElement('canvas');
		canvas.width = 160;
		canvas.height = 90;
		const ctx = canvas.getContext('2d');
		if (!ctx) return placeholderThumbnail;
		ctx.fillStyle = 'var(--ms-void)';
		ctx.fillRect(0, 0, 160, 90);
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, 45);
		for (let x = 0; x <= 160; x += 4) {
			const y = 45 + Math.sin(x * 0.15) * 26 * Math.sin(x * 0.05);
			ctx.lineTo(x, y);
		}
		ctx.stroke();
		return canvas.toDataURL('image/png');
	}

	function togglePlayAudioPreview(preset: AudioPreset) {
		if (playingAudioPresetId === preset.id) {
			if (activeAudioSource) {
				try {
					activeAudioSource.stop();
				} catch {
					// ignore
				}
				activeAudioSource = null;
			}
			playingAudioPresetId = null;
			return;
		}

		if (activeAudioSource) {
			try {
				activeAudioSource.stop();
			} catch {
				// ignore
			}
			activeAudioSource = null;
		}

		try {
			const ctx = getAudioContext();
			const audioBuffer = synthesizeAudioBuffer(ctx, preset.id, preset.duration);
			const source = ctx.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(ctx.destination);
			source.onended = () => {
				if (playingAudioPresetId === preset.id) {
					playingAudioPresetId = null;
				}
			};
			source.start(0);
			activeAudioSource = source;
			playingAudioPresetId = preset.id;
		} catch (err) {
			console.error('Audio preview error:', err);
			playingAudioPresetId = null;
		}
	}

	async function handleAddAudioPreset(preset: AudioPreset) {
		try {
			const ctx = getAudioContext();
			const audioBuffer = synthesizeAudioBuffer(ctx, preset.id, preset.duration);
			const wavBlob = audioBufferToWavBlob(audioBuffer);
			const assetId = crypto.randomUUID();
			const filename = `${preset.name.replace(/\s+/g, '_')}.wav`;

			const mediaAsset: MediaAsset = {
				id: assetId,
				filename,
				sourceBlob: wavBlob,
				type: 'audio',
				duration: preset.duration,
				mimeType: 'audio/wav',
				createdAt: Date.now(),
				modifiedAt: Date.now()
			};

			addAsset(mediaAsset);

			const thumb = generateAudioWaveformThumbnail();
			thumbnailCache.set(assetId, thumb);

			const project = get(projectStore);
			if (project && project.activeSequenceId) {
				const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
				if (sequence) {
					const audioTracks = sequence.tracks.filter((t) => t.type === 'audio');
					const targetTrack = audioTracks[0] ?? sequence.tracks[0];
					if (targetTrack) {
						const playheadTime = get(playbackStore).currentTime;
						const addCmd = new AddClipCommand({
							mediaAssetId: assetId,
							trackId: targetTrack.id,
							position: playheadTime
						});
						commandProcessor.execute(addCmd);
					}
				}
			}

			showToast(`Added audio "${preset.name}" to timeline`);
		} catch (err) {
			console.error('Failed to add audio preset:', err);
		}
	}

	// Text Presets Rendering
	async function createTextPresetBlob(preset: TextPreset): Promise<{ blob: Blob; dataUrl: string }> {
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 1080;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas context not available');

		ctx.clearRect(0, 0, 1920, 1080);

		switch (preset.id) {
			case 'title-card': {
				const grad = ctx.createRadialGradient(960, 540, 200, 960, 540, 950);
				grad.addColorStop(0, 'rgba(15, 23, 42, 0.75)');
				grad.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, 1920, 1080);

				ctx.fillStyle = 'var(--ms-text)';
				ctx.fillRect(860, 430, 200, 4);

				ctx.font = 'bold 82px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text)';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('CINEMATIC TITLE', 960, 520);

				ctx.font = '500 32px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text-secondary)';
				ctx.fillText('CREATIVE STORYLINE & VISION', 960, 600);
				break;
			}
			case 'lower-third': {
				const boxX = 140;
				const boxY = 820;
				const boxW = 760;
				const boxH = 140;

				ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
				ctx.beginPath();
				ctx.roundRect(boxX, boxY, boxW, boxH, 12);
				ctx.fill();

				ctx.fillStyle = 'var(--ms-text)';
				ctx.beginPath();
				ctx.roundRect(boxX, boxY, 8, boxH, [12, 0, 0, 12]);
				ctx.fill();

				ctx.font = 'bold 44px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text)';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText('ALEX MORGAN', boxX + 36, boxY + 28);

				ctx.font = '500 26px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text)';
				ctx.fillText('Director of Photography', boxX + 36, boxY + 84);
				break;
			}
			case 'subtitles': {
				const text = 'Exploring the frontier of modern visual storytelling.';
				ctx.font = '600 38px system-ui, sans-serif';
				const textMetrics = ctx.measureText(text);
				const padX = 36;
				const badgeW = textMetrics.width + padX * 2;
				const badgeH = 68;
				const badgeX = (1920 - badgeW) / 2;
				const badgeY = 920;

				ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
				ctx.beginPath();
				ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
				ctx.fill();

				ctx.fillStyle = 'var(--ms-text)';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(text, 960, badgeY + badgeH / 2);
				break;
			}
			case 'callout': {
				const cX = 200;
				const cY = 240;
				const cW = 440;
				const cH = 110;

				ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
				ctx.beginPath();
				ctx.roundRect(cX, cY, cW, cH, 10);
				ctx.fill();

				ctx.strokeStyle = 'var(--ms-text)';
				ctx.lineWidth = 3;
				ctx.stroke();

				ctx.font = 'bold 34px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text)';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText('★ PRO TIP', cX + 24, cY + 20);

				ctx.font = '500 24px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text)';
				ctx.fillText('High Dynamic Range 4K', cX + 24, cY + 62);
				break;
			}
			case 'minimal-heading': {
				ctx.font = '300 56px system-ui, sans-serif';
				ctx.fillStyle = 'var(--ms-text)';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText('CHAPTER ONE', 160, 160);

				ctx.fillStyle = 'var(--ms-text)';
				ctx.fillRect(160, 236, 120, 3);
				break;
			}
		}

		const dataUrl = canvas.toDataURL('image/png');
		const blob = await new Promise<Blob>((resolve) => {
			canvas.toBlob((b) => resolve(b || new Blob()), 'image/png');
		});

		return { blob, dataUrl };
	}

	async function handleAddTextPreset(preset: TextPreset) {
		try {
			const { blob, dataUrl } = await createTextPresetBlob(preset);
			const assetId = crypto.randomUUID();
			const filename = `${preset.name.replace(/\s+/g, '_')}.png`;

			const mediaAsset: MediaAsset = {
				id: assetId,
				filename,
				sourceBlob: blob,
				type: 'image',
				duration: preset.duration,
				width: 1920,
				height: 1080,
				mimeType: 'image/png',
				createdAt: Date.now(),
				modifiedAt: Date.now()
			};

			addAsset(mediaAsset);

			thumbnailCache.set(assetId, dataUrl);

			const project = get(projectStore);
			if (project && project.activeSequenceId) {
				const sequence = project.sequences.find((s) => s.id === project.activeSequenceId);
				if (sequence) {
					const videoTracks = sequence.tracks.filter((t) => t.type === 'video');
					const targetTrack = videoTracks.length > 1 ? videoTracks[1] : (videoTracks[0] ?? sequence.tracks[0]);
					if (targetTrack) {
						const playheadTime = get(playbackStore).currentTime;
						const addCmd = new AddClipCommand({
							mediaAssetId: assetId,
							trackId: targetTrack.id,
							position: playheadTime
						});
						commandProcessor.execute(addCmd);
					}
				}
			}

			showToast(`Added text preset "${preset.name}" to timeline`);
		} catch (err) {
			console.error('Failed to add text preset:', err);
		}
	}

	// Effects & Transitions Actions
	// Applies the real effect, not a brightness nudge wearing its name.
	function applyEffect(effectId: string) {
		const timeline = get(timelineStore);
		if (!timeline.selectedClipId) {
			showToast('Select a clip on the timeline first');
			return;
		}
		const def = effectById(effectId);
		if (!def) return;

		commandProcessor.execute(
			new AddClipEffectCommand({ clipId: timeline.selectedClipId, effectId })
		);
		// Seed this effect's own parameters so it renders at a sensible
		// strength immediately.
		for (const [name, value] of Object.entries(def.params)) {
			commandProcessor.execute(
				new SetClipFilterCommand({ clipId: timeline.selectedClipId, filterName: name, value })
			);
		}
		showToast(`Applied ${def.name}`);
	}

	function handleApplyTransition(preset: TransitionPreset) {
		const timeline = get(timelineStore);
		if (!timeline.selectedClipId) {
			showToast('Click a clip on the timeline first to apply transition');
			return;
		}

		commandProcessor.execute(
			new SetClipTransitionCommand({ clipId: timeline.selectedClipId, transitionId: preset.id })
		);

		showToast(`Applied "${preset.name}" transition to clip!`);
	}
</script>

<aside
	class="mediabin-shell"
	class:drag-active={isDragOver}
	ondragover={(e) => {
		e.preventDefault();
		isDragOver = true;
	}}
	ondragleave={() => (isDragOver = false)}
	ondrop={handleDrop}
	role="region"
	aria-label="Category Navigation & Media Bin"
>
	<!-- Responsive Category Drawer matching active pillar -->
	<div class="drawer-viewport">
		<!-- Drawer Header -->
		<div class="drawer-header">
			<div class="drawer-header-title-box">
				<!-- Was a Material Symbols ligature, which renders as the literal
				     keyword ("swap_horiz") whenever that font has not loaded.
				     Uses the app's own icon set instead. -->
				<span class="drawer-header-icon" aria-hidden="true">
					<Icon
						name={activePillar === 'media'
							? 'folder'
							: activePillar === 'text'
								? 'text'
								: activePillar === 'audio'
									? 'page-audio'
									: activePillar === 'effects'
										? 'effects'
										: 'chevron'}
						size={15}
					/>
				</span>
				<span class="drawer-header-title">
					{#if activePillar === 'media'}Media Bin{:else if activePillar === 'text'}Text Templates{:else if activePillar === 'audio'}Audio & Music{:else if activePillar === 'effects'}Visual Effects{:else}Transitions{/if}
				</span>
			</div>

			{#if activePillar === 'media'}
				<button class="header-action-btn" onclick={() => fileInput?.click()} title="Import media files from computer">
					<span>+ Import</span>
				</button>
			{/if}
		</div>

		<!-- Notification Toast banner -->
		{#if toastMessage}
			<div class="drawer-toast" role="status">
				<span>{toastMessage}</span>
			</div>
		{/if}

		<!-- DRAWER CONTENT 1: MEDIA DRAWER -->
		{#if activePillar === 'media'}
			<div class="drawer-content-box">
				<!-- Search & Filter Controls -->
				<div class="search-filter-bar">
					<div class="search-input-wrapper">
						<span class="search-glass"><span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></span></span>
						<input
							type="text"
							placeholder="Search media..."
							bind:value={searchQuery}
							aria-label="Search media files"
						/>
						{#if searchQuery}
							<button class="clear-search-btn" onclick={() => (searchQuery = '')} title="Clear search"><span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span></button>
						{/if}
					</div>

					<div class="view-mode-toggle">
						<button
							class="mode-btn"
							class:active={viewMode === 'grid'}
							onclick={() => (viewMode = 'grid')}
							title="Grid view"
						>
							⊞
						</button>
						<button
							class="mode-btn"
							class:active={viewMode === 'list'}
							onclick={() => (viewMode = 'list')}
							title="List view"
						>
							<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span>
						</button>
					</div>
				</div>

				<!-- Type Filter Chips -->
				<div class="filter-chips-row">
					<button
						class="chip-btn"
						class:active={mediaFilter === 'all'}
						onclick={() => (mediaFilter = 'all')}
					>
						All
					</button>
					<button
						class="chip-btn"
						class:active={mediaFilter === 'video'}
						onclick={() => (mediaFilter = 'video')}
					>
						Videos
					</button>
					<button
						class="chip-btn"
						class:active={mediaFilter === 'audio'}
						onclick={() => (mediaFilter = 'audio')}
					>
						Audio
					</button>
					<button
						class="chip-btn"
						class:active={mediaFilter === 'image'}
						onclick={() => (mediaFilter = 'image')}
					>
						Images
					</button>
				</div>

				<!-- Media Assets Scroll Area -->
				<div class="drawer-scroll-container">
					{#if filteredAssets.length === 0}
						<div
							class="empty-media-dropzone"
							onclick={() => fileInput?.click()}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') fileInput?.click();
							}}
							role="button"
							tabindex="0"
						>
							<span class="empty-icon"><span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.6 8a2.4 2.4 0 0 1 2.4-2.4h3.2l2 2.4h6.8a2.4 2.4 0 0 1 2.4 2.4v6.2a2.4 2.4 0 0 1-2.4 2.4H6a2.4 2.4 0 0 1-2.4-2.4Z"/></svg></span></span>
							<span class="empty-title">
								{searchQuery ? 'No matching media files' : 'No media files yet'}
							</span>
							<span class="empty-desc">
								{searchQuery ? 'Try clearing your search query' : 'Drag & drop clips here or click to import'}
							</span>
							<button class="empty-import-cta" onclick={(e) => { e.stopPropagation(); fileInput?.click(); }}>
								+ Browse Files
							</button>
						</div>
					{:else if viewMode === 'grid'}
						<div class="media-grid">
							{#each filteredAssets as [assetId, asset] (assetId)}
								<div
									class="asset-card"
									class:selected={selectedAssetId === assetId}
									role="button"
									draggable="true"
									tabindex="0"
									onclick={() => (selectedAssetId = assetId)}
									ondblclick={() => addAssetToTimeline(assetId)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') addAssetToTimeline(assetId);
									}}
									ondragstart={(e) => {
										e.dataTransfer?.setData('text/plain', assetId);
										e.dataTransfer?.setData('application/x-rayshot-asset', JSON.stringify({ assetId, type: asset.type }));
									}}
									title="{asset.filename} — Double-click or click + to add to timeline"
								>
									<div class="asset-thumb-box">
										<img
											src={thumbnailCache.get(assetId) ?? placeholderThumbnail}
											alt={asset.filename}
											onerror={(e) => {
												(e.currentTarget as HTMLImageElement).src = placeholderThumbnail;
											}}
										/>
										<span class="type-badge {asset.type}">{asset.type}</span>
										<span class="dur-badge font-mono">{asset.duration.toFixed(1)}s</span>

										<div class="card-overlay-actions">
											<button
												class="quick-add-btn"
												title="Add to timeline"
												onclick={(e) => {
													e.stopPropagation();
													addAssetToTimeline(assetId);
												}}
											>
												+
											</button>
											<button
												class="quick-del-btn"
												title="Remove asset"
												onclick={(e) => handleDeleteAsset(assetId, e)}
											>
												<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
											</button>
										</div>
									</div>
									<div class="asset-meta">
										<span class="asset-name" title={asset.filename}>{asset.filename}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<!-- List View -->
						<div class="media-list">
							{#each filteredAssets as [assetId, asset] (assetId)}
								<div
									class="list-item-row"
									class:selected={selectedAssetId === assetId}
									role="button"
									draggable="true"
									tabindex="0"
									onclick={() => (selectedAssetId = assetId)}
									ondblclick={() => addAssetToTimeline(assetId)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') addAssetToTimeline(assetId);
									}}
									ondragstart={(e) => {
										e.dataTransfer?.setData('text/plain', assetId);
									}}
								>
									<div class="list-thumb">
										<img
											src={thumbnailCache.get(assetId) ?? placeholderThumbnail}
											alt={asset.filename}
										/>
									</div>
									<div class="list-info">
										<span class="list-filename" title={asset.filename}>{asset.filename}</span>
										<div class="list-sub-badges">
											<span class="type-badge-mini {asset.type}">{asset.type}</span>
											<span class="dur-text font-mono">{asset.duration.toFixed(1)}s</span>
										</div>
									</div>
									<div class="list-actions">
										<button
											class="list-add-btn"
											title="Add to timeline"
											onclick={(e) => {
												e.stopPropagation();
												addAssetToTimeline(assetId);
											}}
										>
											+
										</button>
										<button
											class="list-del-btn"
											title="Delete asset"
											onclick={(e) => handleDeleteAsset(assetId, e)}
										>
											<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

		<!-- DRAWER CONTENT 2: TEXT PRESETS DRAWER -->
		{:else if activePillar === 'text'}
			<div class="drawer-scroll">
				<h3 class="drawer-section-title">Titles</h3>
				<div class="preset-list">
					{#each textPresets as preset (preset.id)}
						<button class="preset-row" onclick={() => handleAddTextPreset(preset)} title={preset.description}>
							<span class="preset-mark" data-kind="text" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
									<path d="M5 7.5V6h14v1.5" /><path d="M12 6v12" /><path d="M9 18h6" />
								</svg>
							</span>
							<span class="preset-body">
								<span class="preset-name">{preset.name}</span>
								<span class="preset-desc">{preset.description}</span>
							</span>
							<span class="preset-meta">{preset.duration}s</span>
						</button>
					{/each}
				</div>
			</div>
		{:else if activePillar === 'audio'}
			<div class="drawer-content-box">
				<div class="drawer-section-intro">
					<span class="intro-headline">Sound FX & Music</span>
					<span class="intro-subtext">Built-in audio textures with interactive live preview</span>
				</div>

				<div class="drawer-scroll-container">
					<div class="presets-vertical-list">
						{#each audioPresets as preset (preset.id)}
							<div
								class="preset-card audio-preset-card"
								role="button"
								tabindex="0"
								draggable="true"
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') handleAddAudioPreset(preset);
								}}
								ondragstart={(e) => {
									e.dataTransfer?.setData('application/x-rayshot-audio-preset', JSON.stringify(preset));
									e.dataTransfer?.setData('text/plain', `audio:${preset.id}`);
								}}
							>
								<div class="audio-card-top">
									<button
										class="audio-preview-toggle-btn"
										class:playing={playingAudioPresetId === preset.id}
										onclick={() => togglePlayAudioPreview(preset)}
										title={playingAudioPresetId === preset.id ? 'Stop audio preview' : 'Play audio preview'}
									>
										{#if playingAudioPresetId === preset.id}
											<span class="preview-playing-icon">⏹</span>
										{:else}
											<span class="preview-play-icon">▶</span>
										{/if}
									</button>

									<div class="audio-card-meta">
										<div class="audio-title-line">
											<span class="preset-name">{preset.name}</span>
											<span class="audio-type-pill {preset.type.toLowerCase()}">{preset.type}</span>
										</div>
										<span class="preset-desc">{preset.description}</span>
									</div>
								</div>

								<div class="audio-card-footer">
									<span class="audio-duration font-mono">⏱ {preset.duration.toFixed(1)}s</span>
									<button
										class="preset-add-btn"
										onclick={() => handleAddAudioPreset(preset)}
										title="Add to audio track on timeline"
									>
										+ Add Track
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

		<!-- DRAWER CONTENT 4: EFFECTS & FILTERS DRAWER (Stitch Filters_and_Effects 1:1) -->
		{:else if activePillar === 'effects'}
			<div class="drawer-scroll">
				<h3 class="drawer-section-title">Video</h3>
				<div class="effect-grid">
					{#each VIDEO_EFFECTS as effect (effect.id)}
						<button class="effect-card" onclick={() => applyEffect(effect.id)} title={effect.description}>
							<span class="effect-name">{effect.name}</span>
							<span class="effect-desc">{effect.description}</span>
						</button>
					{/each}
				</div>

				<h3 class="drawer-section-title">Voice</h3>
				<div class="effect-grid">
					{#each AUDIO_EFFECTS as effect (effect.id)}
						<button class="effect-card" onclick={() => applyEffect(effect.id)} title={effect.description}>
							<span class="effect-name">{effect.name}</span>
							<span class="effect-desc">{effect.description}</span>
						</button>
					{/each}
				</div>
			</div>
		{:else if activePillar === 'transitions'}
			<div class="drawer-scroll">
				<h3 class="drawer-section-title">Between clips</h3>
				<div class="preset-list">
					{#each transitionPresets as preset (preset.id)}
						<button class="preset-row" onclick={() => handleApplyTransition(preset)} title={preset.description}>
							<span class="preset-mark" data-kind="transition" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
									<rect x="3" y="6" width="8" height="12" rx="1.6" />
									<rect x="13" y="6" width="8" height="12" rx="1.6" opacity="0.45" />
								</svg>
							</span>
							<span class="preset-body">
								<span class="preset-name">{preset.name}</span>
								<span class="preset-desc">{preset.description}</span>
							</span>
							<span class="preset-meta">{preset.duration}s</span>
						</button>
					{/each}
				</div>
				<p class="drawer-note">Applies to the selected clip's incoming edge.</p>
			</div>
		{/if}
	</div>

	<!-- Hidden File Input -->
	<input
		type="file"
		bind:this={fileInput}
		onchange={handleFileChange}
		multiple
		accept="video/*,audio/*,image/*"
		style="display: none;"
	/>
</aside>

<style>
	/* Emoji are not an icon set: they render differently per platform and
	   carry colour we do not want. Inline SVG on the same 24x24 grid. */
	.ui-glyph {
		display: inline-flex;
		width: 1em;
		height: 1em;
		vertical-align: -0.125em;
	}

	.ui-glyph svg {
		width: 100%;
		height: 100%;
	}

	/* One row pattern across Effects, Text and Transitions: mark, name plus a
	   plain-language description, and the one number that matters. Cards with
	   fake gradient thumbnails told the user nothing about what they do. */
	.preset-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 12px 14px;
	}

	.preset-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: 1px solid transparent;
		border-radius: var(--ms-radius);
		background: transparent;
		text-align: left;
		cursor: pointer;
		font-family: var(--ms-font);
		transition:
			background var(--ms-fast) var(--ms-ease),
			border-color var(--ms-fast) var(--ms-ease);
	}

	.preset-row:hover {
		background: var(--ms-hover);
		border-color: var(--ms-edge);
	}

	.preset-row:focus-visible {
		outline: 2px solid var(--ms-text);
		outline-offset: 2px;
	}

	.preset-mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		background: var(--ms-material);
		color: var(--ms-text-secondary);
	}

	.preset-mark svg {
		width: 15px;
		height: 15px;
	}

	.preset-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.preset-name {
		font-size: 12px;
		font-weight: 590;
		color: var(--ms-text);
	}

	.preset-desc {
		font-size: 10.5px;
		line-height: 1.4;
		color: var(--ms-text-tertiary);
	}

	.preset-meta {
		flex-shrink: 0;
		font-family: var(--ms-font-mono);
		font-size: 10.5px;
		color: var(--ms-text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.drawer-note {
		margin: 0;
		padding: 0 12px 14px;
		font-family: var(--ms-font);
		font-size: 10.5px;
		line-height: 1.5;
		color: var(--ms-text-tertiary);
	}

	.drawer-scroll {
		flex: 1;
		overflow-y: auto;
		padding-top: 8px;
	}

	.effect-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 0 12px 14px;
	}

	.drawer-section-title {
		margin: 4px 0 8px;
		padding: 0 12px;
		font-family: var(--ms-font);
		font-size: 11px;
		font-weight: 590;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ms-text-tertiary);
	}

	.effect-card {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 10px;
		border: 1px solid var(--ms-edge);
		border-radius: var(--ms-radius);
		background: var(--ms-material);
		text-align: left;
		cursor: pointer;
		font-family: var(--ms-font);
		transition:
			background var(--ms-fast) var(--ms-ease),
			border-color var(--ms-fast) var(--ms-ease);
	}

	.effect-card:hover {
		background: var(--ms-hover);
		border-color: var(--ms-edge-strong);
	}

	.effect-name {
		font-size: 12px;
		font-weight: 590;
		color: var(--ms-text);
	}

	.effect-desc {
		font-size: 10.5px;
		line-height: 1.4;
		color: var(--ms-text-tertiary);
	}

	.mediabin-shell {
		display: flex;
		height: 100%;
		width: 100%;
		background: var(--ms-void);
		border-right: 1px solid var(--ms-edge);
		user-select: none;
		overflow: hidden;
		box-sizing: border-box;
		position: relative;
	}

	.mediabin-shell.drag-active {
		outline: 2px dashed var(--ms-text);
		outline-offset: -3px;
		background: var(--ms-material);
	}

	/* =========================================================================
	   1. Vertical 5-Pillar Navigation Bar
	   ========================================================================= */
	.pillar-nav-bar {
		width: 62px;
		background: var(--ms-void);
		border-right: 1px solid var(--ms-edge);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 0;
		gap: 6px;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.pillar-btn {
		width: 52px;
		height: 52px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		color: var(--ms-text-secondary);
		cursor: pointer;
		transition: all 0.16s ease;
		padding: 0;
	}

	.pillar-btn:hover {
		background: var(--ms-edge);
		color: var(--ms-text);
		border-color: var(--ms-edge);
	}

	.pillar-btn.active {
		background: rgba(56, 189, 248, 0.12);
		border-color: rgba(56, 189, 248, 0.4);
		color: var(--ms-text);
	}

	.pillar-icon {
		font-size: 1.15rem;
		line-height: 1;
	}

	.pillar-label {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	/* =========================================================================
	   2. Responsive Drawer Viewport & Headers
	   ========================================================================= */
	.drawer-viewport {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		background: var(--ms-void);
		overflow: hidden;
		position: relative;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: var(--ms-edge);
		border-bottom: 1px solid var(--ms-edge);
		height: 38px;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.drawer-header-title-box {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.drawer-header-icon {
		font-size: 0.85rem;
		color: var(--ms-text);
	}

	.drawer-header-title {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--ms-text);
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.header-action-btn {
		background: var(--ms-edge);
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text);
		font-size: 0.68rem;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.header-action-btn:hover {
		background: var(--ms-text);
		color: var(--ms-void);
		border-color: var(--ms-text);
	}

	.drawer-toast {
		position: absolute;
		top: 42px;
		left: 12px;
		right: 12px;
		z-index: 100;
		background: var(--ms-material);
		border: 1px solid var(--ms-text);
		color: var(--ms-text);
		font-size: 0.68rem;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
		animation: toastFadeIn 0.2s ease-out;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
	}

	@keyframes toastFadeIn {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.drawer-content-box {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.drawer-section-intro {
		padding: 8px 12px 6px;
		border-bottom: 1px solid var(--ms-raised);
		background: var(--ms-material);
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.intro-headline {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--ms-text-secondary);
	}

	.intro-subtext {
		font-size: 0.62rem;
		color: var(--ms-text-secondary);
	}

	.drawer-scroll-container {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
		box-sizing: border-box;
	}

	/* =========================================================================
	   3. Media Drawer Controls & Grid / List Views
	   ========================================================================= */
	.search-filter-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		background: var(--ms-material);
		border-bottom: 1px solid var(--ms-raised);
		gap: 6px;
		flex-shrink: 0;
	}

	.search-input-wrapper {
		display: flex;
		align-items: center;
		background: var(--ms-void);
		border: 1px solid var(--ms-edge);
		border-radius: 4px;
		padding: 2px 6px;
		flex: 1;
		min-width: 0;
	}

	.search-glass {
		font-size: 0.65rem;
		color: var(--ms-text-tertiary);
		margin-right: 4px;
	}

	.search-input-wrapper input {
		background: transparent;
		border: none;
		outline: none;
		color: var(--ms-text);
		font-size: 0.68rem;
		width: 100%;
	}

	.clear-search-btn {
		background: transparent;
		border: none;
		color: var(--ms-text-tertiary);
		font-size: 0.6rem;
		cursor: pointer;
		padding: 0 2px;
	}

	.clear-search-btn:hover {
		color: var(--ms-text-secondary);
	}

	.view-mode-toggle {
		display: flex;
		gap: 2px;
	}

	.mode-btn {
		background: transparent;
		border: 1px solid transparent;
		color: var(--ms-text-tertiary);
		font-size: 0.75rem;
		padding: 2px 4px;
		border-radius: 3px;
		cursor: pointer;
	}

	.mode-btn:hover {
		color: var(--ms-text-secondary);
	}

	.mode-btn.active {
		color: var(--ms-text);
		background: var(--ms-raised);
		border-color: var(--ms-edge);
	}

	.filter-chips-row {
		display: flex;
		gap: 4px;
		padding: 6px 10px;
		background: var(--ms-void);
		border-bottom: 1px solid var(--ms-raised);
		flex-shrink: 0;
	}

	.chip-btn {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		color: var(--ms-text-secondary);
		font-size: 0.62rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.chip-btn:hover {
		color: var(--ms-text);
		border-color: var(--ms-edge-strong);
	}

	.chip-btn.active {
		background: var(--ms-text);
		color: var(--ms-void);
		border-color: var(--ms-text);
	}

	/* Empty State Dropzone */
	.empty-media-dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 36px 14px;
		border: 1.5px dashed var(--ms-edge);
		border-radius: 8px;
		cursor: pointer;
		background: var(--ms-void);
		text-align: center;
		gap: 6px;
		transition: all 0.15s ease;
	}

	.empty-media-dropzone:hover {
		border-color: var(--ms-text);
		background: var(--ms-material);
	}

	.empty-icon {
		font-size: 1.8rem;
		margin-bottom: 2px;
	}

	.empty-title {
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--ms-text-secondary);
	}

	.empty-desc {
		font-size: 0.64rem;
		color: var(--ms-text-tertiary);
		max-width: 180px;
	}

	.empty-import-cta {
		margin-top: 6px;
		background: var(--ms-edge);
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text);
		font-size: 0.68rem;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.empty-import-cta:hover {
		background: var(--ms-text);
		color: var(--ms-void);
		border-color: var(--ms-text);
	}

	/* Media Grid View */
	.media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
		gap: 8px;
	}

	.asset-card {
		display: flex;
		flex-direction: column;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		overflow: hidden;
		cursor: grab;
		transition: all 0.15s ease;
	}

	.asset-card:hover {
		border-color: var(--ms-text);
		transform: translateY(-1px);
	}

	.asset-card.selected {
		border-color: var(--ms-text);
		box-shadow: 0 0 0 1px var(--ms-text);
	}

	.asset-thumb-box {
		position: relative;
		width: 100%;
		height: 56px;
		background: var(--ms-void);
	}

	.asset-thumb-box img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.type-badge {
		position: absolute;
		top: 3px;
		left: 3px;
		font-size: 0.48rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 1px 3px;
		border-radius: 2px;
		color: var(--ms-text);
	}

	.type-badge.video {
		background: var(--ms-text-secondary);
	}

	.type-badge.audio {
		background: var(--ms-text-secondary);
	}

	.type-badge.image {
		background: var(--ms-text-secondary);
	}

	.dur-badge {
		position: absolute;
		bottom: 3px;
		right: 3px;
		font-size: 0.52rem;
		background: rgba(0, 0, 0, 0.85);
		color: var(--ms-text);
		padding: 1px 3px;
		border-radius: 2px;
	}

	.card-overlay-actions {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(9, 10, 13, 0.6);
		display: none;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}

	.asset-card:hover .card-overlay-actions {
		display: flex;
	}

	.quick-add-btn,
	.quick-del-btn {
		width: 22px;
		height: 22px;
		border-radius: 4px;
		border: none;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.quick-add-btn {
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.quick-add-btn:hover {
		background: var(--ms-text-secondary);
		color: var(--ms-text);
	}

	.quick-del-btn {
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.quick-del-btn:hover {
		background: var(--ms-text);
	}

	.asset-meta {
		padding: 4px 6px;
	}

	.asset-name {
		font-size: 0.64rem;
		font-weight: 500;
		color: var(--ms-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	/* Media List View */
	.media-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.list-item-row {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 5px;
		padding: 4px 6px;
		cursor: grab;
		transition: all 0.12s ease;
	}

	.list-item-row:hover {
		border-color: var(--ms-text);
		background: var(--ms-raised);
	}

	.list-item-row.selected {
		border-color: var(--ms-text);
	}

	.list-thumb {
		width: 38px;
		height: 26px;
		background: var(--ms-void);
		border-radius: 3px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.list-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.list-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.list-filename {
		font-size: 0.66rem;
		font-weight: 600;
		color: var(--ms-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.list-sub-badges {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.type-badge-mini {
		font-size: 0.46rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0 3px;
		border-radius: 2px;
		color: var(--ms-text);
	}

	.type-badge-mini.video {
		background: var(--ms-text-secondary);
	}

	.type-badge-mini.audio {
		background: var(--ms-text-secondary);
	}

	.type-badge-mini.image {
		background: var(--ms-text-secondary);
	}

	.dur-text {
		font-size: 0.54rem;
		color: var(--ms-text-secondary);
	}

	.list-actions {
		display: flex;
		gap: 3px;
		flex-shrink: 0;
	}

	.list-add-btn,
	.list-del-btn {
		width: 18px;
		height: 18px;
		border-radius: 3px;
		border: none;
		font-size: 0.65rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.list-add-btn {
		background: var(--ms-edge);
		color: var(--ms-text);
	}

	.list-add-btn:hover {
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.list-del-btn {
		background: transparent;
		color: var(--ms-text-tertiary);
	}

	.list-del-btn:hover {
		background: var(--ms-text);
		color: var(--ms-void);
	}

	/* =========================================================================
	   4. Generic Preset Cards (Text, Audio, Effects, Transitions)
	   ========================================================================= */
	.presets-vertical-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.preset-card {
		background: var(--ms-material);
		border: 1px solid var(--ms-edge);
		border-radius: 6px;
		overflow: hidden;
		transition: all 0.15s ease;
		display: flex;
		flex-direction: column;
	}

	.preset-card:hover {
		border-color: var(--ms-text);
	}

	.preset-details-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		background: var(--ms-material);
		gap: 6px;
	}

	.preset-info-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.preset-name {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--ms-text);
	}

	.preset-desc {
		font-size: 0.58rem;
		color: var(--ms-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.preset-add-btn,
	.preset-apply-btn {
		background: var(--ms-edge);
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text);
		font-size: 0.64rem;
		font-weight: 700;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.14s ease;
	}

	.preset-add-btn:hover,
	.preset-apply-btn:hover {
		background: var(--ms-text);
		color: var(--ms-void);
		border-color: var(--ms-text);
	}

	/* Text Presets Styling */
	.text-preview-box {
		position: relative;
		height: 48px;
		background: var(--ms-void);
		display: flex;
		align-items: center;
		padding: 0 10px;
	}

	.text-mockup-inner {
		display: flex;
		flex-direction: column;
		padding-left: 6px;
	}

	.mock-main {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--ms-text);
		letter-spacing: 0.02em;
	}

	.mock-sub {
		font-size: 0.52rem;
		color: var(--ms-text-secondary);
	}

	.preset-tag {
		position: absolute;
		top: 4px;
		right: 6px;
		font-size: 0.48rem;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 3px;
		text-transform: uppercase;
	}

	/* Audio Presets Styling */
	.audio-preset-card {
		padding: 8px;
		gap: 6px;
	}

	.audio-card-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.audio-preview-toggle-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--ms-edge);
		border: 1px solid var(--ms-edge-strong);
		color: var(--ms-text);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.15s ease;
	}

	.audio-preview-toggle-btn:hover {
		background: var(--ms-text);
		color: var(--ms-void);
	}

	.audio-preview-toggle-btn.playing {
		background: var(--ms-text);
		border-color: var(--ms-text);
		color: var(--ms-void);
	}

	.preview-play-icon {
		font-size: 0.7rem;
		margin-left: 2px;
	}

	.preview-playing-icon {
		font-size: 0.65rem;
	}

	.audio-card-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.audio-title-line {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.audio-type-pill {
		font-size: 0.48rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0 4px;
		border-radius: 2px;
	}

	.audio-type-pill.music {
		background: var(--ms-raised);
		color: var(--ms-text-secondary);
	}

	.audio-type-pill.sfx {
		background: var(--ms-raised);
		color: var(--ms-text-secondary);
	}

	.audio-type-pill.ambient {
		background: var(--ms-raised);
		color: var(--ms-text-secondary);
	}

	.audio-card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 4px;
		border-top: 1px solid var(--ms-raised);
	}

	.audio-duration {
		font-size: 0.58rem;
		color: var(--ms-text-secondary);
	}

	/* Effects Styling */
	.effect-banner {
		position: relative;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.effect-swatch {
		padding: 3px 14px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.swatch-text {
		font-size: 0.68rem;
		font-weight: 900;
		color: var(--ms-text);
		letter-spacing: 0.1em;
	}

	.effect-tag {
		position: absolute;
		top: 4px;
		right: 6px;
		font-size: 0.48rem;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.7);
		color: var(--ms-text-secondary);
		text-transform: uppercase;
	}

	/* Transitions Styling & Animations */
	.transition-preview-box {
		position: relative;
		height: 48px;
		background: var(--ms-void);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.transition-anim-stage {
		position: relative;
		width: 100px;
		height: 32px;
		background: var(--ms-edge);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
	}

	.stage-block {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--ms-text);
		position: absolute;
		top: 0;
		left: 0;
	}

	.block-a {
		background: var(--ms-text-secondary);
	}

	.block-b {
		background: var(--ms-text-secondary);
	}

	.trans-dur {
		position: absolute;
		bottom: 3px;
		right: 6px;
		font-size: 0.52rem;
		color: var(--ms-text-secondary);
		background: rgba(0, 0, 0, 0.7);
		padding: 0 3px;
		border-radius: 2px;
	}

	/* Transition Keyframe Animations */

	@keyframes fadeBlackAnim {
		0%, 25% { opacity: 0; }
		40%, 55% { opacity: 0; filter: brightness(0); }
		75%, 90% { opacity: 1; }
		100% { opacity: 0; }
	}

	@keyframes slideLeftAnim {
		0%, 30% { transform: translateX(100%); }
		60%, 90% { transform: translateX(0); }
		100% { transform: translateX(100%); }
	}

	@keyframes wipeRightAnim {
		0%, 30% { clip-path: inset(0 100% 0 0); }
		60%, 90% { clip-path: inset(0 0 0 0); }
		100% { clip-path: inset(0 100% 0 0); }
	}

	@keyframes zoomDissolveAnim {
		0%, 30% { opacity: 0; transform: scale(0.6); }
		60%, 90% { opacity: 1; transform: scale(1); }
		100% { opacity: 0; transform: scale(0.6); }
	}

	.font-mono {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
	}
</style>
