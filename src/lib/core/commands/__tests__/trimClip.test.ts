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

import { TrimClipCommand } from '../trimClip';
import { clipRate } from '../../../utils/clipTiming';

describe('TrimClipCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should trim the start of a clip', () => {
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

    const command = new TrimClipCommand({
      clipId: 'clip1',
      side: 'start',
      newSourceTime: 2
    });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();
    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    const trimmedClip = updatedProject.clips.get('clip1');

    expect(trimmedClip).toBeDefined();
    expect(trimmedClip?.sourceIn).toBe(2);
    expect(trimmedClip?.sourceOut).toBe(8);
    expect(trimmedClip?.timelineStart).toBe(4);
    expect(trimmedClip?.timelineDuration).toBe(6);

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

    const command = new TrimClipCommand({
      clipId: 'clip1',
      side: 'end',
      newSourceTime: 6
    });

    command.execute();

    expect(mockProjectStore.set).toHaveBeenCalled();
    const updatedProject = mockProjectStore.set.mock.calls[0][0];
    const trimmedClip = updatedProject.clips.get('clip1');

    expect(trimmedClip).toBeDefined();
    expect(trimmedClip?.sourceIn).toBe(1);
    expect(trimmedClip?.sourceOut).toBe(6);
    expect(trimmedClip?.timelineStart).toBe(3);
    expect(trimmedClip?.timelineDuration).toBe(5);

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

    const command1 = new TrimClipCommand({
      clipId: 'clip1',
      side: 'start',
      newSourceTime: -5
    });
    command1.execute();
    const updatedProject1 = mockProjectStore.set.mock.calls[0][0];
    const clipped1 = updatedProject1.clips.get('clip1');
    expect(clipped1?.sourceIn).toBe(0);
    expect(clipped1?.sourceOut).toBe(10);
    expect(clipped1?.timelineStart).toBe(0);

    const command2 = new TrimClipCommand({
      clipId: 'clip1',
      side: 'end',
      newSourceTime: 15
    });
    command2.execute();
    const updatedProject2 = mockProjectStore.set.mock.calls[1][0];
    const clipped2 = updatedProject2.clips.get('clip1');
    expect(clipped2?.sourceIn).toBe(0);
    expect(clipped2?.sourceOut).toBe(10);
    expect(clipped2?.timelineStart).toBe(0);
    expect(clipped2?.timelineDuration).toBe(10);
  });
  it('keeps a retimed clip at its own speed when trimmed', () => {
    // The trim wrote `timelineDuration = newSourceOut - newSourceIn`, which is
    // the 1x answer. Trimming a 2x clip silently handed it back at 1x, and
    // because speed is derived from the box there was nothing left to say it
    // had ever been fast.
    const mockState = {
      assets: new Map([['asset1', { id: 'asset1', duration: 20, name: 'Test Asset' }]]),
      sequences: [
        { id: 'seq1', activeSequenceId: 'seq1', tracks: [{ id: 'track1', clipInstances: ['clip1'] }] }
      ],
      activeSequenceId: 'seq1',
      clips: new Map([
        ['clip1', {
          id: 'clip1',
          mediaAssetId: 'asset1',
          sourceIn: 0,
          sourceOut: 10,
          timelineStart: 0,
          // 10s of source in a 5s box: 2x.
          timelineDuration: 5,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;
    expect(clipRate(mockState.clips.get('clip1') as never)).toBe(2);

    new TrimClipCommand({ clipId: 'clip1', side: 'end', newSourceTime: 6 }).execute();

    const trimmed = mockProjectStore.set.mock.calls[0][0].clips.get('clip1');
    expect(trimmed.sourceOut).toBe(6);
    // 6s of source at 2x needs a 3s box, not a 6s one.
    expect(trimmed.timelineDuration).toBe(3);
    expect(clipRate(trimmed)).toBe(2);
  });

  it('trimming the head of a retimed clip keeps its tail where it was', () => {
    const mockState = {
      assets: new Map([['asset1', { id: 'asset1', duration: 20, name: 'Test Asset' }]]),
      sequences: [
        { id: 'seq1', activeSequenceId: 'seq1', tracks: [{ id: 'track1', clipInstances: ['clip1'] }] }
      ],
      activeSequenceId: 'seq1',
      clips: new Map([
        ['clip1', {
          id: 'clip1',
          mediaAssetId: 'asset1',
          sourceIn: 0,
          sourceOut: 10,
          timelineStart: 4,
          timelineDuration: 5,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          effects: [],
          audioParameters: { volume: 1.0, mute: false }
        }]
      ]),
      modifiedAt: 0
    };

    mockProjectStore.mockState = mockState;
    new TrimClipCommand({ clipId: 'clip1', side: 'start', newSourceTime: 4 }).execute();

    const trimmed = mockProjectStore.set.mock.calls[0][0].clips.get('clip1');
    // 6s of source at 2x is a 3s box, and the clip still ends at 9.
    expect(trimmed.timelineDuration).toBe(3);
    expect(trimmed.timelineStart).toBe(6);
    expect(trimmed.timelineStart + trimmed.timelineDuration).toBe(9);
    expect(clipRate(trimmed)).toBe(2);
  });
});
