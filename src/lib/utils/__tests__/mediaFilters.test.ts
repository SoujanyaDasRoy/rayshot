import { describe, test, expect } from 'vitest';
import { filterMediaFiles, folderNameFromRelativePath, getImportedFolders } from '../mediaFilters';
import type { MediaAsset } from '$lib/types/project';

function fakeFile(name: string, type: string): File {
	return new File(['x'], name, { type });
}

describe('filterMediaFiles', () => {
	test('keeps video, audio, and image files', () => {
		const files = [
			fakeFile('clip.mp4', 'video/mp4'),
			fakeFile('song.mp3', 'audio/mpeg'),
			fakeFile('photo.jpg', 'image/jpeg')
		];
		expect(filterMediaFiles(files)).toEqual(files);
	});

	test('drops files a folder brings along that are not media', () => {
		const files = [
			fakeFile('clip.mp4', 'video/mp4'),
			fakeFile('.DS_Store', ''),
			fakeFile('notes.txt', 'text/plain'),
			fakeFile('project.rayshot', 'application/json')
		];
		expect(filterMediaFiles(files)).toEqual([files[0]]);
	});

	test('returns an empty array when nothing in the folder is media', () => {
		expect(filterMediaFiles([fakeFile('readme.md', 'text/markdown')])).toEqual([]);
	});
});

describe('folderNameFromRelativePath', () => {
	test('takes the first path segment, however deep the real file is', () => {
		expect(folderNameFromRelativePath('BRoll/clip.mp4')).toBe('BRoll');
		expect(folderNameFromRelativePath('BRoll/2024/interviews/clip.mp4')).toBe('BRoll');
	});

	test('returns undefined for a bare filename with no folder segment', () => {
		expect(folderNameFromRelativePath('clip.mp4')).toBeUndefined();
	});
});

describe('getImportedFolders', () => {
	function fakeAsset(id: string, folder?: string): MediaAsset {
		return {
			id,
			filename: id,
			sourceBlob: new Blob(),
			type: 'video',
			duration: 1,
			createdAt: 0,
			modifiedAt: 0,
			folder
		};
	}

	test('groups assets by folder and counts them, sorted by name', () => {
		const assets = [fakeAsset('a', 'Music'), fakeAsset('b', 'BRoll'), fakeAsset('c', 'BRoll')];
		expect(getImportedFolders(assets)).toEqual([
			{ name: 'BRoll', count: 2 },
			{ name: 'Music', count: 1 }
		]);
	});

	test('ignores assets with no folder — individually imported files stay out of the list', () => {
		expect(getImportedFolders([fakeAsset('a', undefined)])).toEqual([]);
	});

	test('returns an empty list when nothing has been imported', () => {
		expect(getImportedFolders([])).toEqual([]);
	});
});
