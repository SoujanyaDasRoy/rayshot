// Persistence layer interface/types

export interface PersistenceAdapter {
	// Project operations
	createProject(projectName: string): Promise<string>; // Returns projectId
	loadProject(projectId: string): Promise<any>; // Returns project data
	saveProject(projectId: string, projectData: any): Promise<void>;
	deleteProject(projectId: string): Promise<void>;
	listProjects(): Promise<Array<{ id: string; name: string; modifiedAt: number }>>;
	
	// Checkpoint operations
	createCheckpoint(projectId: string, checkpointName: string): Promise<string>; // Returns checkpointId
	loadCheckpoint(projectId: string, checkpointId: string): Promise<any>; // Returns checkpoint data
	listCheckpoints(projectId: string): Promise<Array<{ id: string; name: string; createdAt: number }>>;
	deleteCheckpoint(projectId: string, checkpointId: string): Promise<void>;
	
	// General operations
	clear(): Promise<void>; // Clear all data
}

// Export options for persistence strategy
export type PersistenceStrategy = 'indexeddb' | 'opfs' | 'memory';
