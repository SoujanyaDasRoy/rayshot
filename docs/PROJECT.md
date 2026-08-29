# Project: RayShot Video Editor Redesign

## Architecture
RayShot is a desktop-class, browser-based non-linear video editor built with Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`), Vite, TypeScript, and Tailwind CSS.
The architecture follows a strict decoupled, unidirectional flow:
1. **Core State & Stores**: `projectStore`, `timelineStore`, `playbackStore`, `mediaStore`, `exportStore`, `uiStore` manage reactive state using Svelte 5 runes.
2. **Command Pattern & Undo/Redo**: All mutations execute via `commandProcessor.execute(...)` with reversible commands (`AddClipCommand`, `MoveClipCommand`, `TrimClipCommand`, `SplitClipCommand`, `DeleteClipCommand`, etc.).
3. **Application Shell (3-Pane Workspace)**:
   - **Left Panel**: 5-pillar category navigation (Media ▦, Text T, Audio ♫, Effects ✨, Transitions ↔) with responsive category drawers.
   - **Center Panel**: Responsive 16:9 Video Canvas with floating transport player bar.
   - **Right Panel**: Contextual Inspector featuring progressive disclosure (quiet guidance prompt when unselected, rich controls for Video, Audio, Text).
   - **Bottom Panel**: Beginner-friendly Multitrack Timeline with SVG track badges, thumbnail strips, audio waveforms, draggable red playhead with floating timecode badge, snapping guides, and edge trim grips.
   - **Top Bar**: Minimal header with editable project name, Undo/Redo buttons, and primary Export CTA.
4. **Playback & Sync Engine**: Single source of truth clock in `playbackStore` synchronizing DOM preview elements, timeline playhead, and floating player.
5. **Export Engine**: Frame-accurate offscreen canvas renderer using `MediaRecorder` at user-selected presets (1080p, 720p, 1:1, 9:16).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Theme Tokens & Base CSS | Dark palette tokens (#090A0D base, #121319 surfaces, #1A1D28 headers, #232738 borders/scrollbars, #38bdf8 accent) | M1 | R1 |
| 2 | Permanent 3-Pane Shell | Remove full-screen takeover modal; keep 3 panes mounted with embedded empty states | M1 | R1 |
| 3 | Minimal Top Bar | Brand icon, inline editable project title, Undo/Redo buttons, high-visibility Export CTA | M1 | R1 |
| 4 | 5-Pillar Category Bar | Left navigation tabs (Media ▦, Text T, Audio ♫, Effects ✨, Transitions ↔) with category drawers | M2 | R1 |
| 5 | Media Bin & Category Drawers | Media file import list & dropzone, Text templates, Audio SFX/music, Effects presets, Transitions presets | M2 | R1 |
| 6 | Contextual Inspector | Quiet guidance prompt when unselected (no technical sequence/codec/FPS metrics by default) | M3 | R2, A1 |
| 7 | Video/Image Clip Controls | Primary controls (Split, Trim, Volume, Speed) + collapsible Transform (X/Y, Scale, Rotation), Opacity, Adjustments | M3 | R2 |
| 8 | Audio Clip Controls | Volume slider, Playback Speed, Mute toggle, Fade In and Fade Out duration sliders | M3 | R2 |
| 9 | Text Clip Controls | Text content textarea, Font selector, Size, Weight, Color picker, Alignment, Position | M3 | R2 |
| 10 | 16:9 Canvas & Floating Transport | Exact 16:9 aspect fitting (no top canvas header), floating player bar with Play/Pause, prev/next frame step, blue scrub bar, friendly time readout (00:04 / 00:30) | M4 | R4 |
| 11 | Multitrack Timeline & Badges | "Timeline" title, camera/speaker SVG track badges, custom dark scrollbars (#232738) | M5 | R3, A2 |
| 12 | Video Thumbnail Filmstrips | Repeating horizontal thumbnail filmstrip across video clips in `Clip.svelte` | M5 | R3, A2 |
| 13 | Audio Waveform Textures | Web Audio API / peak calculation for audio waveforms rendered in `Clip.svelte` | M5 | R3, A2 |
| 14 | Playhead Pin & Timecode Badge | Prominent red draggable playhead pin (#ef4444), laser wire, and attached floating timecode badge | M5 | R3 |
| 15 | Timeline Mechanics & Snapping | Snapping indicator line within 10px threshold, col-resize edge trim grips, selection outline, Split action & 'S' shortcut | M5 | R3, A2 |
| 16 | Svelte 5 & State Integrity | Strict Svelte 5 runes syntax, command history preservation, audio/export sync, typecheck 0 errors, 100% tests pass | M6 | R5, A3 |
| 17 | Comprehensive Test Suite & E2E Verification | Tiers 1-4 requirement-driven test suites + Tier 5 adversarial hardening | E2E, M7 | A3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Shell, Theme & Top Bar | `layout.css`, `+page.svelte`, `Toolbar.svelte`: unified dark theme tokens (#090A0D, #121319, #1A1D28, #232738, #38bdf8), permanent 3-pane layout, minimal top bar with editable name, Undo/Redo, Export CTA | none | DONE |
| M2 | Left Category Navigation | `MediaBin.svelte` & Category drawers: 5-pillar vertical bar (Media, Text, Audio, Effects, Transitions), interactive drawers with empty states, asset dragging | M1 | DONE |
| M3 | Contextual Inspector | `Inspector.svelte`: progressive disclosure, quiet unselected guidance (no technical jargon), Video/Image primary + collapsible transform, Audio controls (Mute, Fade In/Out), Text controls (content, typography) | M1 | DONE |
| M4 | 16:9 Canvas & Transport | `Canvas.svelte`, `Controls.svelte`: responsive 16:9 canvas container, floating player bar with Play/Pause, prev/next frame step, blue scrub bar, friendly time readout | M1 | DONE |
| M5 | Timeline, Thumbnails & Waveforms | `Timeline.svelte`, `Clip.svelte`, `mediaUtils.ts`: "Timeline" title, SVG track badges, thumbnail strips, audio waveforms, red playhead pin with floating timecode badge, snapping indicator line, dark scrollbars | M1 | DONE |
| M6 | Svelte 5 Integrity & Unit Tests | Integration check across all components, typechecking (`npm run check`), unit test suite expansion (`npm run test:unit -- --run`), build verification (`npm run build`) | M1, M2, M3, M4, M5 | DONE |
| E2E | Requirement-Driven E2E Test Suite | E2E test runner, Tiers 1-4 tests (Feature coverage, Boundary cases, Combinatorial, Real-world workflows), `TEST_READY.md` publishing | none (runs in parallel) | DONE |
| M7 | Final E2E Pass & Adversarial Hardening | Verification of 100% passing E2E tests (Tiers 1-4) + Tier 5 adversarial testing & audit | M6, E2E | DONE |

---

## Interface Contracts

### Shell ↔ Category Navigation
- Left pane width: 280px fixed / flexible drawer.
- Emits category change events (`uiStore.activeCategory = 'media' | 'text' | 'audio' | 'effects' | 'transitions'`).
- Media Bin triggers `timelineStore.addClipToTrack(...)` or drag-and-drop to timeline tracks.

### Timeline ↔ Playback & Inspector
- `timelineStore.selectedClipId: string | null` read by `Inspector.svelte`.
- `playbackStore.currentTime: number` synchronized at 60fps with timeline playhead and video canvas.
- `commandProcessor.execute(new SplitClipCommand(...))` triggered by Timeline Split button, Inspector Split button, or `'S'` keyboard shortcut.

### Canvas ↔ Controls & Export
- Canvas mounts `HTMLVideoElement` / `HTMLImageElement` referencing `MediaAsset.objectUrl`.
- Controls invoke `playbackStore.togglePlay()`, `playbackStore.stepFrame(-1)`, `playbackStore.stepFrame(1)`, `playbackStore.seek(time)`.
- Export overlay mounts over canvas without altering playback state.

---

## Code Layout
- `src/routes/+layout.svelte` — Root layout and global styles
- `src/routes/+page.svelte` — 3-pane application shell
- `src/routes/layout.css` — Global CSS variables, custom scrollbars, dark theme tokens
- `src/lib/features/toolbar/Toolbar.svelte` — Minimal top bar with editable name, Undo/Redo, Export CTA
- `src/lib/features/media/MediaBin.svelte` — 5-pillar category navigation bar & drawers (Media, Text, Audio, Effects, Transitions)
- `src/lib/features/canvas/Canvas.svelte` — 16:9 responsive video canvas stage
- `src/lib/features/canvas/Controls.svelte` — Floating transport player bar
- `src/lib/features/timeline/Timeline.svelte` — Multitrack timeline container, track headers, ruler, playhead, snapping guides
- `src/lib/features/timeline/Clip.svelte` — Clip rendering, thumbnail strips, audio waveforms, trim handles
- `src/lib/features/inspector/Inspector.svelte` — Contextual inspector with progressive disclosure
- `src/lib/features/export/Export.svelte` — Canvas export modal & MediaRecorder rendering pipeline
- `src/lib/stores/` — Svelte 5 reactive stores (`project.svelte.ts`, `timeline.svelte.ts`, `playback.svelte.ts`, `media.svelte.ts`, `ui.svelte.ts`)
- `src/lib/core/commands/` — Command pattern implementations (`commandProcessor.svelte.ts`, `commands/*.ts`)
- `src/lib/utils/mediaUtils.ts` — Video thumbnail strip caching, Web Audio API waveform decoding, file import
- `src/tests/` — Vitest unit, integration, and Tier 1-5 test suites
