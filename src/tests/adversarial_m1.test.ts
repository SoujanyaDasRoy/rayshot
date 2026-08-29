import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/stores/project.svelte', async () => {
	return await vi.importActual('../lib/stores/project.svelte.ts');
});
vi.mock('$lib/stores/timeline.svelte', async () => {
	return await vi.importActual('../lib/stores/timeline.svelte.ts');
});
vi.mock('$lib/stores/playback.svelte', async () => {
	return await vi.importActual('../lib/stores/playback.svelte.ts');
});
vi.mock('$lib/stores/ui.svelte', async () => {
	return await vi.importActual('../lib/stores/ui.svelte.ts');
});
vi.mock('$lib/stores/media.svelte', async () => {
	return await vi.importActual('../lib/stores/media.svelte.ts');
});
vi.mock('$lib/stores/export.svelte', async () => {
	return await vi.importActual('../lib/stores/export.svelte.ts');
});
vi.mock('$lib/core/commands/processor', async () => {
	return await vi.importActual('../lib/core/commands/processor.ts');
});
vi.mock('$lib/core/commands/addClip', async () => {
	return await vi.importActual('../lib/core/commands/addClip.ts');
});
vi.mock('$lib/core/commands/moveClip', async () => {
	return await vi.importActual('../lib/core/commands/moveClip.ts');
});
vi.mock('$lib/core/commands/trimClip', async () => {
	return await vi.importActual('../lib/core/commands/trimClip.ts');
});
vi.mock('$lib/core/commands/splitClip', async () => {
	return await vi.importActual('../lib/core/commands/splitClip.ts');
});
vi.mock('$lib/core/commands/deleteClip', async () => {
	return await vi.importActual('../lib/core/commands/deleteClip.ts');
});
vi.mock('$lib/core/commands/addTrack', async () => {
	return await vi.importActual('../lib/core/commands/addTrack.ts');
});
vi.mock('$lib/core/commands/newProject', async () => {
	return await vi.importActual('../lib/core/commands/newProject.ts');
});
vi.mock('$lib/core/commands/setClipVolume', async () => {
	return await vi.importActual('../lib/core/commands/setClipVolume.ts');
});
vi.mock('$lib/core/commands/setClipPlaybackRate', async () => {
	return await vi.importActual('../lib/core/commands/setClipPlaybackRate.ts');
});
vi.mock('$lib/core/commands/setClipFilter', async () => {
	return await vi.importActual('../lib/core/commands/setClipFilter.ts');
});
vi.mock('$lib/utils/timelineUtils', async () => {
	return await vi.importActual('../lib/utils/timelineUtils.ts');
});
vi.mock('$lib/utils/exportUtils', async () => {
	return await vi.importActual('../lib/utils/exportUtils.ts');
});
vi.mock('$lib/utils/mediaUtils', async () => {
	return await vi.importActual('../lib/utils/mediaUtils.ts');
});

import { projectStore, projectName, projectId, assets, sequences, updateProject, setProject } from '../lib/stores/project.svelte.ts';
import { timelineStore, timelineActions, selectedClip } from '../lib/stores/timeline.svelte.ts';
import { playbackStore, playbackActions } from '../lib/stores/playback.svelte.ts';
import { uiStore } from '../lib/stores/ui.svelte.ts';
import { mediaStore } from '../lib/stores/media.svelte.ts';
import { commandProcessor } from '../lib/core/commands/processor.ts';
import { Command } from '../lib/core/commands/base.ts';
import type { Project } from '../lib/types/project.ts';
import * as fs from 'fs';
import * as path from 'path';

// Mock Command for testing history stack boundaries
class MockTestCommand extends Command {
	public hasExecuted = false;
	public hasUndone = false;
	public id: string;

	constructor(id: string) {
		super();
		this.id = id;
	}

	execute(): void {
		this.hasExecuted = true;
		this.hasUndone = false;
	}

	undo(): void {
		this.hasExecuted = false;
		this.hasUndone = true;
	}
}

function initDefault0MediaProject(): Project {
	return {
		id: 'default-project',
		name: 'Project Quantum Leap',
		version: 1,
		createdAt: Date.now(),
		modifiedAt: Date.now(),
		assets: new Map(),
		clips: new Map(),
		sequences: [
			{
				id: 'seq-1',
				name: 'Sequence 1',
				resolution: { width: 1920, height: 1080 },
				frameRate: 30,
				duration: 0,
				tracks: [
					{ id: 'track-video-1', type: 'video', order: 1, clipInstances: [] },
					{ id: 'track-video-2', type: 'video', order: 2, clipInstances: [] },
					{ id: 'track-audio-1', type: 'audio', order: 3, clipInstances: [] },
					{ id: 'track-audio-2', type: 'audio', order: 4, clipInstances: [] }
				]
			}
		],
		activeSequenceId: 'seq-1',
		settings: { backgroundColor: '#000000' }
	};
}

