<script>
  import { playbackStore, playbackActions } from '$lib/stores/playback.svelte.ts';
  import { timelineStore } from '$lib/stores/timeline.svelte.ts';
  import { projectStore } from '$lib/stores/project.svelte.ts';
  import { derived } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';

  // Helper function to find clip at a specific time
  function findClipAtTime(project, sequenceId, time) {
    if (!project || !sequenceId) return null;

    const sequence = project.sequences.find(s => s.id === sequenceId);
    if (!sequence) return null;

    // We need to check tracks from top to bottom (assuming order in array is top to bottom)
    // For now, we'll just return the first clip we find that contains the time
    // In a proper implementation, we'd check all tracks and return the topmost visible clip
    for (const track of sequence.tracks) {
      for (const clipId of track.clipInstances) {
        const clip = project.clips.get(clipId);
        if (clip) {
          // Check if time falls within this clip's timeline range
          if (time >= clip.timelineStart && time < clip.timelineStart + clip.timelineDuration) {
            // Found a clip that contains this time
            const mediaAsset = project.assets.get(clip.mediaAssetId);
            if (mediaAsset && mediaAsset.type === 'video') {
              return { clip, mediaAsset };
            }
          }
        }
      }
    }

    return null;
  }

  // Calculate the corresponding time in the source media based on timeline time
  function getSourceTime(clip, timelineTime) {
    // Convert timeline time to source media time
    // sourceIn + (timelineTime - timelineStart) * (sourceDuration / timelineDuration)
    // But we need to be careful about the clip's sourceIn/Out and timelineStart/timelineDuration

    const timelineOffset = timelineTime - clip.timelineStart;
    const sourceDuration = clip.sourceOut - clip.sourceIn;
    const timelineDuration = clip.timelineDuration;

    // Avoid division by zero
    if (timelineDuration <= 0) return clip.sourceIn;

    const sourceTime = clip.sourceIn + (timelineOffset / timelineDuration) * sourceDuration;
    return sourceTime;
  }

  // Derive the current media to display based on playback time and project state
  const currentMedia = derived(
    [projectStore, playbackStore, timelineStore],
    ([$project, $playback, $timeline]) => {
      if (!$project || !$project.activeSequenceId) return null;

      const clipInfo = findClipAtTime(
        $project,
        $project.activeSequenceId,
        $playback.currentTime
      );

      if (!clipInfo) return null;

      const { clip, mediaAsset } = clipInfo;

      // Calculate the current time in the source media
      const sourceTime = getSourceTime(clip, $playback.currentTime);

      return {
        ...clipInfo,
        sourceTime
      };
    }
  );

  let videoRef = null;

  // Update video source when currentMedia changes
  function updateVideoSource() {
    if (!videoRef) return;
    if ($currentMedia) {
      videoRef.src = $currentMedia.mediaAsset.source;
    } else {
      videoRef.src = '';
    }
  }

  // Update video currentTime when currentMedia.sourceTime changes
  function updateVideoCurrentTime() {
    if (!videoRef || !$currentMedia) return;
    // Only update if the difference is significant to avoid excessive updates
    if (Math.abs(videoRef.currentTime - $currentMedia.sourceTime) > 0.1) {
      videoRef.currentTime = $currentMedia.sourceTime;
    }
  }

  // Handle video timeupdate to keep playback store in sync
  function handleTimeUpdate(event) {
    const video = event.target;
    const sourceTime = video.currentTime;

    // Convert source time back to timeline time
    if ($currentMedia) {
      const { clip } = $currentMedia;
      const sourceDuration = clip.sourceOut - clip.sourceIn;
      const timelineDuration = clip.timelineDuration;

      if (sourceDuration > 0 && timelineDuration > 0) {
        const timelineOffset = ((sourceTime - clip.sourceIn) / sourceDuration) * timelineDuration;
        const timelineTime = clip.timelineStart + timelineOffset;

        // Only update if the difference is significant (to avoid excessive updates)
        if (Math.abs(timelineTime - $playbackStore.currentTime) > 0.1) {
          playbackActions.setCurrentTime(timelineTime);
        }
      }
    }
  }

  // Handle video seek (when user clicks on the seek bar)
  function handleSeek(event) {
    const video = event.target;
    const sourceTime = video.currentTime;

    // Convert source time back to timeline time and update playback
    if ($currentMedia) {
      const { clip } = $currentMedia;
      const sourceDuration = clip.sourceOut - clip.sourceIn;
      const timelineDuration = clip.timelineDuration;

      if (sourceDuration > 0 && timelineDuration > 0) {
        const timelineOffset = ((sourceTime - clip.sourceIn) / sourceDuration) * timelineDuration;
        const timelineTime = clip.timelineStart + timelineOffset;

        playbackActions.setCurrentTime(timelineTime);
      }
    }
  }

  // Handle video play/pause events
  function handlePlay() {
    playbackActions.setPlaybackState(true);
  }

  function handlePause() {
    playbackActions.setPlaybackState(false);
  }

  // Handle video ended
  function handleEnded() {
    playbackActions.setPlaybackState(false);
  }

  onMount(() => {
    updateVideoSource();
  });

  // We'll use a $: effect to run when $currentMedia changes
  // Actually, we can use the derived store's update? We'll create a separate effect.
  // Since we are using Svelte, we can use the $: syntax for reactive statements.
  // However, we have to be careful not to run updateVideoSource too often.
  // We'll do:
  $: updateVideoSource();

  // Also, when $currentMedia.sourceTime changes, we update the video's currentTime
  $: if ($currentMedia) updateVideoCurrentTime();
</script>

<div class="canvas-container">
  {#if $currentMedia}
    <video
      bind:this={videoRef}
      class="preview-video"
      src={$currentMedia.mediaAsset.source}
      muted
      on:timeupdate={handleTimeUpdate}
      on:seeked={handleSeek}
      on:play={handlePlay}
      on:pause={handlePause}
      on:ended={handleEnded}
    >
      Your browser does not support the video tag.
    </video>
  {:else}
    <div class="placeholder">
      No video clip at current time
    </div>
  {/if}
</div>

<style>
  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: #000;
    overflow: hidden;
  }

  .preview-video {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    background-color: #000;
  }

  .placeholder {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #666;
    font-family: sans-serif;
    text-align: center;
  }
</style>
