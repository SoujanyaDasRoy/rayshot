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

import { AddClipEffectCommand } from '../addClipEffect';

describe('AddClipEffectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends the effect id and removes it again on undo', () => {
    const mockState = {
      clips: new Map([
        ['clip1', { id: 'clip1', mediaAssetId: 'asset1', effects: ['noir'] }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new AddClipEffectCommand({ clipId: 'clip1', effectId: 'vhs' });
    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(1);
    expect(mockProjectStore.set.mock.calls[0][0].clips.get('clip1').effects).toEqual(['noir', 'vhs']);

    command.undo();

    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    expect(mockProjectStore.set.mock.calls[1][0].clips.get('clip1').effects).toEqual(['noir']);
  });

  it('does not duplicate an effect id that is already applied', () => {
    const mockState = {
      clips: new Map([
        ['clip1', { id: 'clip1', mediaAssetId: 'asset1', effects: ['noir'] }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command = new AddClipEffectCommand({ clipId: 'clip1', effectId: 'noir' });
    command.execute();

    expect(mockProjectStore.set.mock.calls[0][0].clips.get('clip1').effects).toEqual(['noir']);
  });
});
