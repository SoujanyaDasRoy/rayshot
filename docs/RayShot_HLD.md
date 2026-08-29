# RayShot High-Level Design (HLD)

**Status:** Draft  
**Scope:** RayShot editor MVP and extensible foundation

## 1. HLD Objective

This document defines the major components, responsibilities, data flow, and boundaries of the RayShot editor.

The design prioritizes:

- local-first operation;
- non-destructive editing;
- simple UI over a capable editing model;
- background media processing;
- low hardware burden through proxies and efficient processing;
- strong recovery/history;
- future optional cloud services;
- open-source modularity.

## 2. System Context

```text
                         ┌──────────────────────┐
                         │       RAYSHOT        │
                         │      Desktop NLE     │
                         └──────────┬───────────┘
                                    │
            ┌───────────────────────┼────────────────────────┐
            │                       │                        │
            ▼                       ▼                        ▼
      User Interface         Project / Domain          Media Pipeline
      React + TypeScript          Model                    │
            │                       │                      │
            └───────────────────────┼──────────────────────┘
                                    │
                                    ▼
                             Local Persistence
                                  SQLite
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
               User's Media                   RayShot Cache
             Originals on disk              proxies/thumbnails/etc.

                                    │
                                    ▼
                           Optional Cloud Layer
                           render/backup/etc.
```

## 3. Component Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                      │
│                    React + TypeScript UI                        │
│                                                                 │
│  Media Browser | Viewer | Timeline | Inspector | Export | History│
└──────────────────────────────┬──────────────────────────────────┘
                               │ commands / queries
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Application Layer                       │
│                                                                 │
│ Project Service | Timeline Service | History Service            │
│ Media Service   | Export Service | Job Service                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Domain Layer                           │
│                                                                 │
│ Project | Sequence | Track | Clip | MediaAsset | Effect | Text │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                ▼                 ▼
┌───────────────────┐ ┌─────────────────┐ ┌──────────────────────┐
│ Persistence Layer │ │ Background Jobs │ │     Media Engine     │
│                   │ │                 │ │                      │
│ SQLite            │ │ Proxy           │ │ Decode / Encode      │
│ Migrations        │ │ Thumbnail       │ │ FFmpeg               │
│ Snapshots         │ │ Waveform        │ │ Hardware acceleration │
│ History           │ │ Export          │ │ Preview generation   │
└───────────────────┘ └─────────────────┘ └──────────────────────┘
```

## 4. UI Layer

### Responsibilities

- render editor state;
- accept user input;
- display project/media/job status;
- invoke application commands;
- display errors and recovery actions.

### Non-responsibilities

The UI must not:

- become the canonical timeline database;
- directly manipulate original media files for ordinary editing operations;
- construct complex rendering logic itself;
- implement persistence rules independently.

## 5. Application Layer

The application layer orchestrates use cases.

Example:

```text
User clicks Split
       ↓
UI dispatches SplitClipCommand
       ↓
Timeline Service validates operation
       ↓
Domain state changes
       ↓
Persistence transaction
       ↓
History entry
       ↓
UI receives updated state
```

This keeps business behavior outside the React component tree.

## 6. Domain Model

### Project

```text
Project
├── ProjectSettings
├── MediaAssets[]
├── Sequences[]
├── HistoryMetadata
└── ProjectMetadata
```

### Sequence

```text
Sequence
├── resolution
├── frameRate
├── duration
└── Tracks[]
```

### Track

```text
Track
├── id
├── type: VIDEO | AUDIO
├── order
└── Clips[]
```

### Clip

```text
Clip
├── mediaAssetId
├── sourceIn
├── sourceOut
├── timelineStart
├── timelineDuration
├── transform
├── effects[]
├── transitionIn
├── transitionOut
└── audioParameters
```

The clip points to a source asset and describes how that source should be used in the sequence.

## 7. Media Management

### Source media

Source media belongs to the user and normally remains outside the `.rayshot` project container.

```text
User disk
└── Footage
    ├── scene01.mov
    ├── scene02.mp4
    └── interview.wav
```

RayShot stores references and metadata.

### Missing media

When a referenced source is unavailable:

```text
Project opens
     ↓
Media validation
     ↓
Missing asset detected
     ↓
User chooses Relink
     ↓
RayShot searches / confirms matching asset
```

Checksums/fingerprints should be used where practical to prevent accidental relinking to the wrong file.

## 8. Proxy Architecture

```text
                  Imported Media
                        │
                        ▼
                 Media Analyzer
                        │
                        ▼
              Proxy Decision / Profile
                        │
                        ▼
                  Job Scheduler
                        │
                        ▼
                Proxy Generation
                        │
                        ▼
               Cache Registration
                        │
                        ▼
                Playback Selector
                   │            │
              Proxy │            │ Original
                   ▼            ▼
                Preview      Final Export
```

The application should automatically choose an appropriate proxy profile based on source media and device capability where feasible.

## 9. Rendering Architecture

Rendering must be independent from the visual timeline component.

```text
Project + Sequence
        │
        ▼
 Render Planner
        │
        ├── source media
        ├── trims
        ├── transforms
        ├── effects
        ├── transitions
        ├── audio
        └── output settings
        │
        ▼
 Render Graph / Execution Plan
        │
        ▼
 Media Engine
        │
        ├── FFmpeg
        ├── decoder
        ├── encoder
        └── hardware acceleration
        │
        ▼
 Output File