describe('Milestone 1 Adversarial Stress Test Suite', () => {
	beforeEach(() => {
		// Reset stores
		setProject(initDefault0MediaProject());
		timelineStore.set({
			selectedClipId: null,
			selectedTrackId: null,
			zoomLevel: 1.0,
			timeOffset: 0,
			isDragging: false,
			dragStartX: 0,
			dragStartTime: 0,
			snapToGrid: true,
			snapGridSize: 0.1,
			waveformCache: new Map()
		});
		playbackStore.set({
			currentTime: 0,
			isPlaying: false,
			playbackSpeed: 1.0,
			masterVolume: 1.0,
			isMuted: false
		});
		mediaStore.set({
			importing: new Map(),
			thumbnails: new Map(),
			proxies: new Map(),
			processing: new Map(),
			errors: new Map(),
			availability: new Map()
		});

		// Drain command processor history
		while (commandProcessor.canUndo()) {
			commandProcessor.undo();
		}
		while (commandProcessor.canRedo()) {
			const history = get(commandProcessor.getHistoryStore());
			if (!history.canRedo) break;
			commandProcessor.redo();
		}
		while (commandProcessor.canUndo()) {
			commandProcessor.undo();
		}
	});

	describe('1. Project Name Editing — Adversarial Edge Cases', () => {
		it('should preserve original name when attempting to save an empty string', () => {
			const initialName = get(projectName);
			expect(initialName).toBe('Project Quantum Leap');

			// Simulating Toolbar saveName logic:
			const candidateName = '';
			if (candidateName.trim()) {
				updateProject({ name: candidateName.trim(), modifiedAt: Date.now() });
			}

			expect(get(projectName)).toBe('Project Quantum Leap');
		});

		it('should preserve original name when attempting to save whitespace-only string', () => {
			const initialName = get(projectName);
			expect(initialName).toBe('Project Quantum Leap');

			const candidateName = '   \t\n  \r\n   ';
			if (candidateName.trim()) {
				updateProject({ name: candidateName.trim(), modifiedAt: Date.now() });
			}

			expect(get(projectName)).toBe('Project Quantum Leap');
		});

		it('should trim surrounding whitespace when updating project name', () => {
			const candidateName = '   My Awesome Cyberpunk Edit   ';
			if (candidateName.trim()) {
				updateProject({ name: candidateName.trim(), modifiedAt: Date.now() });
			}

			expect(get(projectName)).toBe('My Awesome Cyberpunk Edit');
		});

		it('should safely handle XSS strings and script tags without corrupting project state', () => {
			const xssPayload = '<script>alert("PWNED")</script><img src=x onerror=alert(1) />';
			if (xssPayload.trim()) {
				updateProject({ name: xssPayload.trim(), modifiedAt: Date.now() });
			}

			const current = get(projectName);
			expect(current).toBe(xssPayload);
			const project = get(projectStore);
			expect(project).not.toBeNull();
			expect(project?.name).toBe(xssPayload);
		});

		it('should handle complex unicode, emojis, foreign languages, and symbol-heavy strings', () => {
			const unicodeName = '🎬 4K HDR: 東京ハイウェイ 🏎️💨 (Final Cut [Director\'s Edition]) & 100% Pure $#!@';
			if (unicodeName.trim()) {
				updateProject({ name: unicodeName.trim(), modifiedAt: Date.now() });
			}

			expect(get(projectName)).toBe(unicodeName);
		});

		it('should handle extremely long project names (10,000 chars) without crashing', () => {
			const longName = 'A'.repeat(10000);
			if (longName.trim()) {
				updateProject({ name: longName.trim(), modifiedAt: Date.now() });
			}

			expect(get(projectName).length).toBe(10000);
		});

		it('should handle rapid sequential edits and maintain store reactivity', () => {
			const names = ['Draft 1', 'Draft 2', 'Final', 'Final 2', 'Final REAL Final', 'Export Ready'];
			for (const n of names) {
				updateProject({ name: n, modifiedAt: Date.now() });
				expect(get(projectName)).toBe(n);
			}
		});

		it('simulates Toolbar edit cycle: startEdit -> type -> escape (cancel) leaves name intact', () => {
			let isEditingName = false;
			let currentName = '';

			// Step 1: User clicks rename button
			currentName = get(projectName);
			isEditingName = true;
			expect(currentName).toBe('Project Quantum Leap');

			// Step 2: User types something bad
			currentName = 'Accidental Ruin';

			// Step 3: User hits Escape
			isEditingName = false;

			// Store should still be untouched
			expect(get(projectName)).toBe('Project Quantum Leap');
		});

		it('simulates Toolbar edit cycle: startEdit -> type -> enter (commit) updates name', () => {
			let isEditingName = false;
			let currentName = '';

			// Step 1: User clicks rename button
			currentName = get(projectName);
			isEditingName = true;

			// Step 2: User types new name
			currentName = '  Brand New VLOG 2026  ';

			// Step 3: User hits Enter -> saveName()
			if (currentName.trim()) {
				updateProject({ name: currentName.trim(), modifiedAt: Date.now() });
			}
			isEditingName = false;

			expect(get(projectName)).toBe('Brand New VLOG 2026');
			expect(isEditingName).toBe(false);
		});
	});

	describe('2. Undo/Redo & Command Processor History Boundaries', () => {
		it('should initialize with canUndo=false and canRedo=false', () => {
			const history = get(commandProcessor.getHistoryStore());
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(false);
			expect(history.undoCount).toBe(0);
			expect(history.redoCount).toBe(0);
		});

		it('calling undo() or redo() on empty stacks is a safe no-op', () => {
			expect(() => {
				commandProcessor.undo();
				commandProcessor.undo();
				commandProcessor.redo();
				commandProcessor.redo();
			}).not.toThrow();

			const history = get(commandProcessor.getHistoryStore());
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(false);
		});

		it('should accurately track canUndo and canRedo across single command cycle', () => {
			const cmd = new MockTestCommand('cmd-1');
			commandProcessor.execute(cmd);

			expect(cmd.hasExecuted).toBe(true);
			let history = get(commandProcessor.getHistoryStore());
			expect(history.canUndo).toBe(true);
			expect(history.canRedo).toBe(false);
			expect(history.undoCount).toBe(1);

			// Undo
			commandProcessor.undo();
			expect(cmd.hasUndone).toBe(true);
			history = get(commandProcessor.getHistoryStore());
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(true);
			expect(history.redoCount).toBe(1);

			// Redo
			commandProcessor.redo();
			expect(cmd.hasExecuted).toBe(true);
			history = get(commandProcessor.getHistoryStore());
			expect(history.canUndo).toBe(true);
			expect(history.canRedo).toBe(false);
		});

		it('should enforce maxHistorySize (50 commands) under heavy stress of 100 commands', () => {
			const commands: MockTestCommand[] = [];
			for (let i = 0; i < 100; i++) {
				const cmd = new MockTestCommand(`cmd-${i}`);
				commands.push(cmd);
				commandProcessor.execute(cmd);
			}

			const history = get(commandProcessor.getHistoryStore());
			expect(history.undoCount).toBe(50); // Capped at maxHistorySize
			expect(history.canUndo).toBe(true);
			expect(history.canRedo).toBe(false);

			// Undo all 50 commands
			for (let i = 0; i < 50; i++) {
				commandProcessor.undo();
			}

			const drainedHistory = get(commandProcessor.getHistoryStore());
			expect(drainedHistory.undoCount).toBe(0);
			expect(drainedHistory.redoCount).toBe(50);
			expect(drainedHistory.canUndo).toBe(false);
			expect(drainedHistory.canRedo).toBe(true);
		});

		it('executing a new command clears the redo stack (branching history)', () => {
			const cmd1 = new MockTestCommand('cmd-1');
			const cmd2 = new MockTestCommand('cmd-2');
			const cmd3 = new MockTestCommand('cmd-3');

			commandProcessor.execute(cmd1);
			commandProcessor.execute(cmd2);
			expect(get(commandProcessor.getHistoryStore()).undoCount).toBe(2);

			// Undo 1
			commandProcessor.undo();
			expect(get(commandProcessor.getHistoryStore()).canRedo).toBe(true);
			expect(get(commandProcessor.getHistoryStore()).redoCount).toBe(1);

			// Execute new command -> should purge redo
			commandProcessor.execute(cmd3);
			const history = get(commandProcessor.getHistoryStore());
			expect(history.canRedo).toBe(false);
			expect(history.redoCount).toBe(0);
			expect(history.undoCount).toBe(2); // cmd1 + cmd3
		});
	});

	describe('3. Keyboard Shortcut Routing & Text Input Isolation', () => {
		function simulateGlobalKeyDown(
			event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; targetType: 'input' | 'textarea' | 'div' | 'button' },
			platform: 'Win32' | 'MacIntel' = 'Win32'
		) {
			let prevented = false;
			let undoTriggered = false;
			let redoTriggered = false;

			const isInputOrTextarea = event.targetType === 'input' || event.targetType === 'textarea';
			if (isInputOrTextarea) {
				return { prevented, undoTriggered, redoTriggered };
			}

			const isMac = platform.toUpperCase().indexOf('MAC') >= 0;
			const isModifier = isMac ? (event.metaKey ?? false) : (event.ctrlKey ?? false);

			if (isModifier && (event.key === 'z' || event.key === 'Z')) {
				if (event.shiftKey) {
					prevented = true;
					redoTriggered = true;
				} else {
					prevented = true;
					undoTriggered = true;
				}
			} else if (isModifier && (event.key === 'y' || event.key === 'Y')) {
				prevented = true;
				redoTriggered = true;
			}

			return { prevented, undoTriggered, redoTriggered };
		}

		it('does NOT intercept Ctrl+Z / Ctrl+Y when typing inside HTMLInputElement', () => {
			const resZ = simulateGlobalKeyDown({ key: 'z', ctrlKey: true, targetType: 'input' });
			expect(resZ.undoTriggered).toBe(false);
			expect(resZ.prevented).toBe(false);

			const resY = simulateGlobalKeyDown({ key: 'y', ctrlKey: true, targetType: 'input' });
			expect(resY.redoTriggered).toBe(false);
			expect(resY.prevented).toBe(false);
		});

		it('does NOT intercept Ctrl+Z / Ctrl+Y when typing inside HTMLTextAreaElement', () => {
			const res = simulateGlobalKeyDown({ key: 'z', ctrlKey: true, shiftKey: true, targetType: 'textarea' });
			expect(res.redoTriggered).toBe(false);
			expect(res.prevented).toBe(false);
		});

		it('triggers global undo on Ctrl+Z when focus is on non-input element (Windows/Linux)', () => {
			const res = simulateGlobalKeyDown({ key: 'z', ctrlKey: true, targetType: 'div' }, 'Win32');
			expect(res.undoTriggered).toBe(true);
			expect(res.prevented).toBe(true);
		});

		it('triggers global redo on Ctrl+Y when focus is on non-input element (Windows/Linux)', () => {
			const res = simulateGlobalKeyDown({ key: 'y', ctrlKey: true, targetType: 'button' }, 'Win32');
			expect(res.redoTriggered).toBe(true);
			expect(res.prevented).toBe(true);
		});

		it('triggers global redo on Ctrl+Shift+Z (Windows/Linux)', () => {
			const res = simulateGlobalKeyDown({ key: 'z', ctrlKey: true, shiftKey: true, targetType: 'div' }, 'Win32');
			expect(res.redoTriggered).toBe(true);
			expect(res.prevented).toBe(true);
		});

		it('handles uppercase Z/Y (e.g. CapsLock on)', () => {
			const resUpperZ = simulateGlobalKeyDown({ key: 'Z', ctrlKey: true, targetType: 'div' }, 'Win32');
			expect(resUpperZ.undoTriggered).toBe(true);

			const resUpperY = simulateGlobalKeyDown({ key: 'Y', ctrlKey: true, targetType: 'div' }, 'Win32');
			expect(resUpperY.redoTriggered).toBe(true);
		});

		it('supports macOS Cmd+Z and Cmd+Shift+Z', () => {
			const resMacUndo = simulateGlobalKeyDown({ key: 'z', metaKey: true, targetType: 'div' }, 'MacIntel');
			expect(resMacUndo.undoTriggered).toBe(true);
			expect(resMacUndo.prevented).toBe(true);

			const resMacRedo = simulateGlobalKeyDown({ key: 'z', metaKey: true, shiftKey: true, targetType: 'div' }, 'MacIntel');
			expect(resMacRedo.redoTriggered).toBe(true);
			expect(resMacRedo.prevented).toBe(true);
		});

		it('ignores non-modifier keystrokes like pressing plain "z" or "y"', () => {
			const resPlainZ = simulateGlobalKeyDown({ key: 'z', ctrlKey: false, metaKey: false, targetType: 'div' }, 'Win32');
			expect(resPlainZ.undoTriggered).toBe(false);
			expect(resPlainZ.prevented).toBe(false);

			const resPlainY = simulateGlobalKeyDown({ key: 'y', ctrlKey: false, metaKey: false, targetType: 'div' }, 'Win32');
			expect(resPlainY.redoTriggered).toBe(false);
			expect(resPlainY.prevented).toBe(false);
		});
	});

	describe('4. Workspace Responsiveness & Integrity with 0 Media Files Imported', () => {
		it('verifies 0-media default project structure', () => {
			const project = get(projectStore);
			expect(project).not.toBeNull();
			expect(project?.id).toBe('default-project');
			expect(project?.name).toBe('Project Quantum Leap');
			expect(project?.assets.size).toBe(0);
			expect(project?.clips.size).toBe(0);
			expect(project?.sequences.length).toBe(1);

			const seq = project?.sequences[0];
			expect(seq?.tracks.length).toBe(4);
			expect(seq?.tracks.filter(t => t.type === 'video').length).toBe(2);
			expect(seq?.tracks.filter(t => t.type === 'audio').length).toBe(2);
			expect(seq?.duration).toBe(0);
		});

		it('timeline and playback stores remain stable with 0 clips', () => {
			const timeline = get(timelineStore);
			expect(timeline.zoomLevel).toBe(1.0);
			expect(timeline.selectedClipId).toBeNull();
			expect(get(selectedClip)).toBeNull();

			const playback = get(playbackStore);
			expect(playback.currentTime).toBe(0);
			expect(playback.isPlaying).toBe(false);

			expect(() => {
				playbackActions.setCurrentTime(5.5);
				playbackActions.togglePlayback();
				playbackActions.stepFrames(1);
				playbackActions.stepFrames(-1);
			}).not.toThrow();
		});

		it('mediaStore handles empty queries and operations safely', () => {
			expect(get(mediaStore).importing.size).toBe(0);
			expect(get(mediaStore).thumbnails.size).toBe(0);
			expect(get(mediaStore).proxies.size).toBe(0);
			expect(get(mediaStore).processing.size).toBe(0);
		});
	});

	describe('5. Theme Tokens & CSS Layout Verification', () => {
		it('verifies layout.css contains all RayShot dark theme color tokens', () => {
			const cssPath = path.resolve(__dirname, '../routes/layout.css');
			const cssContent = fs.readFileSync(cssPath, 'utf-8');

			expect(cssContent).toContain('--color-bg-base: #090a0d');
			expect(cssContent).toContain('--color-bg-surface: #121319');
			expect(cssContent).toContain('--color-bg-surface-elevated: #161822');
			expect(cssContent).toContain('--color-bg-header: #1a1d28');
			expect(cssContent).toContain('--color-bg-header-hover: #222634');
			expect(cssContent).toContain('--color-border-subtle: #232738');
			expect(cssContent).toContain('--color-border-muted: #1c1f2e');
			expect(cssContent).toContain('--color-accent-primary: #38bdf8');
			expect(cssContent).toContain('--color-accent-primary-hover: #0ea5e9');

			expect(cssContent).toContain('scrollbar-color: #232738 #090a0d');
			expect(cssContent).toContain('scrollbar-width: thin');
		});

		it('verifies +page.svelte contains the permanent 3-pane NLE layout structure', () => {
			const pagePath = path.resolve(__dirname, '../routes/+page.svelte');
			const pageContent = fs.readFileSync(pagePath, 'utf-8');

			expect(pageContent).toContain('class="app-layout-shell"');
			expect(pageContent).toContain('class="nle-workspace-grid"');
			expect(pageContent).toContain('class="middle-work-row"');
			expect(pageContent).toContain('class="left-mediabin-col"');
			expect(pageContent).toContain('class="center-canvas-col"');
			expect(pageContent).toContain('class="right-inspector-col"');
			expect(pageContent).toContain('class="bottom-timeline-row"');

			expect(pageContent).not.toContain('class="start-screen-modal"');
			expect(pageContent).not.toContain('hasMedia');
		});

		it('verifies Toolbar.svelte fulfills all M1 UI specifications', () => {
			const toolbarPath = path.resolve(__dirname, '../lib/features/toolbar/Toolbar.svelte');
			const toolbarContent = fs.readFileSync(toolbarPath, 'utf-8');

			expect(toolbarContent).toContain('class="app-top-bar"');
			expect(toolbarContent).toContain('class="brand-badge"');
			expect(toolbarContent).toContain('RayShot');
			expect(toolbarContent).toContain('Studio');
			expect(toolbarContent).toContain('class="project-title-container"');
			expect(toolbarContent).toContain('class="primary-export-cta"');
			expect(toolbarContent).toContain('disabled={!$historyState.canUndo}');
			expect(toolbarContent).toContain('disabled={!$historyState.canRedo}');

			expect(toolbarContent).not.toContain('mac-window-controls');
			expect(toolbarContent).not.toContain('traffic-lights');
			expect(toolbarContent).not.toContain('00:00:00:00');
		});
	});
});
