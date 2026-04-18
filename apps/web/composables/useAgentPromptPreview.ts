import { computed, ref, watch, type Ref } from 'vue';
import {
  AGENT_ROLE_SECTION,
  BASE_AGENT_PROMPT,
  buildBehaviorSection,
  buildConstraintsSection,
  buildJsonSchemaInstruction,
} from '@something-in-loop/shared';

export type PromptFormState = {
  personaMd?: string | null;
  isPersonaCustomized?: boolean;
  behavior?: Record<string, unknown>;
  form?: {
    pairs?: string[];
    maxPositionSizePct?: number;
    maxOpenPositions?: number;
    stopLossPct?: number;
    takeProfitPct?: number;
  };
  restorePersona?: () => void;
  behaviorMd?: string | null;
  isBehaviorCustomized?: boolean;
  restoreBehavior?: () => void;
  roleMd?: string | null;
  isRoleCustomized?: boolean;
  restoreRole?: () => void;
};

type DiffOp = 'equal' | 'insert' | 'delete';

const MARKET_DATA_PLACEHOLDER = `## Portfolio State
Balance: $N/A USDC
Open positions: N/A of N/A max
Max per trade: N/A
Daily P&L: N/A
Total P&L: N/A

## Market Data
### <PAIR>
Price: N/A
5m change: N/A
1h change: N/A
6h change: N/A
24h change: N/A
Volume 24h: N/A
Liquidity: N/A
Short-term (48h hourly):
N/A

## Recent Decisions (last N)
No recent decisions`;

function buildConstraintsFromForm(form: PromptFormState) {
  return buildConstraintsSection({
    pairs: form.form?.pairs ?? [],
    maxPositionSizePct: form.form?.maxPositionSizePct ?? 2,
    maxOpenPositions: form.form?.maxOpenPositions ?? 3,
    stopLossPct: form.form?.stopLossPct ?? 2,
    takeProfitPct: form.form?.takeProfitPct ?? 3,
  });
}

function diffLines(previous: string, next: string): Array<{ op: DiffOp; line: string }> {
  const a = previous.split('\n');
  const b = next.split('\n');
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const output: Array<{ op: DiffOp; line: string }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      output.push({ op: 'equal', line: a[i]! });
      i++;
      j++;
      continue;
    }
    if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      output.push({ op: 'delete', line: a[i]! });
      i++;
    } else {
      output.push({ op: 'insert', line: b[j]! });
      j++;
    }
  }

  while (i < a.length) output.push({ op: 'delete', line: a[i++]! });
  while (j < b.length) output.push({ op: 'insert', line: b[j++]! });
  return output;
}

