import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { projectStore } from '$lib/stores/project.svelte';
import { timelineActions } from '$lib/stores/timeline.svelte';
import { commandProcessor } from '$lib/core/commands/processor';
import { persistence } from '$lib/core/persistence/persistence';
import type { Project, Sequence, Track, Clip, MediaAsset } from '$lib/types/project';

// Mock the persistence module
const mockPersistence = {
  createProject: vi.fn(),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  createCheckpoint: vi.fn(),
  loadCheckpoint: vi.fn(),
  listCheckpoints: vi.fn(),
  deleteCheckpoint: vi.fn(),
  clear: vi.fn()
};

vi.mock('$lib/core/persistence/persistence', () => {
  return {
    persistence: mockPersistence,
    __esModule: true,
    default: mockPersistence
  };
});

// We also need to mock the projectStore because commands use it
// We'll follow the pattern from the command tests
const mockProjectStore = {
  set: vi.fn(),
  subscribe: vi.fn((callback: any) => {
    // Call the callback immediately with the current mock state
    if (mockProjectStore.mockState) {
      callback(mockProjectStore.mockState);
    }
    // Return an unsubscribe function
    return () => {};
  })
};

vi.mock('$lib/stores/project.svelte', () => {
  return {
    ...mockProjectStore,
    // Export the mock store as the projectStore
    projectStore: mockProjectStore
  };
});

// Mock svelte/store for the get function used in commands
vi.mock('svelte/store', () => {
  const mockGet = vi.fn((store: any) => {
    // If store is our mockProjectStore, we return the mock state we set up in the test
    return store.mockState;
  });
  return {
    get: mockGet,
    writable: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      subscribe: vi.fn()
    })),
    derived: vi.fn()
  };
});

