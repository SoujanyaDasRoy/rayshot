# RayShot Product Requirements Document (PRD)

**Status:** Draft / MVP definition  
**Product:** RayShot  
**Target platform:** Desktop-first prototype, with web-compatible product principles  
**Initial implementation:** Local-first  

## 1. Product Summary

RayShot is a non-linear video editor designed for budding filmmakers and hobbyists who find conventional professional NLEs too complex, demanding, or intimidating.

The MVP should prove one central hypothesis:

> **A capable editor can provide a dramatically simpler workflow without removing the creative control users need.**

## 2. Target Users

### Primary user

A student, hobbyist, aspiring YouTuber, short-film creator, or beginner filmmaker who:

- has basic familiarity with video editing;
- has outgrown very simple editors or wants more control;
- does not want to spend months learning a professional NLE;
- may have a mid-range or low-cost laptop;
- wants to finish real projects rather than learn software for its own sake.

### Secondary user

An experienced hobbyist who understands editing concepts but wants a faster, cleaner interface for personal work.

## 3. Jobs to Be Done

When I have footage and a creative idea, I want to:

- quickly understand the editor;
- organize footage without learning complicated media-management systems;
- assemble and refine a timeline;
- experiment without fear of destroying my project;
- edit smoothly even when my machine is not a high-end workstation;
- export a finished video using sensible defaults.

## 4. MVP Goals

The MVP must demonstrate a complete editing loop:

```text
Create Project
   ↓
Import Media
   ↓
Build Timeline
   ↓
Trim / Split / Move Clips
   ↓
Undo / Redo
   ↓
Save Project
   ↓
Reopen Project
   ↓
Export Video
```

Secondary MVP goal:

> Make the above workflow understandable to a user who has never used Premiere Pro or DaVinci Resolve.

## 5. MVP Functional Requirements

### 5.1 Project Creation

- Create a new RayShot project.
- Set or infer resolution and frame rate.
- Save a project locally.
- Reopen an existing project.
- Display project status and save state.

### 5.2 Media Import

- Import local video files.
- Import audio files.
- Import images.
- Detect basic media metadata.
- Show imported assets in a media browser.
- Detect missing source files and provide a relink workflow.

### 5.3 Timeline

- Support multiple video tracks.
- Support multiple audio tracks.
- Place clips on tracks.
- Move clips.
- Trim clip start/end.
- Split clips.
- Delete clips.
- Ripple/overwrite behavior must be defined explicitly before implementation.
- Show timeline timecode.
- Support timeline zoom and horizontal navigation.

### 5.4 Playback / Preview

- Play and pause timeline.
- Seek.
- Scrub.
- Preview the selected sequence.
- Display current time and duration.
- Handle unsupported or missing media gracefully.

### 5.5 Basic Editing

- Cut and trim.
- Move clips.
- Basic transitions.
- Basic text/title insertion.
- Basic audio volume controls.
- Basic fade in/out.

### 5.6 Undo / Redo

- Every user-visible edit operation must be undoable where technically reasonable.
- Redo must restore an undone operation.
- Undo/redo must operate on the project state, not on original media.

### 5.7 Project History

RayShot should maintain durable project checkpoints in addition to transient undo/redo.

Users should eventually be able to see meaningful project states such as:

```text
Today
  10:41 AM — Initial assembly
  11:12 AM — Added music
  11:48 AM — Reworked ending
```

MVP requirement:

- Maintain automatic project snapshots or checkpoints.
- Allow restoring an earlier checkpoint.
- Do not duplicate original video assets merely because history exists.

The visual history browser can be minimal in the first release.

### 5.8 Project Format

Introduce a native RayShot project format:

```text
MyFilm.rayshot
```

The project format should be:

- versioned;
- documented;
- non-destructive;
- portable where practical;
- independent of original media bytes;
- suitable for future open-source tooling.

Initial implementation may use a structured SQLite-backed representation or a container containing a SQLite database plus metadata. The format must be designed so it can evolve without breaking existing projects.

