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

	isExecuted(): boolean {
		return this.executed;
	}
}
