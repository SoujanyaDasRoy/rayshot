// Abstract base class for all editor commands

export abstract class Command {
	abstract execute(): void;
	abstract undo(): void;

	// Flag to track if command has been executed
	private executed = false;

	run(): void {
		if (!this.executed) {
			this.execute();
			this.executed = true;
		}
	}

	reverse(): void {
		if (this.executed) {
			this.undo();
			this.executed = false;
		}
	}

	/**
	 * Absorb an immediately-following command instead of pushing a new undo
	 * entry. Dragging a slider fires one command per input event; without this
	 * a single drag buries ~100 entries in a 50-deep stack and evicts all real
	 * history. Return true if `next` was absorbed.
	 *
	 * Optional — commands that don't implement it keep one-entry-per-execute.
	 */
	mergeWith?(next: Command): boolean;

	isExecuted(): boolean {
		return this.executed;
	}
}
