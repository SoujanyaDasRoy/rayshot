# RayShot Technical Requirements Document (TRD)

**Status:** Draft  
**Scope:** MVP and early architecture  
**Primary goal:** Build a usable non-linear editor with a local-first architecture that can later support optional cloud processing.

## 1. Technical Goals

RayShot must provide:

- responsive editing interactions;
- non-destructive project representation;
- robust save/recovery behavior;
- efficient handling of large media files;
- background proxy generation;
- deterministic export;
- a versioned project format;
- clear module boundaries for open-source collaboration;
- an architecture that can later move expensive tasks to optional cloud workers.

## 2. Recommended Initial Stack

Because the project owner currently has basic frontend experience and limited native-systems experience, the first implementation should optimize for learnability rather than idealized maximum performance.

### Prototype stack

| Area | Initial choice |
|---|---|
| UI | React + TypeScript |
| Build | Vite |
| Desktop shell | Electron for first prototype |
| Runtime/native bridge | Node.js APIs through Electron |
| Media processing | FFmpeg |
| Persistence | SQLite |
| Project format | `.rayshot` backed by versioned structured data |
| Testing | Vitest + Playwright or equivalent |
| Source control | Git + GitHub |

### Later evolution

Parts of the media/editor engine can move to Rust or C++ when profiling demonstrates a real need. This migration should be driven by measurable bottlenecks rather than assumed requirements.

## 3. Architecture Requirements

### 3.1 Separation of concerns

The system must separate:

1. UI/state presentation.
2. Project/domain model.
3. Persistence.
4. Media management.
5. Playback.
6. Rendering/export.
7. Background jobs.
8. Optional cloud services.

The UI should not become the source of truth for project data.

### 3.2 Command-based editing

User operations should be represented as domain commands where practical.

Examples:

```text
ImportMedia
AddClip
MoveClip
TrimClip
SplitClip
DeleteClip
AddText
SetVolume
AddTransition
```

Commands should update project state and generate history/undo information.

This model creates a common layer for:

- UI actions;
- keyboard shortcuts;
- undo/redo;
- future automation;
- future AI assistance.

## 4. Project Model Requirements

### 4.1 Project

A project should contain:

- project ID;
- schema/version number;
- project settings;
- media asset records;
- one or more sequences;
- tracks;
- clip instances;
- transitions;
- effects;
- text objects;
- audio properties;
- history/checkpoint metadata.

### 4.2 Media Asset

An asset should record at least:

- unique asset ID;
- source path/URI;
- media type;
- filename;
- file size;
- duration;
- frame rate where applicable;
- width/height where applicable;
- codec/container metadata where available;
- checksum or fingerprint for relinking/validation;
- proxy status.

### 4.3 Timeline Clip

A timeline clip should reference a media asset rather than contain the entire media file.

Conceptual model:

```text
Clip
├── id
├── mediaAssetId
├── sourceIn
├── sourceOut
├── timelineStart
├── timelineDuration
├── trackId
├── transform
├── effects
└── audioParameters
```

## 5. Project File Requirements

### 5.1 Native format

The native project extension is:

```text
.rayshot
```

### 5.2 Design requirements

The format must:

- have an explicit schema version;
- support migration between versions;
- avoid embedding original high-resolution media by default;
- preserve project semantics independently from cached proxy files;
- be inspectable by project tooling;
- support future open-source implementations.

### 5.3 Container recommendation

Initial design recommendation:

```text
MyFilm.rayshot
├── project.db
├── metadata.json
└── optional embedded metadata/resources
```

Cache/proxies should preferably remain in an external cache location so deleting the cache does not make the project invalid.

## 6. Persistence and Recovery

### 6.1 SQLite

SQLite should store project domain state and history metadata in the initial implementation.

### 6.2 Autosave

RayShot should autosave after meaningful editing operations with debouncing so it does not write excessively on every mouse movement.

### 6.3 Transactions

Project mutations must use database transactions so a crash cannot leave half-applied edits.

### 6.4 Recovery

On startup, RayShot should detect an incomplete prior session and offer recovery when possible.

## 7. History Requirements

RayShot has two related but distinct systems:

### Undo/Redo

Short-term editing history for active work.

Requirements:

- fast;
- in-memory plus persisted where useful;
- command-oriented;
- deterministic;
- must not duplicate video media.

### Durable project history

Longer-lived checkpoints/snapshots.

Requirements:

- automatically create checkpoints at sensible intervals or milestones;
- retain metadata such as timestamp and optional user label;
- restore prior state safely;
- use database snapshots, deltas, or both;
- deduplicate common data when possible.

A first implementation can use periodic full logical project snapshots plus command records between snapshots. Optimization can come later.

## 8. Media and Proxy Requirements

### 8.1 Original media

Original media should normally remain at user-controlled filesystem locations.

