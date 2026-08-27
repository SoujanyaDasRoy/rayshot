import { describe, it, expect, vi } from 'vitest';
import { SplitClipCommand } from '../splitClip';

// Mock the project store
const mockProjectStore = {
  set: vi.fn(),
};

vi.mock('$lib/stores/project.svelte', () => ({
  ...mockProjectStore,
}));

vi.mock('svelte/store', () => ({
  get: (store: any) => {
    return store.mockState;
  },
  writable: () => ({
    set: vi.fn(),
    update: vi.fn(),
    subscribe: vi.fn()
  })
}));

describe('SplitClipCommand', () => {
  it('should split a clip into two clips', () => {
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
              clipInstances: ['clip1'] // one clip to split
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

    // Split at timeline position 6 (which is 4 seconds into the clip, since clip starts at 2)
    const splitTime = 6; // timeline position
    const command = new SplitClipCommand({
      clipId: 'clip1',
      splitTime: splitTime
    });

    // Execute
    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();
    const updatedProject = mockProjectStore.set.mock.calls[0][0];

    // Verify original clip is removed
    expect(updatedProject.clips.has('clip1')).toBe(false);
    // Verify two new clips exist
    const clipIds = Array.from(updatedProject.clips.keys());
    expect(clipIds.length).toBe(2);
    expect(clipIds).not.toContain('clip1');

    // Find the two new clips by their IDs (we don't know the exact IDs, but we can check properties)
    const firstClip = updatedProject.clips.get(clipIds[0]);
    const secondClip = updatedProject.clips.get(clipIds[1]);
    // Ensure we have two clips
    expect(firstClip).toBeDefined();
    expect(secondClip).toBeDefined();

    // Verify that the two clips together make up the original clip's source and timeline
    // The first clip should be from sourceIn 0 to split source time
    // The second clip from split source time to sourceOut 10
    // Calculate expected source split time:
    // offsetInClip = splitTime - originalClip.timelineStart = 6 - 2 = 4
    // sourceSplitTime = originalClip.sourceIn + offsetInClip = 0 + 4 = 4
    const expectedSourceSplit = 4;

    // Identify which is first and second by timelineStart
    // firstClip should have timelineStart = originalClip.timelineStart = 2
    // secondClip should have timelineStart = splitTime = 6
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

    // Check first clip
    expect(first.sourceIn).toBe(0);
    expect(first.sourceOut).toBe(expectedSourceSplit);
    expect(first.timelineStart).toBe(2);
    expect(first.timelineDuration).toBe(expectedSourceSplit - 0); // 4

    // Check second clip
    expect(second.sourceIn).toBe(expectedSourceSplit);
    expect(second.sourceOut).toBe(10);
    expect(second.timelineStart).toBe(splitTime); // 6
    expect(second.timelineDuration).toBe(10 - expectedSourceSplit); // 6

    // Verify that the track's clipInstances now contain the two new clip IDs in place of the original
    const track = updatedProject.sequences[0].tracks.find(t => t.id === 'track1');
    expect(track.clipInstances.length).toBe(2);
    expect(track.clipInstances).toContain(first.id);
    expect(track.clipInstances).toContain(second.id);
    // The order should be first then second
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
    // Should have same state as after execute
    expect(redoneProject.clips.has('clip1')).toBe(false);
    expect(redoneProject.clips.size).toBe(2);
  });

  it('should throw error if split time is outside clip bounds', () => {
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
    ];

    mockProjectStore.mockState = mockState;

    // Try to split at timeline position 1 (before clip start)
    const command1 = new SplitClipCommand({
      clipId: 'clip1',
      splitTime: 1
    });
    expect(() => command1.execute()).toThrow('Split time is outside the clip bounds');

    // Try to split at timeline position 12 (after clip end)
    const command2 = new SplitClipCommand({
      clipId: 'clip1',
      splitTime: 12
    });
    expect(() => command2.execute()).toThrow('Split time is outside the clip bounds');
  });
});