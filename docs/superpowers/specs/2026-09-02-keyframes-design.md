# Keyframes — design

**Date:** 2026-09-02
**Status:** approved for implementation
**Branch:** `p0-wiring-fixes`

## Why

`transform`, `opacity` and `playbackRate` are static per clip. Nothing in RayShot
can change over time, so there are no pans, zooms, fades or speed ramps.
Keyframes are the largest missing editor primitive.

## Scope

**In:** position (x, y), scale, rotation, opacity.

**Out, deliberately:**

- **Speed ramps.** Animating `playbackRate` makes the timeline-to-source mapping
  the integral of a rate curve rather than a straight line, which touches every
  seek, trim, waveform and export sync. It also cannot be built on the current
  code: `SetClipPlaybackRateCommand` changes the rate without changing
  `timelineDuration`, while `getSourceTime` derives position linearly from
  `sourceDuration / timelineDuration`. The element plays fast between syncs and
  every sync snaps it back, so setting 2x today produces stutter rather than
  speed. That bug must be fixed on its own before speed ramps are worth
  designing.
- **Colour-grade keys.** Cheap mechanically — the 12 sliders already flow through
  one uniform builder — but multiplies the keyframe UI by twelve properties.
- **Bezier handles** and a **value-graph editor.** Named easings cover real edits;
  handles are only meaningful alongside a graph editor.

## Data model

```ts
export type EasingId = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
export type AnimatedProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

export interface Keyframe {
	/** Source time, in the same units as sourceIn/sourceOut. */
	t: number;
	value: number;
	easing: EasingId;
}
```

On `Clip`, one new optional field:

```ts
keyframes?: Partial<Record<AnimatedProperty, Keyframe[]>>;
```

Keys are stored sorted by `t`.

### Why source time, not clip-local time

This is the decision the rest of the design rests on.

Source time is invariant under move, trim and split, so those three operations
need no keyframe logic at all — the keys stay attached to the frames they were
set on. Trimming the head reveals different animation, which is what Final Cut
does and what "this zoom starts on that moment in the footage" means.

Clip-local anchoring would require re-basing every key on every trim and move,
and would still need explicit handling at a split.

### Static fields remain

The existing `clip.transform` and `clip.filters.opacity` stay, and become the
value used when a property has no keys. A clip with no `keyframes` renders
exactly as it does today. This is what keeps the change additive.

## Resolution

New module `src/lib/core/animation/keyframes.ts`. Dependency-free (pattern C: no
store imports, type-only import of `Clip`), so the node Vitest project can
resolve it and the interpolation maths is testable without a browser.

```ts
export const EASINGS: Record<EasingId, (t: number) => number>;

/** Value at a source time, clamped to the end keys outside the key range. */
export function keyframeValueAt(keys: Keyframe[], t: number, fallback: number): number;

export function resolveTransform(
	clip: Clip,
	sourceTime: number
): { x: number; y: number; scale: number; rotation: number };
export function resolveOpacity(clip: Clip, sourceTime: number): number;

export function upsertKeyframe(
	keys: Keyframe[],
	t: number,
	value: number,
	easing: EasingId
): Keyframe[];
export function removeKeyframeAt(keys: Keyframe[], t: number): Keyframe[];
export function moveKeyframe(keys: Keyframe[], from: number, to: number): Keyframe[];
export function splitKeyframes(keys: Keyframe[], at: number): [Keyframe[], Keyframe[]];
```

Semantics fixed here so they are not re-decided during implementation:

- Before the first key and after the last, the value clamps to that key. No
  extrapolation.
- `easing` belongs to the key the segment _starts_ from.
- `hold` returns the start key's value for the whole segment.
- Two keys within `EPSILON` (1e-4 s) of each other are the same key; `upsert`
  replaces rather than duplicating.
- `splitKeyframes` puts a key at exactly `at` into **both** halves, so neither
  side loses its boundary value.

### Readers

Both render paths already have `sourceTime` in hand — `Canvas` per layer via
`activeLayers`, `Export` per clip per tick — so it is a parameter, never a
lookup.

