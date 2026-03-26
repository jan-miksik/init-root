export type ManagerPromptSections = {
  system: string;
  context: string;
  editableSetup: string;
};

export function splitManagerPromptSections(promptText: string | undefined | null): ManagerPromptSections {
  if (!promptText) return { system: '', context: '', editableSetup: '' };

  const coreIdx = promptText.indexOf('You are an Agent Manager');
  const personaIdx = promptText.indexOf('## Your Persona');
  const managedIdx = promptText.indexOf('## Managed Agents');
  const riskIdx = promptText.indexOf('## Risk Limits');
  const allowedIdx = promptText.indexOf('## Allowed Trading Pairs');
  const behaviorIdx = promptText.indexOf('## Your Management Style');

  const editableParts: string[] = [];

  if (personaIdx >= 0 && coreIdx > personaIdx) {
    editableParts.push(promptText.slice(personaIdx, coreIdx).trim());
  }

  if (riskIdx >= 0) {
    const riskEnd = allowedIdx > riskIdx ? allowedIdx : promptText.length;
    editableParts.push(promptText.slice(riskIdx, riskEnd).trim());
  } else if (behaviorIdx >= 0) {
    const behaviorEnd = allowedIdx > behaviorIdx ? allowedIdx : promptText.length;
    editableParts.push(promptText.slice(behaviorIdx, behaviorEnd).trim());
  }

  const introStart = coreIdx >= 0 ? coreIdx : 0;
  const introEnd = managedIdx > introStart ? managedIdx : promptText.length;
  const intro = promptText.slice(introStart, introEnd).trim();

  const tail = allowedIdx >= 0 ? promptText.slice(allowedIdx).trim() : '';

  const contextEnd = riskIdx > managedIdx ? riskIdx : (allowedIdx > managedIdx ? allowedIdx : promptText.length);
  const context = managedIdx >= 0
    ? promptText.slice(managedIdx, contextEnd).trim()
    : '';

  const systemParts = [intro, tail].filter(Boolean);

  return {
    system: systemParts.join('\n\n').trim(),
    context,
    editableSetup: editableParts.filter(Boolean).join('\n\n').trim(),
  };
}

