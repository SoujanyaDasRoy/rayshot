import type { PersistenceAdapter, PersistenceStrategy } from './types';
import { idbAdapter } from './idbAdapter';
// Import OPFS adapter when available
// import { opfsAdapter } from './opfsAdapter';

// Persistence facade - selects the appropriate adapter based on strategy
export class Persistence {
	private adapter: PersistenceAdapter;
	
	constructor(strategy: PersistenceStrategy = 'indexeddb') {
		switch (strategy) {
			case 'indexeddb':
				this.adapter = idbAdapter;
				break;
			case 'opfs':
				// TODO: Implement OPFS adapter
				// For now, fall back to IndexedDB
				console.warn('OPFS adapter not yet implemented, falling back to IndexedDB');
				this.adapter = idbAdapter;
				break;
			case 'memory':
				// TODO: Implement memory adapter for testing
				console.warn('Memory adapter not yet implemented, falling back to IndexedDB');
				this.adapter = idbAdapter;
				break;
			default:
				this.adapter = idbAdapter;
		}
	}
	
	// Delegate all methods to the adapter
	async createProject(projectName: string): Promise<string> {
		return this.adapter.createProject(projectName);
	}
	
	async loadProject(projectId: string): Promise<any> {
		return this.adapter.loadProject(projectId);
	}
	
	async saveProject(projectId: string, projectData: any): Promise<void> {
		return this.adapter.saveProject(projectId, projectData);
	}
	
	async deleteProject(projectId: string): Promise<void> {
		return this.adapter.deleteProject(projectId);
	}
	
	async listProjects(): Promise<Array<{ id: string; name: string; modifiedAt: number }>> {
		return this.adapter.listProjects();
	}
	
	async createCheckpoint(projectId: string, checkpointName: string): Promise<string> {
		return this.adapter.createCheckpoint(projectId, checkpointName);
	}
	
	async loadCheckpoint(projectId: string, checkpointId: string): Promise<any> {
		return this.adapter.loadCheckpoint(projectId, checkpointId);
	}
	
	async listCheckpoints(projectId: string): Promise<Array<{ id: string; name: string; createdAt: number }>> {
		return this.adapter.listCheckpoints(projectId);
	}
	
	async deleteCheckpoint(projectId: string, checkpointId: string): Promise<void> {
		return this.adapter.deleteCheckpoint(projectId, checkpointId);
	}
	
	async clear(): Promise<void> {
		return this.adapter.clear();
	}
}

// Export a default persistence instance using IndexedDB
export const persistence = new Persistence('indexeddb');
