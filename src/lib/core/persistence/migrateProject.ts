import type { Project, Clip } from '$lib/types/project';
import { timelineDurationForRate } from '../../utils/clipTiming';

/**
 * Project schema version gate.
 *
 * `Project.version` was written but never read, which meant a saved project
 * could never be safely evolved. This is the reader. It matters most for the
 * portable `.rayshot` file — once files exist on other people's disks, a
 * version gate cannot be retrofitted.
 *
 * Dependency-free (type-only import) so it stays unit-testable in the node
 * Vitest project.
 */

export const CURRENT_PROJECT_VERSION = 3;

type Curves = Clip['colorGrade']['curves'];

function identityCurve(): [number, number][] {
	return [
		[0, 0],
		[1, 1]
	];
}

function defaultCurves(): Curves {
	return { r: identityCurve(), g: identityCurve(), b: identityCurve(), lum: identityCurve() };
}

const DEFAULT_COLOR_GRADE = {
	exposure: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	temperature: 0,
	tint: 0,
	saturation: 0,
	vibrance: 0,
	vignette: 0,
	grain: 0
};

/**
 * Migrate a parsed project payload to the current schema.
 *
 * Returns `null` for anything unusable: junk, or a file written by a NEWER
 * build than this one. Refusing to open a future file is the whole point —
 * silently half-reading it would corrupt the user's project on next save.
 */
export function migrateProject(raw: unknown): Project | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

	const source = raw as Record<string, unknown>;
	// A project without an id and a name is not a project.
	if (typeof source.id !== 'string' || typeof source.name !== 'string') return null;

	const version = typeof source.version === 'number' ? source.version : 1;
	if (version > CURRENT_PROJECT_VERSION) return null;

	const assets = toMap<Project['assets'] extends Map<string, infer V> ? V : never>(source.assets);
	const clips = new Map<string, Clip>();
	for (const [id, clip] of toMap<Record<string, unknown>>(source.clips)) {
		clips.set(id, migrateClip(clip));
	}

	return {
		...(source as unknown as Project),
		assets,
		clips,
		version: CURRENT_PROJECT_VERSION
	};
}

/**
 * v1 -> v2: backfill fields the renderer now dereferences unconditionally.
 * v2 -> v3: fold a stored playbackRate into the clip's timeline length and drop
 * the field. Speed is derived from the box now, so a stored rate is a second
 * representation of the same fact — which is exactly how it came to disagree.
 */
function migrateClip(raw: Record<string, unknown>): Clip {
	const colorGrade = (raw.colorGrade ?? {}) as Record<string, unknown>;
	const filters = { ...((raw.filters ?? {}) as Record<string, unknown>) };

	// `filters.curves` was read by the canvas but never written by anything —
	// a phantom that only ever shadowed the real colorGrade.curves.
	delete filters.curves;

	// A v2 clip carrying a rate other than 1 was never actually playing at that
	// speed — the seek position came from the box, so it stuttered. Folding the
	// rate into the box is what that clip was always trying to say.
	const storedRate = typeof raw.playbackRate === 'number' ? raw.playbackRate : 1;
	const sourceIn = typeof raw.sourceIn === 'number' ? raw.sourceIn : 0;
	const sourceOut = typeof raw.sourceOut === 'number' ? raw.sourceOut : 0;
	const rawDuration = typeof raw.timelineDuration === 'number' ? raw.timelineDuration : 0;
	const timelineDuration =
		storedRate === 1
			? rawDuration
			: timelineDurationForRate(sourceIn, sourceOut, storedRate);

	const clip = {
		...(raw as unknown as Clip),
		timelineDuration,
		transform: (raw.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }) as Clip['transform'],
		audioParameters: (raw.audioParameters ?? { volume: 1, mute: false }) as Clip['audioParameters'],
		effects: Array.isArray(raw.effects) ? (raw.effects as string[]) : [],
		filters,
		colorGrade: {
			...DEFAULT_COLOR_GRADE,
			...colorGrade,
			curves: normalizeCurves(colorGrade.curves)
		} as Clip['colorGrade']
	} as Clip & { playbackRate?: number };

	// The spread above carries every raw key through, including the one we are
	// retiring. Left in place it would outlive the migration and become the
	// stale second number all over again.
	delete clip.playbackRate;
	return clip;
}

/**
 * Three incompatible curve shapes existed across the codebase. `{r,g,b,lum}`
 * wins because it is the one that gets persisted.
 */
function normalizeCurves(curves: unknown): Curves {
	if (!curves || Array.isArray(curves) || typeof curves !== 'object') {
		return defaultCurves();
	}
	const c = curves as Record<string, unknown>;
	const channel = (key: keyof Curves): [number, number][] =>
		Array.isArray(c[key]) ? (c[key] as [number, number][]) : identityCurve();

	return { r: channel('r'), g: channel('g'), b: channel('b'), lum: channel('lum') };
}

function toMap<T>(value: unknown): Map<string, T> {
	if (value instanceof Map) return value as Map<string, T>;
	if (value && typeof value === 'object') {
		return new Map(Object.entries(value as Record<string, T>));
	}
	return new Map();
}