describe('Timeline editing integration', () => {
  let mockProject: Project;
  const mockProjectId = 'test-project-id';
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Set up a mock project state
    mockProject = {
      id: mockProjectId,
      name: 'Test Project',
      assets: new Map([
        ['asset1', { id: 'asset1', duration: 10, name: 'Test Asset', type: 'video' }]
      ]),
      sequences: [
        {
          id: 'seq1',
          name: 'Sequence 1',
          activeSequenceId: 'seq1',
          tracks: [
            {
              id: 'track1',
              name: 'Track 1',
              type: 'video',
              clipInstances: [] // empty initially
            },
            {
              id: 'track2',
              name: 'Track 2',
              type: 'audio',
              clipInstances: []
            }
          ]
        }
      ],
      activeSequenceId: 'seq1',
      clips: new Map(),
      modifiedAt: 0
    };

    // Assign the mock state to the mock projectStore so that get(projectStore) returns it
    mockProjectStore.mockState = mockProject;

    // Mock persistence.createProject and persistence.loadProject to return our mock project
    mockPersistence.createProject.mockResolvedValue(mockProjectId);
    mockPersistence.loadProject.mockResolvedValue(mockProject);

    // Set up a subscription to projectStore that calls persistence.saveProject on changes
    // This simulates what an autosave mechanism might do
    if (unsubscribe) {
      unsubscribe();
    }
    unsubscribe = projectStore.subscribe((project) => {
      if (project) {
        persistence.saveProject(project.id, project);
      }
    });
  });

  afterEach(() => {
    // Clean up subscription
    if (unsubscribe) {
      unsubscribe();
    }
  });

  it('should perform add clip -> move -> trim -> split -> undo/redo and verify persistence calls', async () => {
    // 1. Create a project (via persistence)
    const projectId = await persistence.createProject('Test Project');
    expect(projectId).toBe(mockProjectId);
    expect(mockPersistence.createProject).toHaveBeenCalledWith('Test Project');

    // 2. Load the project (via persistence)
    const loadedProject = await persistence.loadProject(projectId);
    expect(loadedProject).toEqual(mockProject);
    expect(mockPersistence.loadProject).toHaveBeenCalledWith(projectId);

    // At this point, our mockProjectState is already set, and the subscription would have triggered a saveProject call
    // Let's verify that saveProject was called with the initial project
    expect(mockPersistence.saveProject).toHaveBeenCalledWith(mockProjectId, mockProject);

    // Reset mock call counts to focus on the workflow operations
    mockPersistence.saveProject.mockClear();

    // 3. Add a clip to track1 at position 0
    const AddClipCommand = (await import('$lib/core/commands/addClip')).AddClipCommand;
    const addClipCommand = new AddClipCommand({
      mediaAssetId: 'asset1',
      trackId: 'track1',
      position: 0
    });

    commandProcessor.execute(addClipCommand);

    // Verify that saveProject was called after the add operation
    expect(mockPersistence.saveProject).toHaveBeenCalled();
    // Get the arguments of the last call to saveProject
    const lastSaveCall = mockPersistence.saveProject.mock.calls[mockPersistence.saveProject.mock.calls.length - 1];
    const savedProjectId = lastSaveCall[0];
    const savedProject = lastSaveCall[1];

    expect(savedProjectId).toBe(mockProjectId);
    // Verify the project has the added clip
    expect(savedProject.clips.size).toBe(1);
    const clipId = Array.from(savedProject.clips.keys())[0];
    expect(clipId).toBeTruthy();

    // Verify that the track now contains the clipId
    const updatedTrack = savedProject.sequences[0].tracks.find(t => t.id === 'track1');
    expect(updatedTrack.clipInstances).toContain(clipId);

    // Verify that the clip has the correct properties
    const addedClip = savedProject.clips.get(clipId);
    expect(addedClip).toMatchObject({
      mediaAssetId: 'asset1',
      timelineStart: 0,
      timelineDuration: 10,
      sourceIn: 0,
      sourceOut: 10
    });

    // 4. Move the clip to position 5 on the same track
    const MoveClipCommand = (await import('$lib/core/commands/moveClip')).MoveClipCommand;
    const moveClipCommand = new MoveClipCommand({
      clipId: clipId,
      newTrackId: 'track1',
      newPosition: 5
    });

    commandProcessor.execute(moveClipCommand);

    // Verify that saveProject was called after the move operation
    expect(mockPersistence.saveProject).toHaveBeenCalledTimes(2); // 1 initial + 1 add + 1 move
    const moveSaveCall = mockPersistence.saveProject.mock.calls[mockPersistence.saveProject.mock.calls.length - 1];
    const movedProject = moveSaveCall[1];

    expect(movedProject.clips.size).toBe(1);
    const movedClip = movedProject.clips.get(clipId);
    expect(movedClip).toMatchObject({
      mediaAssetId: 'asset1',
      timelineStart: 5, // moved to position 5
      timelineDuration: 10,
      sourceIn: 0,
      sourceOut: 10
    });

    // 5. Trim the clip's start to 2 seconds
    const TrimClipCommand = (await import('$lib/core/commands/trimClip')).TrimClipCommand;
    const trimClipCommand = new TrimClipCommand({
      clipId: clipId,
      side: 'start',
      newSourceTime: 2
    });

    commandProcessor.execute(trimClipCommand);

    // Verify that saveProject was called after the trim operation
    expect(mockPersistence.saveProject).toHaveBeenCalledTimes(3);
    const trimSaveCall = mockPersistence.saveProject.mock.calls[mockPersistence.saveProject.mock.calls.length - 1];
    const trimmedProject = trimSaveCall[1];

    expect(trimmedProject.clips.size).toBe(1);
    const trimmedClip = trimmedProject.clips.get(clipId);
    expect(trimmedClip).toMatchObject({
      mediaAssetId: 'asset1',
      timelineStart: 5,
      timelineDuration: 10, // duration unchanged
      sourceIn: 2, // trimmed start
      sourceOut: 10
    });

    // 6. Split the clip at position 8 (which is 3 seconds into the clip from its start at 5)
    const SplitClipCommand = (await import('$lib/core/commands/splitClip')).SplitClipCommand;
    const splitClipCommand = new SplitClipCommand({
      clipId: clipId,
      splitTime: 8 // split at timeline position 8
    });

    commandProcessor.execute(splitClipCommand);

    // Verify that saveProject was called after the split operation
    expect(mockPersistence.saveProject).toHaveBeenCalledTimes(4);
    const splitSaveCall = mockPersistence.saveProject.mock.calls[mockPersistence.saveProject.mock.calls.length - 1];
    const splitProject = splitSaveCall[1];

    // After splitting, we should have 2 clips
    expect(splitProject.clips.size).toBe(2);

    // Find the original clip (now should be from 5 to 8 seconds) and the new clip (from 8 to 15 seconds)
    const clipsArray = Array.from(splitProject.clips.values());
    const firstClip = clipsArray.find(c => c.timelineStart === 5);
    const secondClip = clipsArray.find(c => c.timelineStart === 8);

    expect(firstClip).toBeDefined();
    expect(secondClip).toBeDefined();

    if (firstClip && secondClip) {
      // First clip: start at 5, end at 8 (duration 3)
      expect(firstClip).toMatchObject({
        mediaAssetId: 'asset1',
        timelineStart: 5,
        timelineDuration: 3,
        sourceIn: 2, // still has the trimmed start
        sourceOut: 5 // 2 + 3
      });

      // Second clip: start at 8, end at 15 (duration 7)
      expect(secondClip).toMatchObject({
        mediaAssetId: 'asset1',
        timelineStart: 8,
        timelineDuration: 7,
        sourceIn: 5, // starts where first clip ended
        sourceOut: 12 // 5 + 7
      });
    }

    // 7. Undo the split
    commandProcessor.undo();

    // Verify that saveProject was called after undo
    expect(mockPersistence.saveProject).toHaveBeenCalledTimes(5);
    const undoSaveCall = mockPersistence.saveProject.mock.calls[mockPersistence.saveProject.mock.calls.length - 1];
    const undoProject = undoSaveCall[1];

    // After undo, we should be back to 1 clip (the trimmed clip)
    expect(undoProject.clips.size).toBe(1);
    const undoClip = undoProject.clips.get(clipId);
    expect(undoClip).toMatchObject({
      mediaAssetId: 'asset1',
      timelineStart: 5,
      timelineDuration: 10,
      sourceIn: 2,
      sourceOut: 10
    });

    // 8. Redo the split
    commandProcessor.redo();

    // Verify that saveProject was called after redo
    expect(mockPersistence.saveProject).toHaveBeenCalledTimes(6);
    const redoSaveCall = mockPersistence.saveProject.mock.calls[mockPersistence.saveProject.mock.calls.length - 1];
    const redoProject = redoSaveCall[1];

    // After redo, we should have 2 clips again
    expect(redoProject.clips.size).toBe(2);
    const redoClipsArray = Array.from(redoProject.clips.values());
    const redoFirstClip = redoClipsArray.find(c => c.timelineStart === 5);
    const redoSecondClip = redoClipsArray.find(c => c.timelineStart === 8);

    expect(redoFirstClip).toBeDefined();
    expect(redoSecondClip).toBeDefined();

    if (redoFirstClip && redoSecondClip) {
      // First clip: start at 5, end at 8 (duration 3)
      expect(redoFirstClip).toMatchObject({
        mediaAssetId: 'asset1',
        timelineStart: 5,
        timelineDuration: 3,
        sourceIn: 2,
        sourceOut: 5
      });

      // Second clip: start at 8, end at 15 (duration 7)
      expect(redoSecondClip).toMatchObject({
        mediaAssetId: 'asset1',
        timelineStart: 8,
        timelineDuration: 7,
        sourceIn: 5,
        sourceOut: 12
      });
    }

    // Final verification: we expect saveProject to have been called 6 times total:
    // 1. Initial project load (from subscription)
    // 2. After add clip
    // 3. After move clip
    // 4. After trim clip
    // 5. After split clip
    // 6. After undo
    // 7. After redo
    // Actually, let's recount: initial load triggered one, then each command execution triggers one via subscription
    // We had: add, move, trim, split, undo, redo = 6 operations after initial load
    // So total should be 7 calls
    expect(mockPersistence.saveProject).toHaveBeenCalledTimes(7);
  });
});