import type { Command } from './base';
import { writable, get } from 'svelte/store';
import { projectStore } from '$lib/stores/project.svelte';
import { opfsAutoSave } from '../persistence/opfsAdapter';

// Command processor singleton
class CommandProcessor {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];
	private maxHistorySize: number = 50;
	private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// Store for history state (could be moved to history subsystem later)
	private historyStore = writable({
		undoCount: 0,
		redoCount: 0,
		canUndo: false,
		canRedo: false
	});

	private scheduleAutoSave() {
		if (typeof window === 'undefined') return;
		if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
		this.autoSaveTimer = setTimeout(() => {
			const project = get(projectStore);
			if (project) {
				opfsAutoSave(project as unknown as Record<string, unknown>).catch(() => {});
			}
		}, 800);
	}

	public execute(command: Command): void {
		// Execute the command
		command.run();
		
		// Add to undo stack and clear redo stack
		this.undoStack.push(command);
		this.redoStack = [];
		
		// Limit history size
		if (this.undoStack.length > this.maxHistorySize) {
			this.undoStack.shift();
		}
		
		// Update history state
		this.updateHistoryState();

		// Auto-save project to OPFS (debounced 800ms)
		this.scheduleAutoSave();
	}
	
	public undo(): void {
		const command = this.undoStack.pop();
		if (command) {
			command.reverse();
			this.redoStack.push(command);
			this.updateHistoryState();
		}
	}
	
	public redo(): void {
		const command = this.redoStack.pop();
		if (command) {
			command.run();
			this.undoStack.push(command);
			this.updateHistoryState();
		}
	}
	
	public canUndo(): boolean {
		return this.undoStack.length > 0;
	}
	
	public canRedo(): boolean {
		return this.redoStack.length > 0;
	}
	
	private updateHistoryState(): void {
		this.historyStore.set({
			undoCount: this.undoStack.length,
			redoCount: this.redoStack.length,
			canUndo: this.canUndo(),
			canRedo: this.canRedo()
		});
	}
	
	public getHistoryStore() {
		return this.historyStore;
	}
}

// Export a singleton instance
export const commandProcessor = new CommandProcessor();