### 5.9 Proxy Media

MVP/early post-MVP priority:

- Generate lightweight proxy media in the background.
- Link each proxy to the source asset.
- Allow editing against proxy media.
- Preserve source-media references for final export.
- Treat proxy data as rebuildable cache, not irreplaceable project data.

### 5.10 Export

- Export the current sequence.
- Support at least 1080p H.264 MP4 initially.
- Provide sensible presets.
- Show export progress.
- Handle export errors with actionable messages.

## 6. UX Requirements

### 6.1 Interface Philosophy

The interface should be intentionally less intimidating than a traditional professional NLE.

The UI should prioritize:

- clear primary actions;
- uncluttered default state;
- sensible defaults;
- progressive disclosure of advanced controls;
- direct manipulation where possible;
- contextual controls.

### 6.2 Initial Workspace

The first usable workspace should roughly consist of:

```text
┌─────────────────────────────────────────────┐
│ Media    Edit    Audio    Effects    Export│
├──────────────┬──────────────────────────────┤
│              │                              │
│ Media        │          Preview             │
│ Browser      │                              │
│              │                              │
├──────────────┴──────────────────────────────┤
│                                            │
│                  Timeline                  │
│                                            │
└────────────────────────────────────────────┘
```

This is a conceptual layout, not a locked UI design.

### 6.3 Beginner Experience

The first-run experience should teach through interaction rather than a long tutorial.

A new user should be able to:

1. create a project;
2. import footage;
3. place a clip on the timeline;
4. trim it;
5. add a second clip;
6. export;

without needing to understand bins, sequences, nested timelines, codecs, or color-management theory.

## 7. Non-Goals for MVP

The MVP should not attempt to build:

- collaborative editing;
- user accounts;
- mandatory cloud storage;
- cloud rendering;
- AI editing;
- advanced color grading;
- complex audio mixing;
- multicamera editing;
- motion graphics comparable to After Effects;
- a marketplace or plugin ecosystem;
- mobile apps.

## 8. Success Metrics for MVP Validation

The initial product should be tested qualitatively and quantitatively.

Suggested metrics:

- time for a first-time user to make a first edit;
- percentage of test users who complete an export without assistance;
- number of times users get stuck in the interface;
- task completion time for common editing operations;
- playback smoothness with and without proxies;
- crash/error rate;
- percentage of users who can reopen a saved project successfully.

The most important early question is not number of downloads. It is:

> **Do people who dislike traditional NLEs find RayShot easier without feeling that it is too limited?**

## 9. Future Features

Potential later capabilities:

- more advanced effects;
- automatic media organization;
- cloud render on demand;
- optional cloud backup;
- collaboration;
- import/export with other project formats where feasible;
- accessibility improvements;
- AI-assisted repetitive tasks;
- smart clip search and summarization;
- optional AI rough cuts;
- plugin/extension architecture.

## 10. Product Risks

### Risk: oversimplification

Making the editor easy could also make it feel too limited.

**Mitigation:** progressive complexity and an extensible project model.

### Risk: weak-hardware performance

Even a simple UI cannot hide poor media performance forever.

**Mitigation:** proxies, caching, background processing, efficient decoding, hardware acceleration where available.

### Risk: cloud cost explosion

Cloud media storage and rendering can become expensive quickly.

**Mitigation:** local-first core; cloud features optional and independently scalable.

### Risk: contributor complexity

Open source can attract contributors but can also produce fragmented architecture.

**Mitigation:** documented architecture, contribution guidelines, clear module boundaries, tests, and a versioned project specification.

## 11. MVP Acceptance Criteria

A release candidate meets the MVP definition when a test user can:

- create a project;
- import at least two video clips;
- arrange them on a timeline;
- trim and split clips;
- undo and redo edits;
- save and close the project;
- reopen the project with the edit intact;
- restore at least one earlier checkpoint;
- export a playable 1080p MP4;
- complete the workflow on a mainstream consumer laptop.

---

