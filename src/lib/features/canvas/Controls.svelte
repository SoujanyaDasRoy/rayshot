<script>
  import { playbackStore, playbackActions } from '$lib/stores/playback.svelte.ts';
  import { projectStore } from '$lib/stores/project.svelte.ts';
  import { derived } from 'svelte/store';

  // Derive duration from project store: end of the last clip in the active sequence
  const durationStore = derived(
    projectStore,
    ($project) => {
      if (!$project) return 0;

      // Find the active sequence
      const sequence = $project.sequences.find(
        (s) => s.id === $project.activeSequenceId
      );
      if (!sequence) return 0;

      // Calculate duration as the latest end time among all clips
      let maxTime = 0;
      for (const track of sequence.tracks) {
        for (const clipId of track.clipInstances) {
          const clip = $project.clips.get(clipId);
          if (clip) {
            const endTime = clip.timelineStart + clip.timelineDuration;
            if (endTime > maxTime) maxTime = endTime;
          }
        }
      }
      return maxTime;
    }
  );

  // Format time as MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  // Handle seek bar change
  function seekToTime(event) {
    const time = parseFloat(event.target.value);
    playbackActions.setCurrentTime(time);
  }

  // Handle play/pause button click
  function togglePlayback() {
    playbackActions.togglePlayback();
  }
</script>

<div class="controls">
  <button class="play-pause-button" on:click={togglePlayback}>
    {$playbackStore.isPlaying ? '❚❚' : '▶'}
  </button>

  <div class="time-display">
    <span class="current-time">{formatTime($playbackStore.currentTime)}</span>
    <span class="duration-separator">/</span>
    <span class="duration">{formatTime($durationStore)}</span>
  </div>

  <input
    type="range"
    class="seek-bar"
    min="0"
    max={$durationStore}
    value={$playbackStore.currentTime}
    on:input={seekToTime}
  />
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    gap: 1rem;
  }

  .play-pause-button {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-pause-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .time-display {
    color: white;
    font-family: monospace;
    min-width: 5rem;
  }

  .current-time,
  .duration {
    font-size: 0.875rem;
  }

  .duration-separator {
    margin: 0 0.25rem;
  }

  .seek-bar {
    flex: 1;
    height: 4px;
  }

  .seek-bar::-webkit-slider-runnable-track {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .seek-bar::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
    margin-top: -4px;
    cursor: pointer;
  }

  .seek-bar::-moz-range-track {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    height: 4px;
  }

  .seek-bar::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }
</style>
