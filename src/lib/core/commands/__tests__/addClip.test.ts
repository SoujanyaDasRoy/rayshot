// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProjectStore } = vi.hoisted(() => {
  return {
    mockProjectStore: {
      set: vi.fn(),
      mockState: null
    }
  };
});

vi.mock('$lib/stores/project.svelte', () => ({
  projectStore: mockProjectStore
}));

vi.mock('svelte/store', () => ({
  get: (store: any) => store.mockState,
  writable: () => ({
    set: vi.fn(),
    update: vi.fn(),
    subscribe: vi.fn()
  })
}));

import { AddClipCommand } from '../addClip';

describe('AddClipCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute and add a clip to the track', () => {
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
              clipInstances: []
            }
          ]
        }
      ],
      activeSequenceId: 'seq1',
      clips: new Map(),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new AddClipCommand({
      mediaAssetId: 'asset1',
      trackId: 'track1',
      position: 5
    });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();

    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    expect(updatedProject.clips.size).toBe(1);
    const clipId = Array.from(updatedProject.clips.keys())[0];
    expect(clipId).toBeTruthy();

    const updatedTrack = updatedProject.sequences[0].tracks.find(t => t.id === 'track1');
    expect(updatedTrack.clipInstances).toContain(clipId);

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
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject).toEqual(mockState);

    // Test redo
    command.execute();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(3);
    const redoneProject = mockProjectStore.set.mock.calls[2][0];
    expect(redoneProject.clips.size).toBe(1);
  });
});