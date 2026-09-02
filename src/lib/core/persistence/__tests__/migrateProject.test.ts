import { describe, test, expect } from 'vitest';
import { migrateProject, CURRENT_PROJECT_VERSION } from '../migrateProject';
import { clipRate } from '../../../utils/clipTiming';

function v1Raw(overrides: Record<string, unknown> = {}) {
	return {
		id: 'p1',
		name: 'Old Project',
		version: 1,
		createdAt: 1,
		modifiedAt: 2,
		assets: {},
		clips: {},
		sequences: [],
		activeSequenceId: null,
		settings: { backgroundColor: '#000000' },
		...overrides
	};
}

describe('migrateProject', () => {
	test('refuses a file newer than this build understands', () => {
		expect(migrateProject(v1Raw({ version: 99 }))).toBeNull();
	});

	test('rejects junk rather than producing a half-built project', () => {
		expect(migrateProject(null)).toBeNull();
		expect(migrateProject('not a project')).toBeNull();
		expect(migrateProject({ nope: true })).toBeNull();
	});

	test('rehydrates assets and clips as real Maps', () => {
		const p = migrateProject(
			v1Raw({
				assets: { a1: { id: 'a1', filename: 'x.mp4', type: 'video', duration: 5 } },
				clips: {}
			})
		);

		expect(p!.assets).toBeInstanceOf(Map);
		expect(p!.clips).toBeInstanceOf(Map);
		expect(p!.assets.get('a1')!.filename).toBe('x.mp4');
	});

	test('stamps the current version on a migrated v1 project', () => {
		expect(migrateProject(v1Raw())!.version).toBe(CURRENT_PROJECT_VERSION);
	});

	test('backfills colorGrade on clips that predate it', () => {
		// W5 makes the canvas dereference clip.colorGrade — a v1 clip without it
		// would crash the renderer on the first restore.
		const p = migrateProject(
			v1Raw({ clips: { c1: { id: 'c1', mediaAssetId: 'a1', timelineStart: 0 } } })
		);
		const clip = p!.clips.get('c1')!;

		expect(clip.colorGrade).toBeDefined();
		expect(clip.colorGrade.contrast).toBe(0);
		expect(clip.colorGrade.saturation).toBe(0);
	});

	test('backfills transform and audioParameters on legacy clips', () => {
		const p = migrateProject(
			v1Raw({ clips: { c1: { id: 'c1', mediaAssetId: 'a1', timelineStart: 0 } } })
		);
		const clip = p!.clips.get('c1')!;

		expect(clip.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
		expect(clip.audioParameters).toEqual({ volume: 1, mute: false });
	});

	test('coerces a legacy array-shaped curves into the {r,g,b,lum} shape', () => {
		const p = migrateProject(
			v1Raw({
				clips: {
					c1: {
						id: 'c1',
						mediaAssetId: 'a1',
						colorGrade: { contrast: 20, curves: [[0, 0], [1, 1]] }
					}
				}
			})
		);
		const curves = p!.clips.get('c1')!.colorGrade.curves;

		expect(Array.isArray(curves)).toBe(false);
		expect(curves.lum).toBeDefined();
		expect(curves.r).toBeDefined();
	});

	test('preserves values a legacy clip already set', () => {
		const p = migrateProject(
			v1Raw({
				clips: { c1: { id: 'c1', mediaAssetId: 'a1', colorGrade: { contrast: 42 } } }
			})
		);
		expect(p!.clips.get('c1')!.colorGrade.contrast).toBe(42);
	});

	test('folds a stored playbackRate into the clip length, and drops the field', () => {
		// v2 stored speed twice: as this field, and implicitly as the ratio of
		// source span to timeline length. Only the ratio was ever rendered from,
		// so a 2x clip stuttered rather than playing fast. The migration makes
		// the clip say what it was always trying to.
		const p = migrateProject(
			v1Raw({
				clips: {
					c1: {
						id: 'c1',
						mediaAssetId: 'a1',
						sourceIn: 0,
						sourceOut: 10,
						timelineStart: 0,
						timelineDuration: 10,
						playbackRate: 2
					}
				}
			})
		);
		const clip = p!.clips.get('c1')!;

		expect(clip.timelineDuration).toBe(5);
		expect(clipRate(clip)).toBe(2);
		// The field must not survive the spread, or it becomes the stale second
		// number all over again.
		expect('playbackRate' in clip).toBe(false);
	});

	test("leaves a 1x clip's length exactly as it found it", () => {
		const p = migrateProject(
			v1Raw({
				clips: {
					c1: {
						id: 'c1',
						mediaAssetId: 'a1',
						sourceIn: 2,
						sourceOut: 9,
						timelineStart: 4,
						timelineDuration: 7,
						playbackRate: 1
					}
				}
			})
		);
		expect(p!.clips.get('c1')!.timelineDuration).toBe(7);
	});

	test('drops the phantom filters.curves that never had a writer', () => {
		const p = migrateProject(
			v1Raw({
				clips: { c1: { id: 'c1', mediaAssetId: 'a1', filters: { curves: [[0, 0]], opacity: 50 } } }
			})
		);
		const filters = p!.clips.get('c1')!.filters;

		expect(filters.curves).toBeUndefined();
		expect(filters.opacity).toBe(50);
	});

	test('a current-version project round-trips without being mangled', () => {
		const current = v1Raw({ version: CURRENT_PROJECT_VERSION, name: 'Already Current' });
		const p = migrateProject(current);

		expect(p!.version).toBe(CURRENT_PROJECT_VERSION);
		expect(p!.name).toBe('Already Current');
	});
});
