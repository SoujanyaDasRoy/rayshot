/**
 * What the audio effects actually are, as a description of a Web Audio chain.
 *
 * The four voice effects have had names, descriptions, defaults and — since
 * the Inspector work — real sliders, and the audio engine has never had a
 * single filter node. Turning Voice Clarity on changed nothing you could hear.
 *
 * This module is the description; audioEngine builds it. Kept dependency-free
 * (pattern C) so the maths is testable without an AudioContext, and so a
 * missing node type fails a test rather than a listening session.
 */

import { effectById } from './effects/effectRegistry';

/** Where "presence" lives — the band that makes speech read as close. */
export const PRESENCE_HZ = 3000;
/** Narrow enough to catch sibilance without dulling the whole top end. */
export const DE_ESSER_Q = 3;
/** A convolver buffer is generated per second of tail; this caps the cost. */
export const MAX_DECAY_SEC = 5;

export type BiquadKind = 'highpass' | 'lowshelf' | 'peaking';

export interface BiquadSpec {
	kind: 'biquad';
	type: BiquadKind;
	frequency: number;
	gain?: number;
	Q?: number;
}

export interface ReverbSpec {
	kind: 'reverb';
	/** 0..1 wet proportion. */
	mix: number;
	decaySec: number;
}

export type AudioNodeSpec = BiquadSpec | ReverbSpec;

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/**
 * The nodes a clip's audio should pass through, in the order the effects were
 * applied. Unknown ids and video effects contribute nothing.
 */
export function audioChainSpec(
	effectIds: string[],
	params: Record<string, number>
): AudioNodeSpec[] {
	const chain: AudioNodeSpec[] = [];

	for (const id of effectIds) {
		const def = effectById(id);
		if (!def || def.kind !== 'audio') continue;
		const p = { ...def.params, ...params };

		switch (id) {
			case 'voice-clarity':
				chain.push({ kind: 'biquad', type: 'highpass', frequency: p.highPassHz, Q: 0.7 });
				chain.push({
					kind: 'biquad',
					type: 'peaking',
					frequency: PRESENCE_HZ,
					gain: p.presenceDb,
					Q: 1
				});
				break;
			case 'warmth':
				chain.push({
					kind: 'biquad',
					type: 'lowshelf',
					frequency: p.lowShelfHz,
					gain: p.gainDb
				});
				break;
			case 'de-esser':
				// A de-esser cuts. The slider is labelled Reduction and its range is
				// negative, but a stored positive value must not boost sibilance.
				chain.push({
					kind: 'biquad',
					type: 'peaking',
					frequency: p.centerHz,
					gain: -Math.abs(p.reductionDb),
					Q: DE_ESSER_Q
				});
				break;
			case 'room':
				chain.push({
					kind: 'reverb',
					mix: clamp(p.mix / 100, 0, 1),
					decaySec: clamp(p.decaySec, 0.05, MAX_DECAY_SEC)
				});
				break;
		}
	}

	return chain;
}

/** Cheap identity for a chain, so the engine only rebuilds when it changes. */
export function audioChainKey(chain: AudioNodeSpec[]): string {
	return JSON.stringify(chain);
}

/**
 * Build a chain between two nodes and return what was created, so the caller
 * can tear it down again.
 *
 * Lives here rather than in the engine because the export path needs the same
 * graph: an effect you can hear in the preview and not in the file is the same
 * class of bug as one you cannot hear at all.
 */
export function connectAudioChain(
	ctx: BaseAudioContext,
	input: AudioNode,
	output: AudioNode,
	chain: AudioNodeSpec[]
): AudioNode[] {
	const built: AudioNode[] = [];
	let head: AudioNode = input;

	for (const spec of chain) {
		if (spec.kind === 'biquad') {
			const filter = ctx.createBiquadFilter();
			filter.type = spec.type;
			filter.frequency.value = spec.frequency;
			if (spec.gain !== undefined) filter.gain.value = spec.gain;
			if (spec.Q !== undefined) filter.Q.value = spec.Q;
			head.connect(filter);
			head = filter;
			built.push(filter);
		} else {
			// Dry and wet in parallel, summed: a convolver alone would replace the
			// signal with its own reflections rather than adding a room to it.
			const convolver = ctx.createConvolver();
			convolver.buffer = impulseResponse(ctx, spec.decaySec);
			const dry = ctx.createGain();
			dry.gain.value = 1 - spec.mix;
			const wet = ctx.createGain();
			wet.gain.value = spec.mix;
			const sum = ctx.createGain();

			head.connect(dry);
			dry.connect(sum);
			head.connect(convolver);
			convolver.connect(wet);
			wet.connect(sum);
			head = sum;
			built.push(convolver, dry, wet, sum);
		}
	}

	head.connect(output);
	return built;
}

/** Exponentially decaying noise — a plausible small room, generated not shipped. */
function impulseResponse(ctx: BaseAudioContext, decaySec: number): AudioBuffer {
	const length = Math.max(1, Math.floor(ctx.sampleRate * decaySec));
	const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
	for (let channel = 0; channel < 2; channel++) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < length; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
		}
	}
	return buffer;
}
