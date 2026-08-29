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

import { MoveClipCommand } from '../moveClip';

describe('MoveClipCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute and move a clip to a new track and position', () => {
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
              clipInstances: ['clip1']
            },
            {
              id: 'track2',
              clipInstances: []
            }
          ]
        }
      ],
      activeSequenceId: 'seq1',
      clips: new Map([
        ['clip1', {
          id: 'clip1',
          mediaAssetId: 'asset1',
          sourceIn: 0,
          sourceOut: 5,
          timelineStart: 2,
          timelineDuration: 3,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new MoveClipCommand({
      clipId: 'clip1',
      newTrackId: 'track2',
      newPosition: 7
    });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();

    const updatedProject = mockProjectStore.set.mock.calls[0][0];

    const track1 = updatedProject.sequences[0].tracks.find(t => t.id === 'track1');
    const track2 = updatedProject.sequences[0].tracks.find(t => t.id === 'track2');
    expect(track1.clipInstances).not.toContain('clip1');
    expect(track2.clipInstances).toContain('clip1');

    const movedClip = updatedProject.clips.get('clip1');
    expect(movedClip).toBeDefined();
    expect(movedClip?.timelineStart).toBe(7);
    expect(movedClip?.mediaAssetId).toBe('asset1');
    expect(movedClip?.sourceIn).toBe(0);
    expect(movedClip?.sourceOut).toBe(5);
    expect(movedClip?.timelineDuration).toBe(3);

    // Test undo
    command.undo();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject).toEqual(mockState);

    // Test redo
    command.execute();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(3);
    const redoneProject = mockProjectStore.set.mock.calls[2][0];
    const redoneTrack2 = redoneProject.sequences[0].tracks.find(t => t.id === 'track2');
    expect(redoneTrack2.clipInstances).toContain('clip1');
    const redoneClip = redoneProject.clips.get('clip1');
    expect(redoneClip?.timelineStart).toBe(7);
  });
});