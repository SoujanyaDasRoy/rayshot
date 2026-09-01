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
  get: (store: any) => store.mockState
}));

import { SetTransformCommand } from '../setTransform';

describe('SetTransformCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the clip transform and restores it on undo', () => {
    const mockState = {
      clips: new Map([
        [
          'clip1',
          {
            id: 'clip1',
            mediaAssetId: 'asset1',
            transform: { x: 0, y: 0, scale: 1, rotation: 0 }
          }
        ]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 10, y: -5, scale: 1.5, rotation: 90 }
    });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(1);
    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    expect(updatedProject.clips.get('clip1').transform).toEqual({
      x: 10,
      y: -5,
      scale: 1.5,
      rotation: 90
    });

    command.undo();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject.clips.get('clip1').transform).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0
    });
  });
});