```

This abstraction is essential because it allows future rendering backends, including a cloud renderer, without redesigning the editor's data model.

## 10. Project Persistence

Recommended initial logical layout:

```text
MyFilm.rayshot
│
├── project.db
├── metadata.json
└── optional resources
```

External cache:

```text
RayShot Cache
└── <project-id or content hash>
    ├── proxies
    ├── thumbnails
    ├── waveforms
    └── preview renders
```

### Why separate cache from project?

Because cache is disposable.

The following operation should be safe:

```text
Delete Cache
     ↓
Project remains valid
     ↓
Cache rebuilt later
```

## 11. History Architecture

RayShot needs both **undo/redo** and **durable history**.

### Undo/Redo flow

```text
User action
   ↓
Command
   ↓
State transition
   ↓
Undo stack
   ↓
Redo stack when applicable
```

### Durable history flow

```text
Project state
     ↓
Checkpoint
     ↓
Logical snapshot / delta records
     ↓
SQLite
```

A practical initial implementation can use:

```text
Checkpoint 1
   ↓
N commands
   ↓
Checkpoint 2
   ↓
N commands
   ↓
Checkpoint 3
```

Restore logic reconstructs a prior logical project state without copying original media.

## 12. Background Job System

The editor should maintain a job queue for expensive tasks.

```text
                Job Scheduler
                     │
       ┌─────────────┼───────────────┐
       ▼             ▼               ▼
    Proxy        Thumbnail        Export
    Worker        Worker           Worker
       │             │               │
       └─────────────┴───────────────┘
                     │
                Job Database
```

Workers must not block the UI thread.

Jobs should support:

- pending;
- running;
- paused where appropriate;
- completed;
- failed;
- cancelled.

## 13. Cloud Extension

Cloud services are outside the core local editor.

```text
                   RayShot Client
                         │
               Optional Cloud API
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       Render API    Storage API   Future AI API
            │            │            │
            ▼            ▼            ▼
        Job Queue     Object Store   AI Workers
            │
            ▼
        GPU/CPU Render Workers
```

### Example cloud-render flow

```text
User chooses Cloud Render
        ↓
RayShot prepares render manifest
        ↓
Required source media uploaded
        ↓
Cloud job created
        ↓
Worker renders
        ↓
Output stored
        ↓
Client downloads result
```

The default editor should continue to work without this layer.

## 14. Open-Source Boundary Design

Potential module boundaries:

```text
/apps
  /desktop-ui

/packages
  /project-model
  /project-format
  /timeline
  /history
  /media-manager
  /job-system
  /render-planner
  /ui-components

/native
  /media-engine

/docs
  /architecture
  /project-format
  /contributing
```

The exact repository structure may change, but the conceptual boundaries should remain clear.

## 15. Error Handling

Errors should be surfaced at the layer where recovery is possible.

Example:

```text
FFmpeg error
   ↓
Media Engine classifies error
   ↓
Export Service records failure
   ↓
UI displays:
"Export failed because source clip X is unavailable. Relink media."
```

Avoid exposing raw technical errors as the primary user experience.

Detailed diagnostics may be available for advanced users/developers.

## 16. Offline Behavior

The MVP should remain useful offline.

Offline capabilities:

- open local projects;
- edit local media;
- generate proxies locally;
- save history;
- export locally.

Cloud-only features, when eventually introduced, should clearly indicate their network requirement.

## 17. Security and Privacy Model

The baseline privacy model is:

```text
Original footage ──────── stays local by default
Project data ──────────── stays local by default
Cache ─────────────────── stays local
Cloud ─────────────────── explicit opt-in
```

This is particularly useful for an open-source editor because users can inspect the software and understand where their media goes.

## 18. Scalability Strategy

The local editor should scale primarily through:

- lazy loading;
- efficient metadata storage;
- proxy media;
- bounded caches;
- background work;
- hardware acceleration;
- avoiding unnecessary media copies.

Cloud scalability, when needed, should scale separately through stateless APIs, object storage, queues, and worker pools.

## 19. Key Architectural Decisions

### Decision 1: Local-first

Core editing does not require cloud infrastructure.

### Decision 2: Non-destructive project model

Timeline operations reference and transform source media rather than editing source files.

### Decision 3: Native project format

`.rayshot` becomes the canonical representation of RayShot project state.

### Decision 4: Separate cache

Proxies and generated media are rebuildable and should not be treated as core project data.

### Decision 5: Command-oriented editing

Commands provide a clean basis for undo/redo, history, testing, and future automation.

### Decision 6: Rendering abstraction

The editor produces a render plan; the execution backend may be local initially and cloud-based later.

### Decision 7: Progressive technical migration

Start with technologies the project owner can realistically learn and use, then introduce native code only where profiling demonstrates a need.

## 20. End-to-End Example

A user edits a short film on a modest laptop:

```text
1. Create Project
        ↓
2. Import 4K footage
        ↓
3. Media Analyzer reads metadata
        ↓
4. Proxy jobs start in background
        ↓
5. User starts assembling timeline
        ↓
6. UI sends editing commands
        ↓
7. Project Engine updates state
        ↓
8. SQLite persists state/history
        ↓
9. Timeline plays proxy media
        ↓
10. User restores a prior checkpoint
        ↓
11. Export requested
        ↓
12. Render Planner creates render plan
        ↓
13. Media Engine uses originals
        ↓
14. FFmpeg encodes final MP4
        ↓
15. Export completed
```

The user should experience this as a simple editing workflow. The architecture exists to absorb the complexity underneath it.

---
