import { describe, expect, test } from 'bun:test';
import { pathFile } from '../../../src/lib/files/pathCategory';

describe('pathFile', () => {
  test('an own file takes its category from its extension, as category_of does', () => {
    expect(pathFile('courses/X/Week 3.notebook')).toEqual({ category: 'notebook', filename: 'Week 3.notebook' });
    expect(pathFile('courses/X/Board.whiteboard')).toEqual({ category: 'whiteboard', filename: 'Board.whiteboard' });
    expect(pathFile('courses/X/Exam prep/Notes.md')).toEqual({ category: 'document', filename: 'Notes.md' });
  });

  test("an agents' file takes its category from its extension too, not from the state folder it is in", () => {
    expect(pathFile('.oculus/agents/outputs/summary.md')).toEqual({ category: 'document', filename: 'summary.md' });
    expect(pathFile('.oculus/agents/outputs/plot.png')).toEqual({ category: 'upload', filename: 'plot.png' });
    expect(pathFile('.oculus/agents/attachments/20261120-063301-0a1b2c3d.pdf')).toEqual({
      category: 'upload',
      filename: '20261120-063301-0a1b2c3d.pdf',
    });
    expect(pathFile('courses/X/.oculus/derived/a.pages.json').category).toBe('other');
  });
});
