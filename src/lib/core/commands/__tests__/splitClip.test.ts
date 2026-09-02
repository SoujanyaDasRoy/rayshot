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

import { SplitClipCommand } from '../splitClip';
import { clipRate } from '../../../utils/clipTiming';

describe('SplitClipCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should split a clip into two clips', () => {
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
          sourceOut: 10,
          timelineStart: 2,
          timelineDuration: 8,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const splitTime = 6;
    const command = new SplitClipCommand({
      clipId: 'clip1',
      splitTime: splitTime
    });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();
    const updatedProject = mockProjectStore.set.mock.calls[0][0];

    expect(updatedProject.clips.has('clip1')).toBe(false);
    const clipIds = Array.from(updatedProject.clips.keys());
    expect(clipIds.length).toBe(2);
    expect(clipIds).not.toContain('clip1');

    const firstClip = updatedProject.clips.get(clipIds[0]);
    const secondClip = updatedProject.clips.get(clipIds[1]);
    expect(firstClip).toBeDefined();
    expect(secondClip).toBeDefined();

    // This fixture is 10s of source inside an 8s box — a 1.25x clip, which
    // nobody noticed. The old maths added the timeline offset straight onto
    // sourceIn and got 4; four timeline seconds into a 1.25x clip is really
    // five source seconds. The 4 was the 1:1 assumption, not the answer.
    const expectedSourceSplit = 5;

    let first: any, second: any;
    if (firstClip.timelineStart === 2) {
      first = firstClip;
      second = secondClip;
    } else if (secondClip.timelineStart === 2) {
      first = secondClip;
      second = firstClip;
    } else {
      throw new Error('Could not identify first clip by timelineStart');
    }

    expect(first.sourceIn).toBe(0);
    expect(first.sourceOut).toBe(expectedSourceSplit);
    expect(first.timelineStart).toBe(2);
    expect(first.timelineDuration).toBe(4);

    expect(second.sourceIn).toBe(expectedSourceSplit);
    expect(second.sourceOut).toBe(10);
    expect(second.timelineStart).toBe(splitTime);
    expect(second.timelineDuration).toBe(4);

    // The halves cover the original box exactly, and both still play at the
    // speed the original did. Splitting must not retime anything.
    expect(first.timelineDuration + second.timelineDuration).toBe(8);
    expect(clipRate(first)).toBeCloseTo(1.25, 10);
    expect(clipRate(second)).toBeCloseTo(1.25, 10);

    const track = updatedProject.sequences[0].tracks.find(t => t.id === 'track1');
    expect(track.clipInstances.length).toBe(2);
    expect(track.clipInstances).toContain(first.id);
    expect(track.clipInstances).toContain(second.id);
    expect(track.clipInstances[0]).toBe(first.id);
    expect(track.clipInstances[1]).toBe(second.id);

    // Undo
    command.undo();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject).toEqual(mockState);

    // Redo
    command.execute();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(3);
    const redoneProject = mockProjectStore.set.mock.calls[2][0];
    expect(redoneProject.clips.has('clip1')).toBe(false);
    expect(redoneProject.clips.size).toBe(2);
  });

  it('should throw error if split time is outside clip bounds', () => {
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
          sourceOut: 10,
          timelineStart: 2,
          timelineDuration: 8,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    const command1 = new SplitClipCommand({
      clipId: 'clip1',
      splitTime: 1
    });
    expect(() => command1.execute()).toThrow('Split time is outside the clip bounds');

    const command2 = new SplitClipCommand({
      clipId: 'clip1',
      splitTime: 12
    });
    expect(() => command2.execute()).toThrow('Split time is outside the clip bounds');
  });
});