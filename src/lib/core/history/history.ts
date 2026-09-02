// History subsystem for managing undo/redo and checkpoints
// This will be expanded in later phases

import type { Command } from '../commands/base';
import { commandProcessor } from '../commands/processor';

// History manager - for now just wraps the command processor
export const historyManager = {
	undo: () => commandProcessor.undo(),
	redo: () => commandProcessor.redo(),
	canUndo: () => commandProcessor.canUndo(),
	canRedo: () => commandProcessor.canRedo(),
	getHistoryStore: () => commandProcessor.getHistoryStore()
};

// Types for history subsystem
export interface HistoryEntry {
	id: string;
	timestamp: number;
	command: Command;
}
