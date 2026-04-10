import { useEffect, useCallback } from 'react';
import { encodeFunctionData, parseEther, toHex } from 'viem';
import { AGENT_ABI, IUSD_FAUCET_ABI, ERC20_ABI } from '~/utils/initia/bridge/abi';
import { bech32ToEvmHex, dispatchBridgeResponse } from '~/utils/initia/bridge/helpers';
import { INITIA_BRIDGE_ACTION_EVENT, type InitiaBridgeActionEventDetail, type InitiaBridgeOpenParams } from '~/utils/initia/bridge-types';

export function useBridgeEvents(params: {
  openConnect: () => void;
  openWallet: () => void;
  safeOpenBridge: (p?: InitiaBridgeOpenParams) => Promise<void>;
  refresh: () => Promise<void>;
  doAgentTx: (a: string, i: string, v?: string, as?: boolean) => Promise<string | null>;
  doContractTx: (a: string, c: `0x${string}`, i: string, v?: string, as?: boolean) => Promise<string | null>;
  fetchLatestAgentId: (o: `0x${string}`) => Promise<bigint | null>;
  initiaAddressRef: React.MutableRefObject<string | null>;
  evmAddressRef: React.MutableRefObject<`0x${string}` | null>;
  agentStateRef: React.MutableRefObject<any>;
  setBusyAction: (a: string | null) => void;
  setError: (e: string | null) => void;
  startSteps: (l: string[]) => void;
  advanceStep: (i: number) => void;
  clearSteps: () => void;
  options: any;
}) {
  const {
    openConnect,
    openWallet,
    safeOpenBridge,
    refresh,
    doAgentTx,
    doContractTx,
    fetchLatestAgentId,
    initiaAddressRef,
    evmAddressRef,
    agentStateRef,
    setBusyAction,
    setError,
    startSteps,
    advanceStep,
    clearSteps,
    options,
  } = params;

  const requireAgentId = useCallback((): bigint => {
    const current = agentStateRef.current;
    if (current.id === null || !current.exists) {
      throw new Error('Create an onchain agent first.');
    }
    return current.id;
  }, [agentStateRef]);

  useEffect(() => {
    const onAction = (event: Event) => {
      const custom = event as CustomEvent<InitiaBridgeActionEventDetail>;
      if (custom.detail?.type !== 'action') return;

      const { id, action, params: actionParams } = custom.detail.payload;
      const run = async () => {
        switch (action) {
          case 'openConnect': await openConnect(); return {};
          case 'openWallet': await openWallet(); return {};
          case 'openBridge': await safeOpenBridge(actionParams as InitiaBridgeOpenParams | undefined); return {};
          case 'refresh': await refresh(); return {};
          case 'createAgentOnchain': {
            const metadataPointer = (actionParams?.metadataPointer ?? {}) as Record<string, unknown>;
            const metadataBytes = new TextEncoder().encode(JSON.stringify(metadataPointer));
            const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'createAgent', args: [toHex(metadataBytes)] });
            startSteps(['Confirm agent creation']);
            const txHash = await doAgentTx('createAgentOnchain', input, undefined, actionParams?.autoSign === true);
            advanceStep(0);
            setBusyAction('createAgentOnchain');
            try {
              const pollAddr: `0x${string}` | null = evmAddressRef.current ?? bech32ToEvmHex(initiaAddressRef.current);
              let latestAgentId: bigint | null = pollAddr ? await fetchLatestAgentId(pollAddr).catch(() => null) : null;
              if (latestAgentId === null && pollAddr) {
                const startedAt = Date.now();
                while (latestAgentId === null && Date.now() - startedAt < 45000) {
                  await new Promise(r => setTimeout(r, 1500));
                  latestAgentId = await fetchLatestAgentId(pollAddr).catch(() => null);
                }
              }
              await refresh();
              return { txHash, onchainAgentId: latestAgentId?.toString() ?? null };
            } finally {
              setBusyAction(null);
              clearSteps();
            }
          }
          case 'deposit': {
            const agentId = requireAgentId();
            const wei = parseEther(String(actionParams?.amount ?? '0'));
            const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'depositNative', args: [agentId] });
            startSteps(['Confirm INIT deposit']);
            try {
              const txHash = await doAgentTx('deposit', input, `0x${wei.toString(16)}`, actionParams?.autoSign === true);
              return { txHash, onchainAgentId: agentId.toString() };
            } finally { clearSteps(); }
          }
          case 'withdraw': {
            const currentEvmAddr = evmAddressRef.current ?? bech32ToEvmHex(initiaAddressRef.current);
            if (!currentEvmAddr) throw new Error('Connect wallet first.');
            const agentId = requireAgentId();
            const wei = parseEther(String(actionParams?.amount ?? '0'));
            const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'withdrawNative', args: [agentId, wei, currentEvmAddr] });
            startSteps(['Confirm INIT withdrawal']);
            try {
              const txHash = await doAgentTx('withdraw', input, undefined, actionParams?.autoSign === true);
              return { txHash, onchainAgentId: agentId.toString() };
            } finally { clearSteps(); }
          }
          case 'mintShowcaseToken': {
            if (!options.showcaseTokenFaucetAddress) throw new Error('Faucet address not configured');
            const wei = parseEther(String(actionParams?.amount ?? '0'));
            const input = encodeFunctionData({ abi: IUSD_FAUCET_ABI, functionName: 'mint', args: [wei] });
            startSteps(['Confirm iUSD-demo mint']);
            try {
              const txHash = await doContractTx('mintShowcaseToken', options.showcaseTokenFaucetAddress as `0x${string}`, input, undefined, actionParams?.autoSign === true);
              return { txHash };
            } finally { clearSteps(); }
          }
          case 'depositShowcaseToken': {
            const agentId = requireAgentId();
            const wei = parseEther(String(actionParams?.amount ?? '0'));
            startSteps(['Approve iUSD-demo spending', 'Deposit iUSD-demo to vault']);
            try {
              const approveInput = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [options.contractAddress as `0x${string}`, wei] });
              const approveTxHash = await doContractTx('depositShowcaseTokenApprove', options.showcaseTokenAddress as `0x${string}`, approveInput, undefined, actionParams?.autoSign === true);
              advanceStep(0);
              const depositInput = encodeFunctionData({ abi: AGENT_ABI, functionName: 'depositToken', args: [agentId, options.showcaseTokenAddress as `0x${string}`, wei] });
              const txHash = await doAgentTx('depositShowcaseToken', depositInput, undefined, actionParams?.autoSign === true);
              return { txHash, approveTxHash, onchainAgentId: agentId.toString() };
            } finally { clearSteps(); }
          }
          case 'withdrawShowcaseToken': {
            const currentEvmAddr = evmAddressRef.current;
            if (!currentEvmAddr) throw new Error('Connect wallet first.');
            const agentId = requireAgentId();
            const wei = parseEther(String(actionParams?.amount ?? '0'));
            const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'withdrawToken', args: [agentId, options.showcaseTokenAddress as `0x${string}`, wei, currentEvmAddr] });
            startSteps(['Confirm iUSD-demo withdrawal']);
            try {
              const txHash = await doAgentTx('withdrawShowcaseToken', input, undefined, actionParams?.autoSign === true);
              return { txHash, onchainAgentId: agentId.toString() };
            } finally { clearSteps(); }
          }
          case 'authorizeExecutor': {
            const agentId = requireAgentId();
            const authSteps = options.showcaseTargetAddress ? ['Whitelist trading target', 'Authorize executor contract'] : ['Authorize executor contract'];
            startSteps(authSteps);
            try {
              let whitelistTxHash: string | null = null;
              if (options.showcaseTargetAddress) {
                const whitelistInput = encodeFunctionData({ abi: AGENT_ABI, functionName: 'setAllowedPerpDex', args: [agentId, options.showcaseTargetAddress as `0x${string}`, true] });
                whitelistTxHash = await doAgentTx('authorizeExecutorTarget', whitelistInput, undefined, actionParams?.autoSign === true);
                advanceStep(0);
              }
              const approvalInput = encodeFunctionData({ abi: AGENT_ABI, functionName: 'setExecutorApproval', args: [agentId, options.executorAddress as `0x${string}`, true, true, options.maxTradeValueWei || '0', options.dailyTradeValueWei || '0'] });
              const txHash = await doAgentTx('authorizeExecutor', approvalInput, undefined, actionParams?.autoSign === true);
              return { txHash, whitelistTxHash, onchainAgentId: agentId.toString() };
            } finally { clearSteps(); }
          }
          default: throw new Error(`Unsupported action: ${action}`);
        }
      };

      void run()
        .then((result) => dispatchBridgeResponse(id, true, result))
        .catch((err) => {
          const message = (err as Error)?.message || String(err);
          clearSteps();
          setError(message);
          dispatchBridgeResponse(id, false, null, message);
        });
    };

    window.addEventListener(INITIA_BRIDGE_ACTION_EVENT, onAction);
    return () => window.removeEventListener(INITIA_BRIDGE_ACTION_EVENT, onAction);
  }, [openConnect, openWallet, safeOpenBridge, refresh, doAgentTx, doContractTx, fetchLatestAgentId, initiaAddressRef, evmAddressRef, agentStateRef, setBusyAction, setError, startSteps, advanceStep, clearSteps, options]);
}
