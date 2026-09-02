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

describe('SetTransformCommand.mergeWith', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function state(transform = { x: 0, y: 0, scale: 1, rotation: 0 }) {
    return {
      clips: new Map([['clip1', { id: 'clip1', mediaAssetId: 'asset1', transform }]]),
      modifiedAt: 0
    };
  }

  it('absorbs an immediately-following drag tick on the same clip into one undo step', () => {
    // A viewport drag fires one command per mousemove. Without merging, a
    // three-second drag at 60fps would bury ~180 entries in a 50-deep undo
    // stack and evict all real history — the exact bug the colour-grade
    // sliders had.
    mockProjectStore.mockState = state();
    const first = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 5, y: 0, scale: 1, rotation: 0 }
    });
    first.execute();

    const second = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 12, y: 3, scale: 1, rotation: 0 }
    });
    second.execute();

    expect(first.mergeWith(second)).toBe(true);

    // Undoing the merged command must land all the way back at the value
    // before the whole gesture, not just before the last tick.
    first.undo();
    const restored = mockProjectStore.set.mock.calls.at(-1)[0];
    expect(restored.clips.get('clip1').transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });

  it('refuses to merge a different clip', () => {
    mockProjectStore.mockState = state();
    const first = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 5, y: 0, scale: 1, rotation: 0 }
    });
    first.execute();

    const other = new SetTransformCommand({
      clipId: 'clip2',
      transform: { x: 5, y: 0, scale: 1, rotation: 0 }
    });
    expect(first.mergeWith(other)).toBe(false);
  });

  it('refuses to merge a command of a different kind', () => {
    mockProjectStore.mockState = state();
    const first = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 5, y: 0, scale: 1, rotation: 0 }
    });
    first.execute();

    expect(first.mergeWith({ constructor: { name: 'SomeOtherCommand' } })).toBe(false);
  });

  it('starts a new undo step once the gesture has gone cold', () => {
    // Two separate drags, minutes apart, must stay two separate undo steps —
    // otherwise a later edit silently rewrites an old one's history.
    vi.useFakeTimers();
    mockProjectStore.mockState = state();
    const first = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 5, y: 0, scale: 1, rotation: 0 }
    });
    first.execute();

    vi.advanceTimersByTime(2000);

    const later = new SetTransformCommand({
      clipId: 'clip1',
      transform: { x: 50, y: 0, scale: 1, rotation: 0 }
    });
    later.execute();

    expect(first.mergeWith(later)).toBe(false);
    vi.useRealTimers();
  });
});
