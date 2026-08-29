/**
 * Audio Engine — Web Audio API mixing graph
 *
 * Architecture:
 *   MediaElementSource(clip) → GainNode(clipGain) → StereoPannerNode → masterGain → DynamicsCompressor → AudioContext.destination
 *
 * Singleton. Integrates with playbackStore for mute/volume/playback.
 */

import { get } from 'svelte/store';
import { playbackStore } from '$lib/stores/playback.svelte';

export interface ClipAudioNode {
	source: MediaElementAudioSourceNode;
	gain: GainNode;
	panner: StereoPannerNode;
	element: HTMLMediaElement;
}

class AudioEngine {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private compressor: DynamicsCompressorNode | null = null;
	private clipNodes = new Map<string, ClipAudioNode>();

	// ── Initialize AudioContext on first user gesture ────────────────────────
	init(): AudioContext | null {
		if (typeof window === 'undefined') return null;
		if (this.ctx && this.ctx.state !== 'closed') {
			// Resume suspended context (browser autoplay policy)
			if (this.ctx.state === 'suspended') {
				this.ctx.resume().catch(() => {});
			}
			return this.ctx;
		}

		try {
			this.ctx = new AudioContext();
			this.masterGain = this.ctx.createGain();
			this.compressor = this.ctx.createDynamicsCompressor();

			// Gentle mastering compressor
			this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
			this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
			this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
			this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
			this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

			// Graph: masterGain → compressor → output
			this.masterGain.connect(this.compressor);
			this.compressor.connect(this.ctx.destination);

			// Sync initial store state
			const state = get(playbackStore);
			this.setMasterVolume(state.masterVolume);
			this.setMuted(state.isMuted);

			return this.ctx;
		} catch {
			return null;
		}
	}

	// ── Register a <video> or <audio> element for a clip ─────────────────────
	registerClip(clipId: string, element: HTMLMediaElement, volume = 1.0, pan = 0): void {
		if (!this.ctx || !this.masterGain) return;
		if (this.clipNodes.has(clipId)) return; // Already registered

		try {
			const source = this.ctx.createMediaElementSource(element);
			const gain = this.ctx.createGain();
			const panner = this.ctx.createStereoPanner();

			gain.gain.setValueAtTime(Math.max(0, Math.min(2, volume)), this.ctx.currentTime);
			panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);

			// Chain: source → gain → panner → masterGain
			source.connect(gain);
			gain.connect(panner);
			panner.connect(this.masterGain);

			this.clipNodes.set(clipId, { source, gain, panner, element });
		} catch {
			// Element may already be connected to another context — ignore
		}
	}

	// ── Update clip volume reactively (called by SetClipVolumeCommand) ────────
	setClipVolume(clipId: string, volume: number): void {
		if (!this.ctx) return;
		const node = this.clipNodes.get(clipId);
		if (node) {
			node.gain.gain.setTargetAtTime(
				Math.max(0, Math.min(2, volume)),
				this.ctx.currentTime,
				0.01 // 10ms smooth ramp
			);
		}
	}

	// ── Update clip pan ───────────────────────────────────────────────────────
	setClipPan(clipId: string, pan: number): void {
		if (!this.ctx) return;
		const node = this.clipNodes.get(clipId);
		if (node) {
			node.panner.pan.setTargetAtTime(
				Math.max(-1, Math.min(1, pan)),
				this.ctx.currentTime,
				0.01
			);
		}
	}

	// ── Master volume (0–1) ───────────────────────────────────────────────────
	setMasterVolume(volume: number): void {
		if (!this.ctx || !this.masterGain) return;
		this.masterGain.gain.setTargetAtTime(
			Math.max(0, Math.min(1, volume)),
			this.ctx.currentTime,
			0.02
		);
	}

	// ── Mute/unmute all output ─────────────────────────────────────────────────
	setMuted(muted: boolean): void {
		if (!this.ctx || !this.masterGain) return;
		const targetGain = muted ? 0 : get(playbackStore).masterVolume;
		this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.02);
	}

	// ── Unregister a clip (when removed from timeline) ────────────────────────
	unregisterClip(clipId: string): void {
		const node = this.clipNodes.get(clipId);
		if (node) {
			try {
				node.gain.disconnect();
				node.panner.disconnect();
				node.source.disconnect();
			} catch {
				// Ignore
			}
			this.clipNodes.delete(clipId);
		}
	}

	// ── Suspend context when not playing (saves battery) ─────────────────────
	suspend(): void {
		this.ctx?.suspend().catch(() => {});
	}

	resume(): void {
		if (this.ctx?.state === 'suspended') {
			this.ctx.resume().catch(() => {});
		}
	}

	get isInitialized(): boolean {
		return this.ctx !== null && this.ctx.state !== 'closed';
	}
}

// Singleton — one AudioContext per page
export const audioEngine = new AudioEngine();
