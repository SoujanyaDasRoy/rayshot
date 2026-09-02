import { describe, test, expect } from 'vitest';
import { sanitizeExportFilename } from '../exportUtils';

describe('sanitizeExportFilename', () => {
	test('keeps a already-safe name', () => {
		expect(sanitizeExportFilename('my_export-01')).toBe('my_export-01');
	});

	test('replaces characters a filesystem would object to', () => {
		expect(sanitizeExportFilename('My Film: Final/Cut?')).toBe('my_film__final_cut');
	});

	test('falls back rather than producing an empty or dot-only filename', () => {
		expect(sanitizeExportFilename('')).toBe('rayshot_export');
		expect(sanitizeExportFilename('///')).toBe('rayshot_export');
	});
});
