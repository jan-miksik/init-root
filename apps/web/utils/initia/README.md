# Initia Bridge Utils

- `react-bridge.ts`: React mount/runtime entry for InterwovenKit bridge integration.
- `bridge/abi.ts`: smart contract ABI constants.
- `bridge/helpers.ts`: event dispatch, address normalization, and low-level bridge helpers.
- `bridge/state.ts`: agent bridge runtime state shape.

Keep action behavior in runtime, but place reusable formatting/normalization logic in `bridge/*` modules.
