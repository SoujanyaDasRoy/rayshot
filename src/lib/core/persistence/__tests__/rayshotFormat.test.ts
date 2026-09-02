import { describe, test, expect } from 'vitest';
import {
	RAYSHOT_FORMAT_VERSION,
	buildManifest,
	readManifest,
	mediaPathFor,
	projectToDocument,
	documentToProject
} from '../rayshotFormat';
import type { Project } from '$lib/types/project';

function project(): Project {
	return {
		id: 'p1',
		name: 'My Film',
		version: 2,
		createdAt: 1,
		modifiedAt: 2,
		assets: new Map([
			['a1', { id: 'a1', filename: 'clip.mp4', type: 'video', duration: 3, createdAt: 1, modifiedAt: 1, mimeType: 'video/mp4', sourceBlob: new Blob(['x']) }]
		]),
		clips: new Map([['c1', { id: 'c1', mediaAssetId: 'a1', timelineStart: 0 }]]),
		sequences: [],
		activeSequenceId: null,
		settings: { backgroundColor: '#000000' }
	} as unknown as Project;
}

describe('manifest', () => {
	test('records the format version, so a future build can refuse an old file', () => {
		expect(buildManifest(project()).formatVersion).toBe(RAYSHOT_FORMAT_VERSION);
	});

	test('lists every asset with the path its bytes live at', () => {
		const m = buildManifest(project());
		expect(m.media).toHaveLength(1);
		expect(m.media[0]).toMatchObject({ id: 'a1', path: mediaPathFor('a1', 'clip.mp4') });
	});

	test('media paths are namespaced and keep the extension', () => {
		expect(mediaPathFor('a1', 'clip.mp4')).toBe('media/a1.mp4');
		expect(mediaPathFor('a2', 'no-extension')).toBe('media/a2');
	});

	test('a path cannot escape the bundle even if the filename tries', () => {
		// Filenames come from the user's disk; zip path traversal is a real class.
		expect(mediaPathFor('a3', '../../evil.mp4')).toBe('media/a3.mp4');
		expect(mediaPathFor('../../x', 'clip.mp4')).not.toContain('..');
	});

	test('rejects a manifest from a newer format', () => {
		expect(readManifest({ formatVersion: 999, media: [] })).toBeNull();
	});

	test('rejects junk', () => {
		expect(readManifest(null)).toBeNull();
		expect(readManifest({ nope: 1 })).toBeNull();
	});

	test('accepts a well-formed manifest', () => {
		const m = buildManifest(project());
		expect(readManifest(JSON.parse(JSON.stringify(m)))).not.toBeNull();
	});
});

describe('project document', () => {
	test('strips blobs — the bytes travel as files, not base64', () => {
		const doc = projectToDocument(project()) as { assets: Record<string, { sourceBlob?: unknown }> };
		expect(doc.assets.a1.sourceBlob).toBeUndefined();
	});

	test('turns Maps into plain objects so it survives JSON', () => {
		const doc = projectToDocument(project()) as { assets: unknown; clips: unknown };
		expect(doc.assets).not.toBeInstanceOf(Map);
		expect(JSON.parse(JSON.stringify(doc)).clips.c1.id).toBe('c1');
	});

	test('round-trips back into a real project with Maps', () => {
		const doc = JSON.parse(JSON.stringify(projectToDocument(project())));
		const restored = documentToProject(doc);

		expect(restored).not.toBeNull();
		expect(restored!.assets).toBeInstanceOf(Map);
		expect(restored!.assets.get('a1')!.filename).toBe('clip.mp4');
		expect(restored!.name).toBe('My Film');
	});

	test('a document from a newer project schema is refused, not half-read', () => {
		const doc = JSON.parse(JSON.stringify(projectToDocument(project())));
		doc.version = 9999;
		expect(documentToProject(doc)).toBeNull();
	});
});
