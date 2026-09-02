import type { Clip } from '$lib/types/project';

/**
 * The CSS transform for the preview, and the pure geometry behind the
 * viewport's move/scale/rotate handles.
 *
 * `clip.transform.x/y` are native sequence pixels — that is the contract
 * `layerCompositing.getLayerDrawRect` already uses for export. The preview
 * used to apply them as `translate(Npx, Npx)` on a layer sized to whatever the
 * stage happened to render at on screen, so the same stored value moved a
 * different visual distance depending on the window size, and disagreed with
 * the exported file the moment the stage wasn't exactly sequence-resolution
 * wide (which is always, since it's a responsive box). Expressing the offset
 * as a percentage fixes both: `translate(N%, N%)` is relative to the layer's
 * own box, which always exactly covers the visible frame, so the same
 * fraction of the frame renders the same way at any window size or sequence
 * resolution.
 *
 * Dependency-free (pattern C: type-only import) so this stays testable in the
 * node Vitest project without a DOM.
 */

export interface Point {
	x: number;
	y: number;
}

function toPercent(value: number, dimension: number): number {
	if (!dimension) return 0;
	return (value / dimension) * 100;
}

/** The CSS transform string for a layer div sized to exactly cover the frame. */
export function getLayerPreviewTransform(
	clip: Pick<Clip, 'transform'>,
	sequenceWidth: number,
	sequenceHeight: number
): string {
	const x = clip.transform?.x ?? 0;
	const y = clip.transform?.y ?? 0;
	const scale = clip.transform?.scale ?? 1;
	const rotation = clip.transform?.rotation ?? 0;

	const xPercent = toPercent(x, sequenceWidth);
	const yPercent = toPercent(y, sequenceHeight);

	return `translate(${xPercent}%, ${yPercent}%) scale(${scale}) rotate(${rotation}deg)`;
}

export interface TransformCorners {
	tl: Point;
	tr: Point;
	br: Point;
	bl: Point;
	center: Point;
	/** Above the top edge, for the rotate gesture. */
	rotateHandle: Point;
}

/** How far above the box the rotate handle floats, in stage pixels. */
const ROTATE_HANDLE_OFFSET = 28;

/**
 * The four corners, centre, and rotate-handle point of a clip's on-screen
 * box, in pixels relative to the stage's own top-left corner (0,0). The
 * caller positions a `position: fixed` overlay at the stage's real screen
 * offset and adds these directly — kept separate so this stays plain
 * arithmetic, with no notion of "the page" or "the viewport" to fake in a
 * test.
 */
export function getTransformCorners(
	clip: Pick<Clip, 'transform'>,
	stageWidth: number,
	stageHeight: number,
	sequenceWidth: number,
	sequenceHeight: number
): TransformCorners {
	const scale = clip.transform?.scale ?? 1;
	const rotation = clip.transform?.rotation ?? 0;
	const theta = (rotation * Math.PI) / 180;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);

	const centerX = stageWidth / 2 + (toPercent(clip.transform?.x ?? 0, sequenceWidth) / 100) * stageWidth;
	const centerY =
		stageHeight / 2 + (toPercent(clip.transform?.y ?? 0, sequenceHeight) / 100) * stageHeight;

	// A point at (localX, localY) relative to centre, before rotation.
	function place(localX: number, localY: number): Point {
		const sx = localX * scale;
		const sy = localY * scale;
		return {
			x: centerX + sx * cos - sy * sin,
			y: centerY + sx * sin + sy * cos
		};
	}

	const hw = stageWidth / 2;
	const hh = stageHeight / 2;

	return {
		tl: place(-hw, -hh),
		tr: place(hw, -hh),
		br: place(hw, hh),
		bl: place(-hw, hh),
		center: { x: centerX, y: centerY },
		rotateHandle: place(0, -hh - ROTATE_HANDLE_OFFSET / Math.max(scale, 0.0001))
	};
}

/**
 * A screen-space drag delta, converted to the native pixels `clip.transform`
 * is stored in.
 *
 * Position is always screen/frame-aligned — dragging moves the clip however
 * the mouse moves on screen, regardless of how the clip itself is rotated.
 * That matches every mainstream editor: only the object's appearance rotates
 * in place, never the meaning of "up" and "right" for the purpose of moving
 * it.
 */
export function moveDeltaToNative(
	dxScreen: number,
	dyScreen: number,
	stageWidth: number,
	stageHeight: number,
	sequenceWidth: number,
	sequenceHeight: number
): { dx: number; dy: number } {
	const scaleX = stageWidth ? sequenceWidth / stageWidth : 1;
	const scaleY = stageHeight ? sequenceHeight / stageHeight : 1;
	return { dx: dxScreen * scaleX, dy: dyScreen * scaleY };
}

/**
 * Uniform scale implied by dragging a corner handle from `origin` to
 * `pointer`, anchored on the box centre — matching the data model, which has
 * one `scale` number rather than independent x/y factors.
 *
 * Relative to where the drag *started*, not an absolute pointer-distance
 * mapping. A handle has some click forgiveness, so a real click rarely lands
 * pixel-exact on the corner; an absolute mapping would make the scale jump to
 * whatever distance you happened to click at, before the pointer had moved.
 * Anchoring on the origin distance means no movement yet is always no scale
 * change yet, however imprecisely the handle was grabbed.
 */
export function scaleFromPointer(
	center: Point,
	origin: Point,
	pointer: Point,
	originScale: number
): number {
	const originDist = Math.hypot(origin.x - center.x, origin.y - center.y);
	if (!originDist) return clampScale(originScale);

	const pointerDist = Math.hypot(pointer.x - center.x, pointer.y - center.y);
	return clampScale(originScale * (pointerDist / originDist));
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 20;

/** A scale of zero or less has no visual meaning; an unbounded one is a typo away from a frozen tab. */
export function clampScale(scale: number): number {
	if (!Number.isFinite(scale)) return 1;
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * The rotation, in degrees, that would place the rotate handle at `pointer`.
 * 0 is straight up; positive is clockwise, matching CSS `rotate()` and the
 * export path's `ctx.rotate()` (both clockwise-positive in a y-down
 * coordinate system), so a value from here can be written straight to
 * `clip.transform.rotation` without a sign flip anywhere downstream.
 */
export function rotationFromPointer(center: Point, pointer: Point): number {
	const dx = pointer.x - center.x;
	const dy = pointer.y - center.y;
	return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Pulls a rotation within `toleranceDeg` of a multiple of `incrementDeg` onto that multiple. */
export function snapAngle(deg: number, incrementDeg: number, toleranceDeg: number): number {
	// + 0 rather than the raw multiplication: -1 rounds to -0 * 15, and a
	// stored -0 is a value a future `rotation === 0` check would miss.
	const nearest = Math.round(deg / incrementDeg) * incrementDeg + 0;
	return Math.abs(deg - nearest) <= toleranceDeg ? nearest : deg;
}
