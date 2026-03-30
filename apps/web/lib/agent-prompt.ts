export type AgentPromptSections = {
  system: string;
  marketData: string;
  editableSetup: string;
};

/** Split a stored llmPromptText into SYSTEM / MARKET DATA / EDITABLE SETUP sections. */
export function splitAgentPromptSections(promptText: string | undefined | null): AgentPromptSections {
  if (!promptText) return { system: '', marketData: '', editableSetup: '' };

  const portfolioIdx = promptText.indexOf('## Portfolio State');
  const roleIdx = promptText.indexOf('## Your Role');
  const behaviorIdx = promptText.indexOf('## Your Behavior Profile');
  const personaIdx = promptText.indexOf('## Your Persona');
  const constraintsIdx = promptText.indexOf('## Constraints');

  const system = portfolioIdx >= 0 ? promptText.slice(0, portfolioIdx).trim() : promptText.trim();

  const candidates = [roleIdx, behaviorIdx, personaIdx, constraintsIdx].filter((i) => i >= 0);
  const editableStart = candidates.length > 0 ? Math.min(...candidates) : -1;
  const editableSetup = editableStart >= 0 ? promptText.slice(editableStart).trim() : '';

  const marketEnd = editableStart >= 0 ? editableStart : promptText.length;
  const marketData = portfolioIdx >= 0 ? promptText.slice(portfolioIdx, marketEnd).trim() : '';

  return { system, marketData, editableSetup };
}

/** Extract pair→price map from a MARKET DATA section. */
export function parseMarketPrices(marketDataSection: string): Record<string, number> {
  const prices: Record<string, number> = {};
  let currentPair = '';

  for (const line of marketDataSection.split('\n')) {
    const pairMatch = line.match(/^### (.+)$/);
    if (pairMatch) currentPair = pairMatch[1]?.trim() ?? '';

    const priceMatch = line.match(/^Price: \$([0-9.]+)/);
    if (priceMatch && currentPair) {
      prices[currentPair] = parseFloat(priceMatch[1] ?? '0');
    }
  }

  return prices;
}
