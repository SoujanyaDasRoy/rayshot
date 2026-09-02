import { describe, test, expect } from 'vitest';
import {
	audioChainSpec,
	connectAudioChain,
	PRESENCE_HZ,
	DE_ESSER_Q,
	MAX_DECAY_SEC
} from '../audioChain';

describe('audioChainSpec', () => {
	test('a clip with no effects needs no nodes', () => {
		expect(audioChainSpec([], {})).toEqual([]);
	});

	test('ignores effect ids it does not know, and video effects', () => {
		expect(audioChainSpec(['not-a-real-effect', 'lens-blur'], {})).toEqual([]);
	});

	test('Voice Clarity cuts lows and lifts presence', () => {
		expect(audioChainSpec(['voice-clarity'], {})).toEqual([
			{ kind: 'biquad', type: 'highpass', frequency: 90, Q: 0.7 },
			{ kind: 'biquad', type: 'peaking', frequency: PRESENCE_HZ, gain: 3, Q: 1 }
		]);
	});

	test("takes the clip's own parameter values over the preset defaults", () => {
		const chain = audioChainSpec(['voice-clarity'], { highPassHz: 200, presenceDb: 6 });
		expect(chain[0]).toMatchObject({ frequency: 200 });
		expect(chain[1]).toMatchObject({ gain: 6 });
	});

	test('De-esser cuts, never boosts, however the slider is set', () => {
		// reductionDb is negative by convention; a positive value here would turn
		// a de-esser into an ess-emphasiser.
		const chain = audioChainSpec(['de-esser'], { reductionDb: 5 });
		expect(chain[0]).toMatchObject({ type: 'peaking', gain: -5, Q: DE_ESSER_Q });
	});

	test('Room becomes a reverb with a normalised mix', () => {
		expect(audioChainSpec(['room'], { mix: 40, decaySec: 1.2 })).toEqual([
			{ kind: 'reverb', mix: 0.4, decaySec: 1.2 }
		]);
	});

	test('clamps a mix that would drown the dry signal', () => {
		expect(audioChainSpec(['room'], { mix: 400 })[0]).toMatchObject({ mix: 1 });
	});

	test('keeps a reverb tail short enough to build', () => {
		const node = audioChainSpec(['room'], { decaySec: 99 })[0] as { decaySec: number };
		expect(node.decaySec).toBeLessThanOrEqual(MAX_DECAY_SEC);
	});

	test('chains several effects in the order they were applied', () => {
		const chain = audioChainSpec(['warmth', 'de-esser'], {});
		expect(chain.map((n) => (n.kind === 'biquad' ? n.type : n.kind))).toEqual([
			'lowshelf',
			'peaking'
		]);
	});
});

// ── The graph, not just the description ─────────────────────────────────────
// A spec that is correct and never connected sounds exactly like no effect at
// all, which is the bug this whole module exists to fix.

interface FakeNode {
	type?: string;
	frequency?: { value: number };
	gain?: { value: number };
	Q?: { value: number };
	buffer?: unknown;
	connect: (target: FakeNode) => void;
	disconnect: () => void;
	__kind: string;
	__connectedTo: FakeNode[];
}

function fakeNode(kind: string): FakeNode {
	const node: FakeNode = {
		__kind: kind,
		__connectedTo: [],
		connect(target) {
			node.__connectedTo.push(target);
		},
		disconnect() {
			node.__connectedTo.length = 0;
		}
	};
	return node;
}

function fakeCtx() {
	const created: FakeNode[] = [];
	const make = (kind: string, extra: Partial<FakeNode> = {}) => {
		const node = Object.assign(fakeNode(kind), extra);
		created.push(node);
		return node;
	};
	return {
		created,
		sampleRate: 48000,
		createBiquadFilter: () =>
			make('biquad', { frequency: { value: 0 }, gain: { value: 0 }, Q: { value: 0 } }),
		createGain: () => make('gain', { gain: { value: 1 } }),
		createConvolver: () => make('convolver'),
		createBuffer: (channels: number, length: number) => ({
			getChannelData: () => new Float32Array(length),
			numberOfChannels: channels
		})
	};
}

describe('connectAudioChain', () => {
	test('an empty chain still joins input to output', () => {
		const ctx = fakeCtx();
		const input = fakeNode('input');
		const output = fakeNode('output');

		const built = connectAudioChain(ctx as never, input as never, output as never, []);

		expect(built).toEqual([]);
		expect(input.__connectedTo).toContain(output);
	});

	test('biquads are configured and wired in series', () => {
		const ctx = fakeCtx();
		const input = fakeNode('input');
		const output = fakeNode('output');

		connectAudioChain(
			ctx as never,
			input as never,
			output as never,
			audioChainSpec(['voice-clarity'], {})
		);

		const filters = ctx.created.filter((n) => n.__kind === 'biquad');
		expect(filters).toHaveLength(2);
		expect(filters[0].type).toBe('highpass');
		expect(filters[0].frequency!.value).toBe(90);
		// input → highpass → peaking → output
		expect(input.__connectedTo).toContain(filters[0]);
		expect(filters[0].__connectedTo).toContain(filters[1]);
		expect(filters[1].__connectedTo).toContain(output);
	});

	test('reverb keeps the dry signal alongside the wet one', () => {
		// A convolver on its own replaces the sound with its reflections. The
		// wet/dry split is the difference between "in a room" and "underwater".
		const ctx = fakeCtx();
		const input = fakeNode('input');
		const output = fakeNode('output');

		connectAudioChain(
			ctx as never,
			input as never,
			output as never,
			audioChainSpec(['room'], { mix: 25 })
		);

		const convolver = ctx.created.find((n) => n.__kind === 'convolver')!;
		const gains = ctx.created.filter((n) => n.__kind === 'gain');
		expect(convolver.buffer).toBeTruthy();
		expect(input.__connectedTo).toContain(convolver);
		expect(gains.map((g) => g.gain!.value)).toContain(0.75);
		expect(gains.map((g) => g.gain!.value)).toContain(0.25);
	});
});
