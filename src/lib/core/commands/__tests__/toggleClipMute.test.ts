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

import { ToggleClipMuteCommand } from '../toggleClipMute';

describe('ToggleClipMuteCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips mute on and restores the previous value on undo', () => {
    const mockState = {
      clips: new Map([
        [
          'clip1',
          {
            id: 'clip1',
            mediaAssetId: 'asset1',
            audioParameters: { volume: 0.8, mute: false }
          }
        ]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new ToggleClipMuteCommand({ clipId: 'clip1' });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(1);
    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    expect(updatedProject.clips.get('clip1').audioParameters).toEqual({
      volume: 0.8,
      mute: true
    });

    command.undo();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject.clips.get('clip1').audioParameters).toEqual({
      volume: 0.8,
      mute: false
    });
  });
});