### 8.2 Proxy generation

Proxy generation must run as an asynchronous background job.

Required behavior:

```text
Import media
    ↓
Queue proxy job
    ↓
Continue user interaction
    ↓
Generate proxy
    ↓
Register proxy
    ↓
Use proxy for playback when selected
```

### 8.3 Cache

Cache data must be disposable and rebuildable.

Possible cache contents:

- proxy media;
- thumbnails;
- decoded frame caches;
- audio waveforms;
- preview renders.

### 8.4 Cache keys

Cache entries should use stable identifiers such as:

- asset fingerprint;
- source modification timestamp;
- proxy profile;
- project/render settings.

This prevents stale proxy data from being silently reused.

## 9. Playback and Rendering

### 9.1 Playback

The editor should use lightweight media for interactive playback when necessary.

### 9.2 Render graph

The timeline should be converted into an explicit render plan rather than having UI code construct ad-hoc FFmpeg commands directly.

Conceptually:

```text
Project State
      ↓
Render Planner
      ↓
Render Graph / Job Description
      ↓
Media Engine
      ↓
FFmpeg / platform acceleration
```

### 9.3 Export

Export must be reproducible from project state plus original media.

The export system should record:

- input assets;
- timeline state;
- output profile;
- render settings;
- errors/progress.

## 10. Background Job System

Background tasks should be represented explicitly.

Examples:

```text
ProxyGeneration
ThumbnailGeneration
WaveformGeneration
MediaAnalysis
PreviewRender
FinalExport
CacheCleanup
```

Each job should have:

- ID;
- type;
- priority;
- status;
- progress;
- source project/asset;
- cancellation state;
- error information.

The UI should be able to display job state without owning execution logic.

## 11. Performance Requirements

The exact targets should be established through hardware testing, but the MVP should aim for:

- UI actions to feel immediate for ordinary project sizes;
- timeline operations to avoid blocking on disk or media processing;
- background jobs not to freeze editing interactions;
- proxy playback to support real-time preview on supported consumer laptops;
- memory usage to be monitored and capped where possible;
- large media imports to be incremental rather than requiring whole-file loading into memory.

The application must avoid loading complete video files into JavaScript memory.

## 12. Hardware Acceleration

Hardware acceleration should be detected and used where supported, but the software must have CPU fallbacks.

The design should allow platform-specific acceleration later:

- NVIDIA/AMD/Intel on Windows/Linux where supported;
- VideoToolbox/Metal-related capabilities on macOS;
- other platform APIs as appropriate.

Hardware acceleration should be an optimization, not a correctness dependency.

## 13. Security and Privacy Requirements

For local-first operation:

- user media must not be uploaded automatically;
- telemetry, if introduced, must be explicit and privacy-conscious;
- cloud processing must require user action;
- sensitive local paths should not be sent to remote services unless necessary;
- project files should remain usable offline.

## 14. Cloud Extension Requirements

Cloud should be a replaceable service boundary, not a dependency in the core application.

Potential future service API:

```text
POST /render-jobs
GET  /render-jobs/:id
POST /render-jobs/:id/cancel
```

A cloud render job would ideally receive a project/render description and the required media objects, rather than a permanently synchronized copy of every project by default.

Long-term cloud architecture may use:

```text
Object Storage
      ↓
Job Queue
      ↓
Render Workers
      ↓
Object Storage
      ↓
Client download/stream
```

## 15. Open Source Requirements

The repository should have:

- clear module boundaries;
- contribution guide;
- development setup instructions;
- architecture documentation;
- test instructions;
- issue templates;
- project format specification;
- coding standards;
- decision records for major architectural choices.

The codebase should be modular enough for contributors to work independently.

## 16. Testing Requirements

At minimum:

### Unit tests

- timeline math;
- clip trimming;
- split operations;
- project serialization;
- migration;
- undo/redo;
- history restoration;
- cache key generation.

### Integration tests

- import → edit → save → reopen;
- project recovery;
- proxy generation;
- export pipeline.

### End-to-end tests

- create project;
- import media;
- assemble timeline;
- export playable file.

## 17. Observability

Even without a cloud backend, local diagnostics should make failures understandable.

Log categories should include:

- application;
- media;
- rendering;
- project persistence;
- background jobs;
- GPU/acceleration.

Logs should avoid unnecessarily exposing media contents or sensitive user data.

## 18. Technology Evolution Path

```text
Stage 1
React + TypeScript + Electron + Node + FFmpeg + SQLite

Stage 2
Profile bottlenecks and improve media pipeline

Stage 3
Introduce native Rust/C++ modules where justified

Stage 4
Add optional cloud renderer

Stage 5
Add advanced collaboration and/or AI capabilities
```

The architecture should not prematurely optimize for Stage 5.

---