function escapeHtmlPlain(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function useAgentPromptPreview(options: {
  formRef: Ref<PromptFormState | null | undefined>;
  marketDataPreviewText: Ref<string | undefined>;
  fallbackEditableSetup: Ref<string | undefined>;
  initiallyExpanded?: Ref<boolean | undefined>;
}) {
  const showMdPreview = ref(false);
  const showSetupDiff = ref(false);
  const promptPreviewExpanded = ref(options.initiallyExpanded?.value ?? true);
  const systemExpanded = ref(false);
  const marketDataExpanded = ref(false);
  const setupExpanded = ref(true);
  const editingSetup = ref(false);
  const editPersonaText = ref('');
  const editBehaviorText = ref('');
  const editRoleText = ref('');

  const formState = computed(() => options.formRef.value ?? null);
  const canEditSetup = computed(() => !!formState.value);

  const liveSystemPrompt = computed(() => BASE_AGENT_PROMPT + buildJsonSchemaInstruction());
  const marketDataPreview = computed(() => options.marketDataPreviewText.value?.trim() || MARKET_DATA_PLACEHOLDER);

  const liveBehaviorSection = computed(() => {
    const form = formState.value;
    if (!form) return '';
    return buildBehaviorSection(form.behavior as any);
  });

  const liveConstraintsSection = computed(() => {
    const form = formState.value;
    if (!form) return '';
    return buildConstraintsFromForm(form);
  });

  const liveEditableSetup = computed(() => {
    const form = formState.value;
    if (!form) return options.fallbackEditableSetup.value?.trim() || '';

    const roleSection = form.isRoleCustomized && form.roleMd ? form.roleMd : AGENT_ROLE_SECTION;
    const behaviorSection = form.isBehaviorCustomized && form.behaviorMd
      ? form.behaviorMd
      : buildBehaviorSection(form.behavior as any);
    const personaSection = form.personaMd ? `## Your Persona\n${form.personaMd}` : '';
    const constraintsSection = buildConstraintsFromForm(form);

    return [roleSection, behaviorSection, personaSection, constraintsSection].filter(Boolean).join('\n\n');
  });

  const isPersonaCustomized = computed(() => formState.value?.isPersonaCustomized ?? false);
  const isBehaviorCustomized = computed(() => formState.value?.isBehaviorCustomized ?? false);
  const isRoleCustomized = computed(() => formState.value?.isRoleCustomized ?? false);

  const setupChanged = computed(() => {
    const previous = options.fallbackEditableSetup.value?.trim() || '';
    const current = liveEditableSetup.value.trim();
    return previous.length > 0 && previous !== current;
  });

  watch(setupChanged, (changed) => {
    if (!changed) showSetupDiff.value = false;
  });

  function startEditingSetup() {
    const form = formState.value;
    if (!form) return;
    editPersonaText.value = form.personaMd ?? '';
    editBehaviorText.value = form.behaviorMd || liveBehaviorSection.value;
    editRoleText.value = form.roleMd || AGENT_ROLE_SECTION;
    editingSetup.value = true;
  }

  function stopEditingSetup() {
    editingSetup.value = false;
  }

  function updatePersonaText(value: string) {
    const form = formState.value;
    editPersonaText.value = value;
    if (form) {
      form.personaMd = value;
      form.isPersonaCustomized = true;
    }
  }

  function resetPersona() {
    const form = formState.value;
    if (!form?.restorePersona) return;
    form.restorePersona();
    editPersonaText.value = form.personaMd ?? '';
  }

  function updateBehaviorText(value: string) {
    const form = formState.value;
    editBehaviorText.value = value;
    if (form) {
      form.behaviorMd = value;
      form.isBehaviorCustomized = true;
    }
  }

  function resetBehavior() {
    const form = formState.value;
    if (!form?.restoreBehavior) return;
    form.restoreBehavior();
    editBehaviorText.value = liveBehaviorSection.value;
  }

  function updateRoleText(value: string) {
    const form = formState.value;
    editRoleText.value = value;
    if (form) {
      form.roleMd = value;
      form.isRoleCustomized = true;
    }
  }

  function resetRole() {
    const form = formState.value;
    if (!form?.restoreRole) return;
    form.restoreRole();
    editRoleText.value = AGENT_ROLE_SECTION;
  }

  const setupDiffHtml = computed(() => {
    const previous = options.fallbackEditableSetup.value?.trim() || '';
    const current = liveEditableSetup.value.trim();
    if (!previous || previous === current) return '';

    return diffLines(previous, current)
      .map((part) => {
        const safe = escapeHtmlPlain(part.line);
        if (part.op === 'insert') return `<span class="diff-line diff-line--add">${safe}</span>`;
        if (part.op === 'delete') return `<span class="diff-line diff-line--del">${safe}</span>`;
        return `<span class="diff-line diff-line--eq">${safe}</span>`;
      })
      .join('\n');
  });

  return {
    canEditSetup,
    editBehaviorText,
    editPersonaText,
    editRoleText,
    editingSetup,
    isBehaviorCustomized,
    isPersonaCustomized,
    isRoleCustomized,
    liveConstraintsSection,
    liveEditableSetup,
    liveSystemPrompt,
    marketDataExpanded,
    marketDataPreview,
    promptPreviewExpanded,
    resetBehavior,
    resetPersona,
    resetRole,
    setupChanged,
    setupDiffHtml,
    setupExpanded,
    showMdPreview,
    showSetupDiff,
    startEditingSetup,
    stopEditingSetup,
    systemExpanded,
    updateBehaviorText,
    updatePersonaText,
    updateRoleText,
  };
}
