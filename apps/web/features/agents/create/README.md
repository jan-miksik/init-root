# Agent Create Flow

Entry points:
- `pages/agents/create.vue`: route shell only.
- `features/agents/create/useAgentCreateFlow.ts`: create + fund workflow orchestration.
- `components/AgentCreateFundingStep.vue`: funding step UI.
- `components/AgentPromptPreviewPanel.vue`: shared prompt preview/editor used by create and edit flows.

State ownership:
- The route owns `configFormRef`.
- `useAgentCreateFlow` owns step state, wallet/onchain actions, funding mutations, and notifications.
- `AgentPromptPreviewPanel` owns prompt-preview UI state only.

Change here first:
- Modify create/fund behavior in `useAgentCreateFlow.ts`.
- Modify preview/editor behavior in `AgentPromptPreviewPanel.vue`.
- Modify page layout or step composition in `pages/agents/create.vue`.

Related code:
- `components/AgentConfigForm.vue`
- `composables/useAutoSignConsent.ts`
- `utils/initia/README.md`
