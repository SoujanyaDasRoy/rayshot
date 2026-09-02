import { describe, test, expect } from 'vitest';
import { mergePersistedBlobs } from '../mergePersistedBlobs';
import type { MediaAsset } from '$lib/types/project';
import type { PersistedAsset } from '../assetCache';

function asset(id: string, overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id,
		filename: `${id}.mp4`,
		type: 'video',
		duration: 5,
		createdAt: 1,
		modifiedAt: 1,
		...overrides
	} as MediaAsset;
}

function persisted(id: string, overrides: Partial<PersistedAsset> = {}): PersistedAsset {
	return {
		id,
		filename: `${id}.mp4`,
		blob: new Blob(['bytes'], { type: 'video/mp4' }),
		type: 'video',
		duration: 5,
		mimeType: 'video/mp4',
		createdAt: 1,
		...overrides
	};
}

describe('mergePersistedBlobs', () => {
	test('attaches a cached blob to an asset that lost one', () => {
		const assets = new Map([['a1', asset('a1')]]);

		const { assets: merged, restored } = mergePersistedBlobs(assets, [persisted('a1')]);

		expect(restored).toBe(1);
		expect(merged.get('a1')!.sourceBlob).toBeInstanceOf(Blob);
	});

	test('never clobbers a blob the project already has', () => {
		const live = new Blob(['live'], { type: 'video/mp4' });
		const assets = new Map([['a1', asset('a1', { sourceBlob: live })]]);

		const { assets: merged, restored } = mergePersistedBlobs(assets, [persisted('a1')]);

		expect(merged.get('a1')!.sourceBlob).toBe(live);
		expect(restored).toBe(0);
	});

	test('merges in place only — a cached asset not in the project is left alone', () => {
		// Other projects' assets share the IDB store; importing them here would
		// silently resurrect media the user removed.
		const assets = new Map([['a1', asset('a1')]]);

		const { assets: merged } = mergePersistedBlobs(assets, [persisted('a1'), persisted('orphan')]);

		expect(merged.size).toBe(1);
		expect(merged.has('orphan')).toBe(false);
	});

	test('backfills metadata the import path never wrote onto the asset', () => {
		const assets = new Map([['a1', asset('a1')]]);

		const { assets: merged } = mergePersistedBlobs(assets, [
			persisted('a1', { mimeType: 'video/webm', width: 1920, height: 1080 })
		]);
		const a = merged.get('a1')!;

		expect(a.mimeType).toBe('video/webm');
		expect(a.width).toBe(1920);
		expect(a.height).toBe(1080);
	});

	test('does not overwrite metadata the project already knows', () => {
		const assets = new Map([['a1', asset('a1', { mimeType: 'video/mp4', width: 640 })]]);

		const { assets: merged } = mergePersistedBlobs(assets, [
			persisted('a1', { mimeType: 'video/webm', width: 1920 })
		]);
		const a = merged.get('a1')!;

		expect(a.mimeType).toBe('video/mp4');
		expect(a.width).toBe(640);
	});

	test('leaves an asset with no cached blob untouched, and reports it', () => {
		const assets = new Map([['a1', asset('a1')], ['a2', asset('a2')]]);

		const { assets: merged, restored, missing } = mergePersistedBlobs(assets, [persisted('a1')]);

		expect(restored).toBe(1);
		expect(missing).toEqual(['a2']);
		expect(merged.get('a2')!.sourceBlob).toBeUndefined();
	});

	test('does not mutate the map it was given', () => {
		const original = new Map([['a1', asset('a1')]]);

		mergePersistedBlobs(original, [persisted('a1')]);

		expect(original.get('a1')!.sourceBlob).toBeUndefined();
	});

	test('an empty cache is a no-op, not a crash', () => {
		const assets = new Map([['a1', asset('a1')]]);

		const { assets: merged, restored, missing } = mergePersistedBlobs(assets, []);

		expect(restored).toBe(0);
		expect(missing).toEqual(['a1']);
		expect(merged.size).toBe(1);
	});
});
