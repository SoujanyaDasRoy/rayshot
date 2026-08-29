# Original User Request

## Initial Request — 2026-08-29T06:40:07Z

* * *

Redesign the RayShot browser-based video editor into a polished, modern, desktop-class creative application that feels approachable for absolute beginners (inspired by CapCut and Descript) while maintaining professional editing mechanics and visual refinement (inspired by Final Cut Pro and DaVinci Resolve).

Working directory: c:\Users\sdroy\OneDrive\Desktop\Coding\Startups\Rayshot\rayshot-editor
Integrity mode: development

---

## Requirements

### R1. Application Shell & Left Category Navigation
- Redesign the global layout into a spacious, calm 3-pane desktop creative workstation with minimal borders and subtle surface elevations (`#090A0D` base, `#i121319` surfaces, `#i1A1D28` headers).
- Replace folder-first navigation with a 5-pillar category bar: **Media** (▊), **Text** (T), **Audio** (♡), **Effects** (✨), **Transitions** (�).
- Top bar minimal: "RayShot", editable project name, Undo/Redo, and a high-visibility primary **Export** button (avoid technical codec/resolution metadata in the header).
- Include approachable empty states for all panels that clearly guide first-time users on what to do next.

### R2. Contextual Inspector & Progressive Disclosure
- When no clip is selected, the Inspector remains visually quiet with a subtle guidance prompt ("Select a clip, text, or audio on the timeline to edit properties").
- When a clip is selected, render a contextual inspector with progressive disclosure:
  - **Video/Image**: Primary controls first (Split, Trim, Volume, Speed), followed by collapsible sections for Transform (Position X/Y, Scale, Rotation), Opacity, and Adjustments (Brightness, Contrast).
  - **Audio**: Primary volume slider, Speed, Mute, Fade In/Out.
  - **Text**: Text content input, font size, weight, color, alignment, and position.

### R3. Beginner-Friendly Multitrack Timeline & Clips
- Rename title to simply "Timeline".
- Replace technical `V1`, `V2`, `A1`, `A2` labels with intuitive `Video` and `Audio` track badges with camera and speaker icons.
- Render visual thumbnail strips across video clips and waveform textures across audio clips so users recognize content visually without reading filenames.
- Refine clip selection states with clean restrained outlines and visible edge trim grips (`cursor: col-resize`).
- Add a prominent, draggable red Playhead pin with a vertical line spanning all track lanes and current timecode badge.
- Make the primary **❂ Split** action (and `S` keyboard shortcut) immediately discoverable when a clip is under the playhead.

### R4. Responsive 16:9 Video Canvas & Simplified Transport
- Fit video within available viewport maintaining exact aspect ratios (16:9 widescreen, 9:16 vertical, 1:1 square) without excessive empty margins.
- Clean floating player bar directly below the canvas with a primary Play/Pause toggle, previous/next frame stepping, blue scrub bar, and friendly time readout (`00:04.32 / 00:25.16`).

### R5. Complete Svelte 5 Integrity & Existing Feature Preservation
- Preserve all existing command history (Undo/Redo), project store state, audio engine, client-side canvas/MediaRecorder export engine, and drag-and-drop file import without regressions.
- Strict adherence to Svelte 5 syntax (`$state`, `$herived`, `$xrops`, `$effect`, `onclick`, etc.).

---

## Acceptance Criteria

### A1. Usability & Information Architecture
- [ ] First-time users can immediately discover how to import media, drag to timeline, split at playhead, and export without technical jargon.
- [ ] No technical sequence/codec/FPS metrics displayed by default in the top header or inspector.
- [ ] Left navigation allows switching between Media, Text, Audio, Effects, and Transitions tabs.
- [ ] Inspector dynamically adapts its UI to the selected clip type and remains quiet when unselected.

### A2. Timeline & Editing Polish
- [ ] Timeline displays thumbnail strips on video clips and waveforms on audio clips.
- [ ] Playhead needle smoothly scrubs with mouse drag and keyboard arrow keys.
- [ ] Snapping guide lines appear when clips or playhead align within threshold.
- [ ] Custom dark scrollbars (`#232738`) used across all scrollable viewports.

### A3. Code Quality & Test Verification
- [ ] `npm run check` completes with **0 errors and 0 warnings**.
- [ ] `npm run test:unit -- --run` passes all Vitest test suites (100% passing).
- [ ] `npm run build` succeeds cleanly.
