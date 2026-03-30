import type { ManagerAction, ManagerDecision } from './types.js';

const VALID_ACTIONS: ManagerAction[] = [
  'create_agent',
  'start_agent',
  'pause_agent',
  'modify_agent',
  'terminate_agent',
  'hold',
];

/** Find the index of the bracket/brace that closes the one opened at `openIdx`. */
function findClosingBracket(str: string, openIdx: number): number {
  const open = str[openIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) {
      if (--depth === 0) return i;
    }
  }
  return -1;
}

function normaliseParsed(items: unknown[]): ManagerDecision[] {
  return items
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && VALID_ACTIONS.includes((d as any).action))
    .map((d) => ({
      action: d.action as ManagerAction,
      agentId: typeof d.agentId === 'string' ? d.agentId : undefined,
      params: d.params && typeof d.params === 'object' ? (d.params as Record<string, unknown>) : undefined,
      reasoning: typeof d.reasoning === 'string' ? d.reasoning : '',
    }));
}

function computeAutoClosings(prefix: string): string | null {
  const stack: Array<'[' | '{'> = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '[' || ch === '{') stack.push(ch);
    if (ch === ']' || ch === '}') {
      const expected: '[' | '{' = ch === ']' ? '[' : '{';
      if (stack.length === 0 || stack[stack.length - 1] !== expected) return null;
      stack.pop();
    }
  }

  if (inString) return null;

  let closings = '';
  for (let i = stack.length - 1; i >= 0; i--) {
    closings += stack[i] === '[' ? ']' : '}';
  }
  return closings;
}

function tryRepairTruncatedJsonArray(arraySlice: string): unknown[] | null {
  const slice = arraySlice.trimEnd();
  if (!slice.trimStart().startsWith('[')) return null;

  const cutPoints: number[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === ',' || ch === '}' || ch === ']') cutPoints.push(i);
  }

  const candidates = cutPoints.slice(-80).reverse();
  for (const idx of candidates) {
    const ch = slice[idx];
    let prefix = ch === ',' ? slice.slice(0, idx) : slice.slice(0, idx + 1);
    prefix = prefix.trimEnd();
    if (!prefix) continue;

    const closings = computeAutoClosings(prefix);
    if (!closings) continue;
    try {
      const parsed = JSON.parse(prefix + closings);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // keep trying
    }
  }

  const closings = computeAutoClosings(slice);
  if (!closings) return null;
  try {
    const parsed = JSON.parse(slice + closings);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Strip reasoning tags and extract JSON array (or single object) from LLM response */
export function parseManagerDecisions(raw: string): ManagerDecision[] {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/s);
  if (fenced) cleaned = fenced[1].trim();

  const arrStart = cleaned.indexOf('[');
  if (arrStart !== -1) {
    const arrEnd = findClosingBracket(cleaned, arrStart);
    if (arrEnd !== -1) {
      try {
        const parsed = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
        if (Array.isArray(parsed)) {
          const decisions = normaliseParsed(parsed);
          if (decisions.length > 0) return decisions;
        }
      } catch {
        const repaired = tryRepairTruncatedJsonArray(cleaned.slice(arrStart, arrEnd + 1));
        if (repaired) {
          const decisions = normaliseParsed(repaired);
          if (decisions.length > 0) return decisions;
        }
      }
    } else {
      const repaired = tryRepairTruncatedJsonArray(cleaned.slice(arrStart));
      if (repaired) {
        const decisions = normaliseParsed(repaired);
        if (decisions.length > 0) return decisions;
      }
    }
  }

  const objStart = cleaned.indexOf('{');
  if (objStart !== -1) {
    const objEnd = findClosingBracket(cleaned, objStart);
    if (objEnd !== -1) {
      try {
        const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
        const decisions = normaliseParsed([parsed]);
        if (decisions.length > 0) return decisions;
      } catch {
        // fall through
      }
    }
  }

  return [];
}
