# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Start dev server: `npm run dev`
- Open dev server in browser: `npm run dev -- --open`
- Build for production: `npm run build`
- Preview production build: `npm run preview`
- Lint code: `npm run lint`
- Format code: `npm run format`
- Run unit tests: `npm run test:unit`
- Run end-to-end tests: `npm run test:e2e`
- Run all tests: `npm run test`
- Check TypeScript and Svelte: `npm run check`

## Architecture

This is a SvelteKit video editor application with the following structure:

- **src/lib/**: Shared logic and UI components
  - **stores/**: Svelte stores managing application state (project, timeline, media, playback, UI, export)
  - **core/**: Core editor functionality (command processor, history, persistence)
  - **utils/**: Utility functions for media, timeline, and export operations
  - **features/**: UI features organized by concern (canvas, media bin, toolbar, timeline clips, export dialog)
  - **types/**: TypeScript interfaces and types (project configuration)

- **src/routes/**: SvelteKit page components and layout
  - **+layout.svelte**: Root layout containing the editor UI
  - **+page.svelte**: Main editor interface
  - **demo/**: Demonstration and testing pages

- **src/app.html**: HTML template for the application
- **src/main.ts**: Application entry point

The editor uses a command pattern for undo/redo functionality, with commands stored in `src/lib/core/commands/`. State is managed through Svelte stores, and UI components are built with Svelte and TailwindCSS.

## Key Files

- `src/lib/stores/project.svelte.ts`: Central project state
- `src/lib/core/commands/processor.ts`: Executes and manages editor commands
- `src/lib/features/timeline/Track.svelte`: Timeline track rendering
- `src/lib/features/canvas/Canvas.svelte`: Video preview canvas
- `src/lib/features/media/MediaBin.svelte`: Media library panel

## Development Notes

- TypeScript is used throughout; check types with `npm run check`
- TailwindCSS handles styling; modify `src/routes/layout.css` for global styles
- ESLint and Prettier enforce code style; run `npm run lint` and `npm run format`
- Unit tests use Vitest; end-to-end tests use Playwright
- Persistence uses IndexedDB via `src/lib/core/persistence/idbAdapter.ts`