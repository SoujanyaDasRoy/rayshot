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

import { SetClipTransitionCommand } from '../setClipTransition';

describe('SetClipTransitionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets transitionIn and restores the previous value on undo', () => {
    const mockState = {
      clips: new Map([
        ['clip1', { id: 'clip1', mediaAssetId: 'asset1', transitionIn: undefined }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new SetClipTransitionCommand({ clipId: 'clip1', transitionId: 'cross-dissolve' });
    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(1);
    expect(mockProjectStore.set.mock.calls[0][0].clips.get('clip1').transitionIn).toBe('cross-dissolve');

    command.undo();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    expect(mockProjectStore.set.mock.calls[1][0].clips.get('clip1').transitionIn).toBeUndefined();
  });
});