| Reader                                         | Change                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `canvasUtils.getLayerOpacity(clip)`            | gains optional `sourceTime`. One function already serves both paths.  |
| `layerCompositing.getLayerDrawRect`            | takes a resolved transform instead of reading `clip.transform`.       |
| `Canvas.getLayerTransform` (Canvas.svelte:234) | **deleted.** It duplicates the transform maths in `getLayerDrawRect`. |

Collapsing that duplication is a precondition, not a nicety: two copies of the
transform read is precisely how preview and export drift apart, and fixing one
while missing the other is the likeliest way to ship a divergence.

Playback advances `currentTime` from `requestAnimationFrame`
(`playback.svelte.ts:53`), and `activeLayers` already recomputes on every tick,
so animation is per-frame smooth with no new scheduling.

## Commands

All undoable, following the existing command pattern.

- `SetKeyframeCommand` — add or replace a key at a source time.
- `RemoveKeyframeCommand`
- `MoveKeyframeCommand` — implements `mergeWith`, so dragging a key in the lane is
  one undo entry rather than one per mousemove. Same fix as the colour-grade
  slider flood.
- `SetKeyframeEasingCommand`

`SplitClipCommand` is the one existing command that must change: it partitions
each property's keys through `splitKeyframes`.

### Writing to an animated property

When a property has keys, dragging its Inspector slider must write **a key at the
playhead**, not the static field. Writing the static field would look like the
control does nothing, because the resolver ignores it whenever keys exist. This
is the single easiest thing to get wrong and it is invisible to any test that
only inspects the model, so the e2e asserts the rendered value.

## UI

### Inspector

A diamond control on each animatable row: hollow when there is no key at the
playhead, filled when there is; clicking toggles. A small previous/next pair
steps the playhead between that property's keys.

An animated property shows its interpolated value at the playhead.

### Timeline

A thin keyframe lane under the **selected clip only**, showing keys as diamonds
at their timeline position (source time mapped back through the existing
`getSourceTime` relationship). Drag to retime, context menu for easing.

Not always-on: a lane under every clip is noise, and the timeline has just been
tuned to read cleanly.

## Persistence

Bump `CURRENT_PROJECT_VERSION` from 2 to 3; `v2_to_v3` is a no-op backfill.

Strictly, an optional additive field needs no bump. The bump is for `.rayshot`:
the format is meant to carry a project to another machine, and an older build
opening a keyframed project would silently drop every animation.
`migrateProject` already returns `null` for versions it does not understand, so
bumping converts silent data loss into a clear refusal.

## Tests

**Vitest (pure).** Each easing at t = 0, 0.5, 1. Clamping before the first and
after the last key. `hold` never interpolating. Empty keys falling back to the
static value. `upsert` replacing at the same `t` rather than duplicating.
`moveKeyframe` keeping the array sorted. `splitKeyframes` partitioning by source
time and keeping a boundary key on both sides.

**Playwright (production build).** Set scale 1 at the clip head and 2 at the
tail; scrub to three positions and assert the layer's computed transform differs
and increases monotonically — the model alone cannot prove the picture moved.
Then split the animated clip and assert both halves still animate. Then drag an
animated property's slider and assert it wrote a key rather than the static
field.

## Risks

| Risk                          | Why it is bigger than it looks                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slider vs. animation conflict | Dragging a slider on an animated clip must create a key. Get it wrong and the control silently does nothing; no model-level test sees it.              |
| Export parity                 | Export must resolve at its own `sourceTime`. Reading the static value reproduces the W6 bug exactly: a preview that animates and a file that does not. |
| Two transform readers         | Fixing one and missing the other ships a preview/export divergence. Deleting the duplicate comes first for this reason.                                |
| Split partitioning            | Silent data loss if a boundary key lands on neither side. Explicitly tested.                                                                           |

## Sequencing

1. **Pure module + resolution.** `keyframes.ts` with tests, delete the duplicate
   transform reader, thread `sourceTime` through both render paths. No UI —
   verifiable by unit tests plus an e2e that seeds keys through the store.
2. **Commands + Inspector.** The four commands, `SplitClipCommand` partitioning,
   diamonds and key stepping, and the slider-writes-a-key rule.
3. **Timeline lane.** Diamonds under the selected clip, drag to retime, easing
   menu.

Each chunk is independently shippable and independently revertable.
