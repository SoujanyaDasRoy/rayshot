// @ts-nocheck
import { describe, test, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ project: null }));
vi.mock('$lib/stores/project.svelte', () => ({
	projectStore: {
		subscribe: (fn) => { fn(state.project); return () => {}; },
		set: (v) => { state.project = v; },
		update: (fn) => { state.project = fn(state.project); }
	}
}));
vi.mock('$lib/core/persistence/opfsAdapter', () => ({ opfsAutoSave: vi.fn() }));
vi.mock('svelte/store', async () => {
	const actual = await vi.importActual('svelte/store');
	return { ...actual, get: () => state.project };
});

import { SetColorGradeCommand } from '../setColorGrade';
import { commandProcessor } from '../processor';

function makeProject() {
	const clip = { id: 'c1', colorGrade: { saturation: 0, contrast: 0 } };
	return { id: 'p', clips: new Map([['c1', clip]]), modifiedAt: 0 };
}

describe('SetColorGradeCommand merging', () => {
	test('a run of saturation changes collapses to one undo step', () => {
		state.project = makeProject();
		while (commandProcessor.canUndo()) commandProcessor.undo();

		for (const v of [-10, -30, -50, -90]) {
			commandProcessor.execute(
				new SetColorGradeCommand({ clipId: 'c1', propertyName: 'saturation', value: v })
			);
		}
		expect(state.project.clips.get('c1').colorGrade.saturation).toBe(-90);

		commandProcessor.undo();
		expect(state.project.clips.get('c1').colorGrade.saturation).toBe(0);
		expect(commandProcessor.canUndo()).toBe(false);
	});
});
