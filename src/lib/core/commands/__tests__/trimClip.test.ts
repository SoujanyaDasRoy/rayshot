import { describe, it, expect, vi } from 'vitest';
import { TrimClipCommand } from '../trimClip';

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

describe('TrimClipCommand', () => {
  it('should trim the start of a clip', () => {
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
          sourceOut: 8,
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

    // Trim start to 2 seconds (so sourceIn becomes 2)
    const command = new TrimClipCommand({
      clipId: 'clip1',
      side: 'start',
      newSourceTime: 2
    });

    // Execute
    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();
    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    const trimmedClip = updatedProject.clips.get('clip1');

    expect(trimmedClip).toBeDefined();
    expect(trimmedClip?.sourceIn).toBe(2);
    expect(trimmedClip?.sourceOut).toBe(8);
    // When trimming start, timelineStart should adjust to keep end point fixed
    // Original end time = timelineStart + (sourceOut - sourceIn) = 2 + (8-0) = 10
    // New timelineStart = endTime - (newSourceOut - newSourceIn) = 10 - (8-2) = 4
    expect(trimmedClip?.timelineStart).toBe(4);
    expect(trimmedClip?.timelineDuration).toBe(6); // sourceOut - sourceIn = 8-2 = 6

    // Undo
    command.undo();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject).toEqual(mockState);

    // Redo
    command.execute();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(3);
    const redoneProject = mockProjectStore.set.mock.calls[2][0];
    const redoneClip = redoneProject.clips.get('clip1');
    expect(redoneClip?.sourceIn).toBe(2);
    expect(redoneClip?.timelineStart).toBe(4);
  });

  it('should trim the end of a clip', () => {
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
          sourceIn: 1,
          sourceOut: 9,
          timelineStart: 3,
          timelineDuration: 8,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    // Trim end to 6 seconds (so sourceOut becomes 6)
    const command = new TrimClipCommand({
      clipId: 'clip1',
      side: 'end',
      newSourceTime: 6
    });

    // Execute
    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();
    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    const trimmedClip = updatedProject.clips.get('clip1');

    expect(trimmedClip).toBeDefined();
    expect(trimmedClip?.sourceIn).toBe(1);
    expect(trimmedClip?.sourceOut).toBe(6);
    // When trimming end, timelineStart stays the same
    expect(trimmedClip?.timelineStart).toBe(3);
    expect(trimmedClip?.timelineDuration).toBe(5); // 6-1 = 5

    // Undo
    command.undo();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(2);
    const restoredProject = mockProjectStore.set.mock.calls[1][0];
    expect(restoredProject).toEqual(mockState);

    // Redo
    command.execute();
    expect(mockProjectStore.set).toHaveBeenCalledTimes(3);
    const redoneProject = mockProjectStore.set.mock.calls[2][0];
    const redoneClip = redoneProject.clips.get('clip1');
    expect(redoneClip?.sourceOut).toBe(6);
    expect(redoneClip?.timelineStart).toBe(3);
  });

  it('should clamp values to media asset bounds', () => {
    // Setup mock state with asset duration 10
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
          timelineStart: 0,
          timelineDuration: 10,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;

    // Try to trim start to -5 (should clamp to 0)
    const command1 = new TrimClipCommand({
      clipId: 'clip1',
      side: 'start',
      newSourceTime: -5
    });
    command1.execute();
    const updatedProject1 = mockProjectStore.set.mock.calls[0][0];
    const clipped1 = updatedProject1.clips.get('clip1');
    expect(clipped1?.sourceIn).toBe(0); // clamped to 0
    expect(clipped1?.sourceOut).toBe(10); // unchanged
    // timelineStart adjustment: end time = 0 + (10-0) = 10; new timelineStart = 10 - (10-0) = 0
    expect(clipped1?.timelineStart).toBe(0);

    // Try to trim end to 15 (should clamp to 10)
    const command2 = new TrimClipCommand({
      clipId: 'clip1',
      side: 'end',
      newSourceTime: 15
    });
    command2.execute();
    const updatedProject2 = mockProjectStore.set.mock.calls[1][0];
    const clipped2 = updatedProject2.clips.get('clip1');
    expect(clipped2?.sourceIn).toBe(0);
    expect(clipped2?.sourceOut).toBe(10); // clamped to 10
    expect(clipped2?.timelineStart).toBe(0);
    expect(clipped2?.timelineDuration).toBe(10);
  });
});