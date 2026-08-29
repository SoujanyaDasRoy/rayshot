// IndexedDB implementation of the persistence adapter
import type { PersistenceAdapter } from './types';

// Database constants
const DB_NAME = 'RayShotDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_CHECKPOINTS = 'checkpoints';

// Helper function to open database connection
function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			
			// Create object stores if they don't exist
			if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
				db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
			}
			
			if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
				db.createObjectStore(STORE_CHECKPOINTS, { keyPath: 'id' });
			}
		};
	});
}

// Helper function to wrap IDBRequest in a Promise
function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
}

// Helper function to execute a transaction
async function executeTransaction<T>(
	storeName: string,
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, mode);
		const store = transaction.objectStore(storeName);
		
		transaction.oncomplete = () => resolve(operation(store));
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

export const idbAdapter: PersistenceAdapter = {
	// Project operations
	async createProject(projectName: string): Promise<string> {
		const projectId = crypto.randomUUID();
		const projectData = {
			id: projectId,
			name: projectName,
			version: 1,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			assets: new Map(), // Will need to handle Map serialization
			sequences: [],
			activeSequenceId: null,
			settings: {
				backgroundColor: '#000000'
			}
		};
		
		return executeTransaction(STORE_PROJECTS, 'readwrite', async (store) => {
			// Note: IndexedDB cannot store Map directly; we need to serialize
			// For MVP, we'll store as plain object and convert later
			const serializableProject = {
				...projectData,
				assets: Object.fromEntries(projectData.assets),
				// sequences already serializable
			};
			await requestPromise(store.add(serializableProject));
			return projectId;
		});
	},
	
	async loadProject(projectId: string): Promise<any> {
		return executeTransaction(STORE_PROJECTS, 'readonly', async (store) => {
			const result = await requestPromise(store.get(projectId));
			if (!result) return null;
			// Deserialize assets back to Map
			return {
				...result,
				assets: new Map(Object.entries(result.assets || []))
			};
		});
	},
	
	async saveProject(projectId: string, projectData: any): Promise<void> {
		// Update modifiedAt timestamp
		const dataToSave = {
			...projectData,
			modifiedAt: Date.now()
		};
		
		return executeTransaction(STORE_PROJECTS, 'readwrite', async (store) => {
			const serializableProject = {
				...dataToSave,
				assets: Object.fromEntries(dataToSave.assets)
			};
			await requestPromise(store.put(serializableProject));
		});
	},
	
	async deleteProject(projectId: string): Promise<void> {
		return executeTransaction(STORE_PROJECTS, 'readwrite', async (store) => {
			await requestPromise(store.delete(projectId));
		});
	},
	
	async listProjects(): Promise<Array<{ id: string; name: string; modifiedAt: number }>> {
		return executeTransaction(STORE_PROJECTS, 'readonly', async (store) => {
			const results = await requestPromise(store.getAll());
			return results.map((p: any) => ({
				id: p.id,
				name: p.name,
				modifiedAt: p.modifiedAt
			}));
		});
	},
	
	// Checkpoint operations
	async createCheckpoint(projectId: string, checkpointName: string): Promise<string> {
		const checkpointId = crypto.randomUUID();
		// In a real implementation, we would load the current project state and save it
		const checkpointData = {
			id: checkpointId,
			projectId,
			name: checkpointName,
			createdAt: Date.now(),
			// projectState: {} // Would contain serialized project state
		};
		
		return executeTransaction(STORE_CHECKPOINTS, 'readwrite', async (store) => {
			await requestPromise(store.add(checkpointData));
			return checkpointId;
		});
	},
	
	async loadCheckpoint(projectId: string, checkpointId: string): Promise<any> {
		return executeTransaction(STORE_CHECKPOINTS, 'readonly', async (store) => {
			return await requestPromise(store.get(checkpointId));
		});
	},
	
	async listCheckpoints(projectId: string): Promise<Array<{ id: string; name: string; createdAt: number }>> {
		return executeTransaction(STORE_CHECKPOINTS, 'readonly', async (store) => {
			const allCheckpoints = await requestPromise(store.getAll());
			return allCheckpoints
				.filter((cp: any) => cp.projectId === projectId)
				.map((cp: any) => ({
					id: cp.id,
					name: cp.name,
					createdAt: cp.createdAt
				}));
		});
	},
	
	async deleteCheckpoint(projectId: string, checkpointId: string): Promise<void> {
		return executeTransaction(STORE_CHECKPOINTS, 'readwrite', async (store) => {
			await requestPromise(store.delete(checkpointId));
		});
	},
	
	// General operations
	async clear(): Promise<void> {
		// Clear both stores
		await executeTransaction(STORE_PROJECTS, 'readwrite', async (store) => {
			await requestPromise(store.clear());
		});
		
		await executeTransaction(STORE_CHECKPOINTS, 'readwrite', async (store) => {
			await requestPromise(store.clear());
		});
	}
};
