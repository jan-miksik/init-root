import { parse as markedParse } from 'marked';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

export function renderMarkdown(text: string): string {
  try {
    return markedParse(text, { async: false }) as string;
  } catch {
    return escapeHtml(text);
  }
}

export function sectionHtml(text: string, markdownEnabled: boolean): string {
  return markdownEnabled ? renderMarkdown(text) : escapeHtml(text);
}
