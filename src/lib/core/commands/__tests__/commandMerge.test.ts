// @ts-nocheck
import { describe, test, expect, vi, beforeEach } from 'vitest';

// The processor pulls in the project store transitively; the node Vitest
// project cannot resolve bare $lib specifiers, so stub it (pattern B).
const mocks = vi.hoisted(() => ({
	projectStore: { subscribe: vi.fn(() => () => {}), set: vi.fn(), update: vi.fn() }
}));
vi.mock('$lib/stores/project.svelte', () => ({ projectStore: mocks.projectStore }));
vi.mock('$lib/core/persistence/opfsAdapter', () => ({ opfsAutoSave: vi.fn() }));

import { Command } from '../base';
import { commandProcessor } from '../processor';

/** Absorbs a follow-up carrying the same tag, like a slider drag does. */
class TaggedCommand extends Command {
	public value: number;
	constructor(
		public tag: string,
		value: number,
		public log: string[]
	) {
		super();
		this.value = value;
	}
	execute() {
		this.log.push(`exec:${this.tag}:${this.value}`);
	}
	undo() {
		this.log.push(`undo:${this.tag}`);
	}
	mergeWith(next: Command): boolean {
		if (!(next instanceof TaggedCommand) || next.tag !== this.tag) return false;
		this.value = next.value;
		return true;
	}
}

class PlainCommand extends Command {
	constructor(public log: string[]) {
		super();
	}
	execute() {
		this.log.push('exec:plain');
	}
	undo() {
		this.log.push('undo:plain');
	}
}

describe('command merging', () => {
	beforeEach(() => {
		while (commandProcessor.canUndo()) commandProcessor.undo();
		commandProcessor.clearHistory?.();
	});

	test('a run of mergeable commands collapses into one undo step', () => {
		const log: string[] = [];
		// A slider drag: ~one command per input event.
		for (const v of [10, 20, 30, 40]) {
			commandProcessor.execute(new TaggedCommand('contrast', v, log));
		}

		expect(log.filter((l) => l.startsWith('exec:')).length).toBe(4);

		commandProcessor.undo();
		expect(log.filter((l) => l.startsWith('undo:')).length).toBe(1);
		expect(commandProcessor.canUndo()).toBe(false);
	});

	test('a different tag is a separate undo step', () => {
		const log: string[] = [];
		commandProcessor.execute(new TaggedCommand('contrast', 10, log));
		commandProcessor.execute(new TaggedCommand('saturation', 10, log));

		commandProcessor.undo();
		expect(commandProcessor.canUndo()).toBe(true);
	});

	test('an unmergeable command between two runs breaks the merge', () => {
		const log: string[] = [];
		commandProcessor.execute(new TaggedCommand('contrast', 10, log));
		commandProcessor.execute(new PlainCommand(log));
		commandProcessor.execute(new TaggedCommand('contrast', 20, log));

		commandProcessor.undo();
		commandProcessor.undo();
		commandProcessor.undo();

		expect(log).toContain('undo:plain');
		expect(commandProcessor.canUndo()).toBe(false);
	});

	test('commands without mergeWith behave exactly as before', () => {
		const log: string[] = [];
		commandProcessor.execute(new PlainCommand(log));
		commandProcessor.execute(new PlainCommand(log));

		commandProcessor.undo();
		expect(commandProcessor.canUndo()).toBe(true);
	});
});
