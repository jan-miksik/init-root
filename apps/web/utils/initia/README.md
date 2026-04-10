# Initia Bridge Utils

- `react-bridge.ts`: React mount/runtime entry for InterwovenKit bridge integration.
- `bridge/abi.ts`: smart contract ABI constants.
- `bridge/helpers.ts`: event dispatch, address normalization, and low-level bridge helpers.
- `bridge/state.ts`: agent bridge runtime state shape.
- `composables/useInitiaBridge.ts`: browser-side bridge API exposed to Vue pages/components.
- `composables/useAutoSign.ts`: persisted auto-sign preference state.
- `composables/useAutoSignConsent.ts`: shared consent gate for flows that may enable auto-sign.

Keep responsibilities split:
- Runtime and chain calls stay in `react-bridge.ts`.
- Reusable formatting, normalization, and event helpers stay in `bridge/*`.
- Page-level wallet/onchain workflows belong in feature composables such as `features/agents/create/useAgentCreateFlow.ts`.
