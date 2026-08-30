# Color Grading Implementation Verification Plan

## 1. Compile Checks
- Run `npm run check` and verify 0 errors.

## 2. Unit Tests
- Run `npm run test:unit -- --run` and verify all tests pass.
- Specific unit tests for color grading should be added (see test files below).

## 3. Manual Verification Steps
### 3.1 UI Interaction
- Import a video clip into the media bin.
- Select the clip on the timeline.
- Verify the color grading panel appears in the Inspector.
### 3.2 Real-time Preview
- Drag the Exposure slider in the color grading panel.
- Verify the preview updates in real time (aim for < 16ms per frame).
- Repeat for other sliders (Contrast, Highlights, Shadows, Temperature, Tint, Saturation, Vibrance, Vignette, Grain).
### 3.3 Undo/Redo
- Make a color grade change.
- Press Ctrl+Z (Undo) and verify the change is reverted.
- Press Ctrl+Y (Redo) and verify the change is reapplied.
### 3.4 Export Match
- Export the video with color grading applied.
- Compare the exported file's appearance with the preview (using a frame-by-frame comparison tool or visual inspection).
### 3.5 WebGL2 Fallback
- Disable WebGL2 in the browser (or force fallback) and verify the color grading still works via CSS filters.
- Note: This may require a temporary flag or environment variable to trigger the fallback.

## Test Files
We will create the following unit test files to cover the color grading logic:

- `src/lib/core/rendering/__tests__/webglCompositor.test.ts`
- `src/lib/core/rendering/__tests__/colorGradeShader.test.ts` (if applicable, though shader testing is more complex)

We will also update the package.json to ensure the test script includes these new tests (though Vitest will automatically pick up files in __tests__ directories).