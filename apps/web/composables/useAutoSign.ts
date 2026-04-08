import { computed, ref } from 'vue';

const PREFS_KEY = 'heppy:autosign:prefs';
const DISMISSED_KEY = 'heppy:autosign:dismissed';
const ENABLED_FIELD = 'enabled';
const DISMISSED_FIELD = 'dismissed';

function readStorage(key: string): Record<string, boolean> {
  if (!import.meta.client) return {};
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeStorage(key: string, val: Record<string, boolean>): void {
  if (!import.meta.client) return;
  localStorage.setItem(key, JSON.stringify(val));
}

// Module-level singleton state — all callers share the same reactive refs
const prefs = ref<Record<string, boolean>>(readStorage(PREFS_KEY));
const dismissed = ref<Record<string, boolean>>(readStorage(DISMISSED_KEY));

export function useAutoSign() {
  // Lazy import to avoid circular deps — useInitiaBridge is a singleton itself
  const { state } = useInitiaBridge();

  const chainAutoSignEnabled = computed(() => state.value.autoSignEnabled);

  const anyEnabled = computed(() => prefs.value[ENABLED_FIELD] === true);

  function isEnabled(_actionKey: string): boolean {
    return prefs.value[ENABLED_FIELD] === true;
  }

  function setEnabled(_actionKey: string, val: boolean): void {
    prefs.value = { ...prefs.value, [ENABLED_FIELD]: val };
    writeStorage(PREFS_KEY, prefs.value);
    // Reset dismissed so the consent modal re-appears if user later opts out.
    if (!val) {
      dismissed.value = { ...dismissed.value, [DISMISSED_FIELD]: false };
      writeStorage(DISMISSED_KEY, dismissed.value);
    }
  }

  function isDismissed(_actionKey: string): boolean {
    return dismissed.value[DISMISSED_FIELD] === true;
  }

  function setDismissed(_actionKey: string, val: boolean): void {
    dismissed.value = { ...dismissed.value, [DISMISSED_FIELD]: val };
    writeStorage(DISMISSED_KEY, dismissed.value);
  }

  return {
    isEnabled,
    setEnabled,
    isDismissed,
    setDismissed,
    anyEnabled,
    chainAutoSignEnabled,
  };
}
