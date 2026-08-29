<script lang="ts">
	import { onDestroy } from 'svelte';
	import { projectStore } from '$lib/stores/project.svelte';
	import { timelineStore } from '$lib/stores/timeline.svelte';
	import { playbackStore } from '$lib/stores/playback.svelte';
	import { uiStore, uiActions } from '$lib/stores/ui.svelte';
	import { commandProcessor } from '$lib/core/commands/processor';
	import { AddClipCommand } from '$lib/core/commands/addClip';
	import { SetClipFilterCommand } from '$lib/core/commands/setClipFilter';
	import { importMediaFiles, thumbnailCache, placeholderThumbnail } from '$lib/utils/mediaUtils';
	import { get } from 'svelte/store';
	import type { MediaAsset, Project, Clip } from '$lib/types/project';

	// Category pillars
	type PillarId = 'media' | 'text' | 'audio' | 'effects' | 'transitions';

	let activePillar = $state<PillarId>('media');
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
			badgeColor: '#38bdf8'
		},
		{
			id: 'lower-third',
			name: 'Lower Third',
			category: 'Broadcast',
			description: 'Modern lower-third broadcast banner for names & titles',
			duration: 5.0,
			previewText: 'Alex Morgan',
			previewSub: 'Director of Photography',
			badgeColor: '#10b981'
		},
		{
			id: 'subtitles',
			name: 'Subtitles',
			category: 'Captions',
			description: 'Clean dialogue subtitle caption bar with high legibility',
			duration: 3.0,
			previewText: 'Captioned dialogue spoken here',
			previewSub: 'Clear readability bar',
			badgeColor: '#f59e0b'
		},
		{
			id: 'callout',
			name: 'Callout',
			category: 'Graphic',
			description: 'Vibrant highlight box with accent badge for key details',
			duration: 4.0,
			previewText: '★ KEY HIGHLIGHT',
			previewSub: 'Dynamic 4K Resolution',
			badgeColor: '#ec4899'
		},
		{
			id: 'minimal-heading',
			name: 'Minimal Heading',
			category: 'Modern',
			description: 'Understated elegant typography for chapter titles',
			duration: 4.0,
			previewText: 'CHAPTER ONE',
			previewSub: 'Clean Minimalist Style',
			badgeColor: '#8b5cf6'
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
			gradient: 'linear-gradient(135deg, #0ea5e9, #f97316)'
		},
		{
			id: 'vibrant-pop',
			name: 'Vibrant Pop',
			tag: 'Punchy',
			description: 'High saturation and vivid dynamic range for social clips',
			filterKey: 'brightness',
			filterValue: 20,
			cssFilter: 'saturate(1.7) contrast(1.25) brightness(1.1)',
			gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)'
		},
		{
			id: 'vintage-film',
			name: 'Vintage Film',
			tag: 'Retro',
			description: 'Warm sepia nostalgia with faded blacks and analog warmth',
			filterKey: 'brightness',
			filterValue: -5,
			cssFilter: 'sepia(0.55) contrast(0.95) brightness(1.1)',
			gradient: 'linear-gradient(135deg, #d97706, #78350f)'
		},
		{
			id: 'bw-noir',
			name: 'B&W Noir',
			tag: 'Monochrome',
			description: 'Dramatic black & white with deep high-contrast shadows',
			filterKey: 'brightness',
			filterValue: -10,
			cssFilter: 'grayscale(1) contrast(1.4) brightness(0.95)',
			gradient: 'linear-gradient(135deg, #ffffff, #1e293b)'
		},
		{
			id: 'soft-vignette',
			name: 'Soft Vignette',
			tag: 'Mood',
			description: 'Atmospheric darkened frame perimeter focusing viewer eyes',
			filterKey: 'brightness',
			filterValue: 5,
			cssFilter: 'contrast(1.15) brightness(1.02) drop-shadow(0 0 15px rgba(0,0,0,0.85))',
			gradient: 'radial-gradient(circle, #38bdf8 20%, #000000 90%)'
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

	function generateAudioWaveformThumbnail(color = '#10b981'): string {
		const canvas = document.createElement('canvas');
		canvas.width = 160;
		canvas.height = 90;
		const ctx = canvas.getContext('2d');
		if (!ctx) return placeholderThumbnail;
		ctx.fillStyle = '#0e111a';
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
				createdAt: Date.now(),
				modifiedAt: Date.now()
			};

			projectStore.update((project) => {
				if (!project) return project;
				const newAssets = new Map(project.assets);
				newAssets.set(assetId, mediaAsset);
				return { ...project, assets: newAssets, modifiedAt: Date.now() };
			});

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

				ctx.fillStyle = '#38bdf8';
				ctx.fillRect(860, 430, 200, 4);

				ctx.font = 'bold 82px system-ui, sans-serif';
				ctx.fillStyle = '#ffffff';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('CINEMATIC TITLE', 960, 520);

				ctx.font = '500 32px system-ui, sans-serif';
				ctx.fillStyle = '#94a3b8';
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

				ctx.fillStyle = '#38bdf8';
				ctx.beginPath();
				ctx.roundRect(boxX, boxY, 8, boxH, [12, 0, 0, 12]);
				ctx.fill();

				ctx.font = 'bold 44px system-ui, sans-serif';
				ctx.fillStyle = '#ffffff';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText('ALEX MORGAN', boxX + 36, boxY + 28);

				ctx.font = '500 26px system-ui, sans-serif';
				ctx.fillStyle = '#38bdf8';
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

				ctx.fillStyle = '#ffffff';
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

				ctx.strokeStyle = '#38bdf8';
				ctx.lineWidth = 3;
				ctx.stroke();

				ctx.font = 'bold 34px system-ui, sans-serif';
				ctx.fillStyle = '#38bdf8';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText('★ PRO TIP', cX + 24, cY + 20);

				ctx.font = '500 24px system-ui, sans-serif';
				ctx.fillStyle = '#f1f5f9';
				ctx.fillText('High Dynamic Range 4K', cX + 24, cY + 62);
				break;
			}
			case 'minimal-heading': {
				ctx.font = '300 56px system-ui, sans-serif';
				ctx.fillStyle = '#f8fafc';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText('CHAPTER ONE', 160, 160);

				ctx.fillStyle = '#38bdf8';
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
				createdAt: Date.now(),
				modifiedAt: Date.now()
			};

			projectStore.update((project) => {
				if (!project) return project;
				const newAssets = new Map(project.assets);
				newAssets.set(assetId, mediaAsset);
				return { ...project, assets: newAssets, modifiedAt: Date.now() };
			});

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
	function handleApplyEffect(preset: EffectPreset) {
		const timeline = get(timelineStore);
		if (!timeline.selectedClipId) {
			showToast('💡 Click a clip on the timeline first, then apply effect');
			return;
		}

		const filterCmd = new SetClipFilterCommand({
			clipId: timeline.selectedClipId,
			filterName: preset.filterKey,
			value: preset.filterValue
		});
		commandProcessor.execute(filterCmd);

		projectStore.update((project) => {
			if (!project) return project;
			const clip = project.clips.get(timeline.selectedClipId!);
			if (!clip) return project;
			const effects = clip.effects.includes(preset.id) ? clip.effects : [...clip.effects, preset.id];
			const updatedClips = new Map(project.clips);
			updatedClips.set(timeline.selectedClipId!, { ...clip, effects });
			return { ...project, clips: updatedClips, modifiedAt: Date.now() };
		});

		showToast(`✨ Applied "${preset.name}" to selected clip!`);
	}

	function handleApplyTransition(preset: TransitionPreset) {
		const timeline = get(timelineStore);
		if (!timeline.selectedClipId) {
			showToast('💡 Click a clip on the timeline first to apply transition');
			return;
		}

		projectStore.update((project) => {
			if (!project) return project;
			const clip = project.clips.get(timeline.selectedClipId!);
			if (!clip) return project;
			const updatedClips = new Map(project.clips);
			updatedClips.set(timeline.selectedClipId!, {
				...clip,
				transitionIn: preset.id
			});
			return { ...project, clips: updatedClips, modifiedAt: Date.now() };
		});

		showToast(`↔ Applied "${preset.name}" transition to clip!`);
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
	<!-- 1. 5-Pillar Vertical Category Navigation Bar -->
	<nav class="pillar-nav-bar" aria-label="Category pillars">
		<button
			class="pillar-btn"
			class:active={activePillar === 'media'}
			onclick={() => (activePillar = 'media')}
			title="Media Bin (Footage, Audio, Images)"
		>
			<span class="pillar-icon">▦</span>
			<span class="pillar-label">Media</span>
		</button>

		<button
			class="pillar-btn"
			class:active={activePillar === 'text'}
			onclick={() => (activePillar = 'text')}
			title="Text Titles & Lower Thirds"
		>
			<span class="pillar-icon">T</span>
			<span class="pillar-label">Text</span>
		</button>

		<button
			class="pillar-btn"
			class:active={activePillar === 'audio'}
			onclick={() => (activePillar = 'audio')}
			title="Sound Effects & Music Presets"
		>
			<span class="pillar-icon">♫</span>
			<span class="pillar-label">Audio</span>
		</button>

		<button
			class="pillar-btn"
			class:active={activePillar === 'effects'}
			onclick={() => (activePillar = 'effects')}
			title="Visual Filters & LUTs"
		>
			<span class="pillar-icon">✨</span>
			<span class="pillar-label">Effects</span>
		</button>

		<button
			class="pillar-btn"
			class:active={activePillar === 'transitions'}
			onclick={() => (activePillar = 'transitions')}
			title="Video Transition Presets"
		>
			<span class="pillar-icon">↔</span>
			<span class="pillar-label">Transitions</span>
		</button>
	</nav>

	<!-- 2. Responsive Category Drawer matching active pillar -->
	<div class="drawer-viewport">
		<!-- Drawer Header -->
		<div class="drawer-header">
			<div class="drawer-header-title-box">
				<span class="drawer-header-icon">
					{#if activePillar === 'media'}▦{:else if activePillar === 'text'}T{:else if activePillar === 'audio'}♫{:else if activePillar === 'effects'}✨{:else}↔{/if}
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
						<span class="search-glass">🔍</span>
						<input
							type="text"
							placeholder="Search media..."
							bind:value={searchQuery}
							aria-label="Search media files"
						/>
						{#if searchQuery}
							<button class="clear-search-btn" onclick={() => (searchQuery = '')} title="Clear search">✕</button>
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
							☰
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
							<span class="empty-icon">📁</span>
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
												✕
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
											✕
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
			<div class="drawer-content-box">
				<div class="drawer-section-intro">
					<span class="intro-headline">Creative Text Presets</span>
					<span class="intro-subtext">Click + Add to insert formatted typography overlay clips</span>
				</div>

				<div class="drawer-scroll-container">
					<div class="presets-vertical-list">
						{#each textPresets as preset (preset.id)}
							<div
								class="preset-card text-preset-card"
								role="button"
								tabindex="0"
								draggable="true"
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') handleAddTextPreset(preset);
								}}
								ondragstart={(e) => {
									e.dataTransfer?.setData('application/x-rayshot-text-preset', JSON.stringify(preset));
									e.dataTransfer?.setData('text/plain', `text:${preset.id}`);
								}}
							>
								<div class="text-preview-box">
									<div class="text-mockup-inner" style="border-left: 3px solid {preset.badgeColor};">
										<span class="mock-main">{preset.previewText}</span>
										{#if preset.previewSub}
											<span class="mock-sub">{preset.previewSub}</span>
										{/if}
									</div>
									<span class="preset-tag" style="background: {preset.badgeColor}22; color: {preset.badgeColor}; border: 1px solid {preset.badgeColor}44;">
										{preset.category}
									</span>
								</div>

								<div class="preset-details-row">
									<div class="preset-info-text">
										<span class="preset-name">{preset.name}</span>
										<span class="preset-desc">{preset.description}</span>
									</div>
									<button
										class="preset-add-btn"
										onclick={() => handleAddTextPreset(preset)}
										title="Add to timeline"
									>
										+ Add
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

		<!-- DRAWER CONTENT 3: AUDIO & MUSIC DRAWER -->
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

		<!-- DRAWER CONTENT 4: EFFECTS & FILTERS DRAWER -->
		{:else if activePillar === 'effects'}
			<div class="drawer-content-box">
				<div class="drawer-section-intro">
					<span class="intro-headline">Visual Effects & LUTs</span>
					<span class="intro-subtext">Select a timeline clip then click Apply to grade footage</span>
				</div>

				<div class="drawer-scroll-container">
					<div class="presets-vertical-list">
						{#each effectPresets as preset (preset.id)}
							<div class="preset-card effect-preset-card">
								<div class="effect-banner" style="background: {preset.gradient};">
									<div class="effect-swatch" style="filter: {preset.cssFilter};">
										<span class="swatch-text">LUT</span>
									</div>
									<span class="effect-tag">{preset.tag}</span>
								</div>

								<div class="preset-details-row">
									<div class="preset-info-text">
										<span class="preset-name">{preset.name}</span>
										<span class="preset-desc">{preset.description}</span>
									</div>
									<button
										class="preset-apply-btn"
										onclick={() => handleApplyEffect(preset)}
										title="Apply effect to selected timeline clip"
									>
										Apply
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

		<!-- DRAWER CONTENT 5: TRANSITIONS DRAWER -->
		{:else if activePillar === 'transitions'}
			<div class="drawer-content-box">
				<div class="drawer-section-intro">
					<span class="intro-headline">Video Transitions</span>
					<span class="intro-subtext">Apply dynamic cuts and dissolves between scene clips</span>
				</div>

				<div class="drawer-scroll-container">
					<div class="presets-vertical-list">
						{#each transitionPresets as preset (preset.id)}
							<div class="preset-card transition-preset-card">
								<div class="transition-preview-box">
									<div class="transition-anim-stage {preset.animationClass}">
										<div class="stage-block block-a">A</div>
										<div class="stage-block block-b">B</div>
									</div>
									<span class="trans-dur font-mono">{preset.duration.toFixed(1)}s</span>
								</div>

								<div class="preset-details-row">
									<div class="preset-info-text">
										<span class="preset-name">{preset.name}</span>
										<span class="preset-desc">{preset.description}</span>
									</div>
									<button
										class="preset-apply-btn"
										onclick={() => handleApplyTransition(preset)}
										title="Apply transition to selected clip"
									>
										Apply
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
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
	.mediabin-shell {
		display: flex;
		height: 100%;
		width: 100%;
		background: #121319;
		border-right: 1px solid #232738;
		user-select: none;
		overflow: hidden;
		box-sizing: border-box;
		position: relative;
	}

	.mediabin-shell.drag-active {
		outline: 2px dashed #38bdf8;
		outline-offset: -3px;
		background: #161824;
	}

	/* =========================================================================
	   1. Vertical 5-Pillar Navigation Bar
	   ========================================================================= */
	.pillar-nav-bar {
		width: 62px;
		background: #090a0d;
		border-right: 1px solid #232738;
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
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.16s ease;
		padding: 0;
	}

	.pillar-btn:hover {
		background: #1a1d28;
		color: #f1f5f9;
		border-color: #232738;
	}

	.pillar-btn.active {
		background: rgba(56, 189, 248, 0.12);
		border-color: rgba(56, 189, 248, 0.4);
		color: #38bdf8;
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
		background: #121319;
		overflow: hidden;
		position: relative;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: #1a1d28;
		border-bottom: 1px solid #232738;
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
		color: #38bdf8;
	}

	.drawer-header-title {
		font-size: 0.78rem;
		font-weight: 700;
		color: #f1f5f9;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.header-action-btn {
		background: #232738;
		border: 1px solid #33384c;
		color: #38bdf8;
		font-size: 0.68rem;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.header-action-btn:hover {
		background: #38bdf8;
		color: #090a0d;
		border-color: #38bdf8;
	}

	.drawer-toast {
		position: absolute;
		top: 42px;
		left: 12px;
		right: 12px;
		z-index: 100;
		background: #161822;
		border: 1px solid #38bdf8;
		color: #f1f5f9;
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
		border-bottom: 1px solid #1c1f2e;
		background: #14151e;
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.intro-headline {
		font-size: 0.72rem;
		font-weight: 700;
		color: #e2e8f0;
	}

	.intro-subtext {
		font-size: 0.62rem;
		color: #94a3b8;
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
		background: #14151e;
		border-bottom: 1px solid #1c1f2e;
		gap: 6px;
		flex-shrink: 0;
	}

	.search-input-wrapper {
		display: flex;
		align-items: center;
		background: #090a0d;
		border: 1px solid #232738;
		border-radius: 4px;
		padding: 2px 6px;
		flex: 1;
		min-width: 0;
	}

	.search-glass {
		font-size: 0.65rem;
		color: #64748b;
		margin-right: 4px;
	}

	.search-input-wrapper input {
		background: transparent;
		border: none;
		outline: none;
		color: #f1f5f9;
		font-size: 0.68rem;
		width: 100%;
	}

	.clear-search-btn {
		background: transparent;
		border: none;
		color: #64748b;
		font-size: 0.6rem;
		cursor: pointer;
		padding: 0 2px;
	}

	.clear-search-btn:hover {
		color: #f87171;
	}

	.view-mode-toggle {
		display: flex;
		gap: 2px;
	}

	.mode-btn {
		background: transparent;
		border: 1px solid transparent;
		color: #64748b;
		font-size: 0.75rem;
		padding: 2px 4px;
		border-radius: 3px;
		cursor: pointer;
	}

	.mode-btn:hover {
		color: #94a3b8;
	}

	.mode-btn.active {
		color: #38bdf8;
		background: #1c1f2e;
		border-color: #232738;
	}

	.filter-chips-row {
		display: flex;
		gap: 4px;
		padding: 6px 10px;
		background: #121319;
		border-bottom: 1px solid #1c1f2e;
		flex-shrink: 0;
	}

	.chip-btn {
		background: #161822;
		border: 1px solid #232738;
		color: #94a3b8;
		font-size: 0.62rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.chip-btn:hover {
		color: #f1f5f9;
		border-color: #33384c;
	}

	.chip-btn.active {
		background: #38bdf8;
		color: #090a0d;
		border-color: #38bdf8;
	}

	/* Empty State Dropzone */
	.empty-media-dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 36px 14px;
		border: 1.5px dashed #232738;
		border-radius: 8px;
		cursor: pointer;
		background: #0d0e14;
		text-align: center;
		gap: 6px;
		transition: all 0.15s ease;
	}

	.empty-media-dropzone:hover {
		border-color: #38bdf8;
		background: #141622;
	}

	.empty-icon {
		font-size: 1.8rem;
		margin-bottom: 2px;
	}

	.empty-title {
		font-size: 0.76rem;
		font-weight: 700;
		color: #e2e8f0;
	}

	.empty-desc {
		font-size: 0.64rem;
		color: #64748b;
		max-width: 180px;
	}

	.empty-import-cta {
		margin-top: 6px;
		background: #232738;
		border: 1px solid #33384c;
		color: #38bdf8;
		font-size: 0.68rem;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.empty-import-cta:hover {
		background: #38bdf8;
		color: #090a0d;
		border-color: #38bdf8;
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
		background: #161822;
		border: 1px solid #232738;
		border-radius: 6px;
		overflow: hidden;
		cursor: grab;
		transition: all 0.15s ease;
	}

	.asset-card:hover {
		border-color: #38bdf8;
		transform: translateY(-1px);
	}

	.asset-card.selected {
		border-color: #38bdf8;
		box-shadow: 0 0 0 1px #38bdf8;
	}

	.asset-thumb-box {
		position: relative;
		width: 100%;
		height: 56px;
		background: #090a0d;
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
		color: #fff;
	}

	.type-badge.video {
		background: #2563eb;
	}

	.type-badge.audio {
		background: #059669;
	}

	.type-badge.image {
		background: #d97706;
	}

	.dur-badge {
		position: absolute;
		bottom: 3px;
		right: 3px;
		font-size: 0.52rem;
		background: rgba(0, 0, 0, 0.85);
		color: #f1f5f9;
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
		background: #38bdf8;
		color: #090a0d;
	}

	.quick-add-btn:hover {
		background: #0ea5e9;
		color: #fff;
	}

	.quick-del-btn {
		background: #ef4444;
		color: #fff;
	}

	.quick-del-btn:hover {
		background: #dc2626;
	}

	.asset-meta {
		padding: 4px 6px;
	}

	.asset-name {
		font-size: 0.64rem;
		font-weight: 500;
		color: #cbd5e1;
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
		background: #161822;
		border: 1px solid #232738;
		border-radius: 5px;
		padding: 4px 6px;
		cursor: grab;
		transition: all 0.12s ease;
	}

	.list-item-row:hover {
		border-color: #38bdf8;
		background: #1c1f2e;
	}

	.list-item-row.selected {
		border-color: #38bdf8;
	}

	.list-thumb {
		width: 38px;
		height: 26px;
		background: #090a0d;
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
		color: #e2e8f0;
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
		color: #fff;
	}

	.type-badge-mini.video {
		background: #2563eb;
	}

	.type-badge-mini.audio {
		background: #059669;
	}

	.type-badge-mini.image {
		background: #d97706;
	}

	.dur-text {
		font-size: 0.54rem;
		color: #94a3b8;
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
		background: #232738;
		color: #38bdf8;
	}

	.list-add-btn:hover {
		background: #38bdf8;
		color: #090a0d;
	}

	.list-del-btn {
		background: transparent;
		color: #64748b;
	}

	.list-del-btn:hover {
		background: #ef4444;
		color: #fff;
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
		background: #161822;
		border: 1px solid #232738;
		border-radius: 6px;
		overflow: hidden;
		transition: all 0.15s ease;
		display: flex;
		flex-direction: column;
	}

	.preset-card:hover {
		border-color: #38bdf8;
	}

	.preset-details-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		background: #13151f;
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
		color: #f1f5f9;
	}

	.preset-desc {
		font-size: 0.58rem;
		color: #94a3b8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.preset-add-btn,
	.preset-apply-btn {
		background: #232738;
		border: 1px solid #33384c;
		color: #38bdf8;
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
		background: #38bdf8;
		color: #090a0d;
		border-color: #38bdf8;
	}

	/* Text Presets Styling */
	.text-preview-box {
		position: relative;
		height: 48px;
		background: #090a0d;
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
		color: #ffffff;
		letter-spacing: 0.02em;
	}

	.mock-sub {
		font-size: 0.52rem;
		color: #94a3b8;
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
		background: #232738;
		border: 1px solid #33384c;
		color: #38bdf8;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.15s ease;
	}

	.audio-preview-toggle-btn:hover {
		background: #38bdf8;
		color: #090a0d;
	}

	.audio-preview-toggle-btn.playing {
		background: #ef4444;
		border-color: #ef4444;
		color: #ffffff;
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
		background: #1e3a8a;
		color: #93c5fd;
	}

	.audio-type-pill.sfx {
		background: #831843;
		color: #fbcfe8;
	}

	.audio-type-pill.ambient {
		background: #064e3b;
		color: #a7f3d0;
	}

	.audio-card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 4px;
		border-top: 1px solid #1c1f2e;
	}

	.audio-duration {
		font-size: 0.58rem;
		color: #94a3b8;
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
		color: #ffffff;
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
		color: #e2e8f0;
		text-transform: uppercase;
	}

	/* Transitions Styling & Animations */
	.transition-preview-box {
		position: relative;
		height: 48px;
		background: #090a0d;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.transition-anim-stage {
		position: relative;
		width: 100px;
		height: 32px;
		background: #1a1d28;
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
		color: #fff;
		position: absolute;
		top: 0;
		left: 0;
	}

	.block-a {
		background: #2563eb;
	}

	.block-b {
		background: #059669;
	}

	.trans-dur {
		position: absolute;
		bottom: 3px;
		right: 6px;
		font-size: 0.52rem;
		color: #94a3b8;
		background: rgba(0, 0, 0, 0.7);
		padding: 0 3px;
		border-radius: 2px;
	}

	/* Transition Keyframe Animations */
	.anim-dissolve .block-b {
		animation: dissolveAnim 2s infinite ease-in-out;
	}
	@keyframes dissolveAnim {
		0%, 30% { opacity: 0; }
		60%, 90% { opacity: 1; }
		100% { opacity: 0; }
	}

	.anim-fade-black .block-b {
		animation: fadeBlackAnim 2s infinite ease-in-out;
	}
	@keyframes fadeBlackAnim {
		0%, 25% { opacity: 0; }
		40%, 55% { opacity: 0; filter: brightness(0); }
		75%, 90% { opacity: 1; }
		100% { opacity: 0; }
	}

	.anim-slide-left .block-b {
		animation: slideLeftAnim 2s infinite ease-in-out;
	}
	@keyframes slideLeftAnim {
		0%, 30% { transform: translateX(100%); }
		60%, 90% { transform: translateX(0); }
		100% { transform: translateX(100%); }
	}

	.anim-wipe-right .block-b {
		animation: wipeRightAnim 2s infinite ease-in-out;
	}
	@keyframes wipeRightAnim {
		0%, 30% { clip-path: inset(0 100% 0 0); }
		60%, 90% { clip-path: inset(0 0 0 0); }
		100% { clip-path: inset(0 100% 0 0); }
	}

	.anim-zoom-dissolve .block-b {
		animation: zoomDissolveAnim 2s infinite ease-in-out;
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
