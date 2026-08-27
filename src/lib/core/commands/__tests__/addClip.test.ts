import { describe, it, expect, vi } from 'vitest';
import { AddClipCommand } from '../addClip';

// Mock the project store
const mockProjectStore = {
  set: vi.fn(),
  // We don't need subscribe for these tests, but if we did we could mock it
};

// Mock the svelte/store get function to return our mock project state when given the mock store
// We'll mock the module '$lib/stores/project.svelte' and also 'svelte/store'
vi.mock('$lib/stores/project.svelte', () => ({
  // This is the default export of the store
  ...mockProjectStore,
  // If the store is an object with a subscribe method, we need to mimic that
  // But for get(store) to work, the store must be a valid svelte store
  // We'll make it a readable store by using the mock from svelte/store
  // Actually, we can just export an object that has the shape of a store
  // and we'll mock the get function to return our state when given this store
}));

vi.mock('svelte/store', () => ({
  // We'll mock the get function to return the state we want based on the store passed
  get: (store: any) => {
    // If store is our mockProjectStore, we return the mock state we set up in the test
    // We'll store the state in a variable that the test can set
    return store.mockState;
  },
  // We also need to provide a writable function if the code uses it, but it doesn't
  writable: () => ({
    set: vi.fn(),
    update: vi.fn(),
    subscribe: vi.fn()
  })
}));

describe('AddClipCommand', () => {
  it('should execute and add a clip to the track', () => {
    // Setup mock state
    const mockState = {
      assets: new Map([
        ['asset1', { id: 'asset1', duration: 10, name: 'Test Asset' }]
      ]),
      sequences: [
        {
          id: 'seq1',
          activeSequenceId: 'seq1',
          tracks: [
            {
              id: 'track1',
              clipInstances: [] // empty initially
            }
          ]
        }
      ],
      activeSequenceId: 'seq1',
      clips: new Map(),
      modifiedAt: 0
    };

    // Assign the mock state to the mock store so that get(projectStore) returns it
    mockProjectStore.mockState = mockState;

    // Create command instance
    const command = new AddClipCommand({
      mediaAssetId: 'asset1',
      trackId: 'track1',
      position: 5
    });

    // Execute
    command.execute();

    // Expect projectStore.set to have been called with the updated state
    expect(mockProjectStore.set).toHaveBeenCalled();

    // Get the argument passed to set (the updated project)
    const updatedProject = mockProjectStore.set.mock.calls[0][0];

    // Verify that the clip was added
    expect(updatedProject.clips.size).toBe(1);
    const clipId = Array.from(updatedProject.clips.keys())[0];
    expect(clipId).toBeTruthy();

    // Verify that the track now contains the clipId
    const updatedTrack = updatedProject.sequences[0].tracks.find(t => t.id === 'track1');
    expect(updatedTrack.clipInstances).toContain(clipId);

    // Verify that the clip has the correct properties
    const addedClip = updatedProject.clips.get(clipId);
    expect(addedClip).toMatchObject({
      mediaAssetId: 'asset1',
      timelineStart: 5,
      timelineDuration: 10,
      sourceIn: 0,
      sourceOut: 10
    });

    // Test undo
    command.undo();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    // The second call should be with the original state (the one we set as mockState)
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject).toEqual(mockState);

    // Test redo (execute again after undo)
    command.execute();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(3);
    const redoneProject = mockProjectStore.set.mock.calls[2][0];
    expect(redoneProject.clips.size).toBe(1);
  });
});