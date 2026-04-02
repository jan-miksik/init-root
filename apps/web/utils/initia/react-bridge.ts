import React, { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InterwovenKitProvider, TESTNET, injectStyles, useInterwovenKit } from '@initia/interwovenkit-react';
import InterwovenKitStyles from '@initia/interwovenkit-react/styles.js';
import '@initia/interwovenkit-react/styles.css';
import { createPublicClient, defineChain, encodeFunctionData, parseEther, toHex, http as viemHttp } from 'viem';
import type {
  InitiaBridgeActionEventDetail,
  InitiaBridgeResponseEventDetail,
  InitiaBridgeState,
  InitiaBridgeStateEventDetail,
} from '~/utils/initia/bridge-types';
import {
  INITIA_BRIDGE_ACTION_EVENT,
  INITIA_BRIDGE_RESPONSE_EVENT,
  INITIA_BRIDGE_STATE_EVENT,
} from '~/utils/initia/bridge-types';

injectStyles(InterwovenKitStyles);

declare global {
  interface Window {
    __initiaBridgeApi?: {
      openConnect: () => Promise<void> | void;
      openWallet: () => Promise<void> | void;
      refresh: () => Promise<void> | void;
    };
  }
}

const AGENT_ABI = [
  {
    type: 'function',
    name: 'createAgent',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'metadata', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'enableAutoSign',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disableAutoSign',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeTick',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getAgent',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [
      { name: 'metadata', type: 'bytes' },
      { name: 'balance', type: 'uint256' },
      { name: 'exists', type: 'bool' },
      { name: 'autoSignEnabled', type: 'bool' },
    ],
  },
] as const;

export interface InitiaBridgeMountOptions {
  chainId: string;
  defaultChainId: string;
  chainName: string;
  evmChainId: number;
  evmRpc: string;
  restUrl: string;
  rpcUrl: string;
  indexerUrl: string;
  contractAddress: string;
}

interface AgentState {
  exists: boolean;
  balance: bigint;
  autoSignEnabled: boolean;
}

function buildMsgCall(sender: string, contractAddress: string, input: string, value = '0x0') {
  return {
    typeUrl: '/minievm.evm.v1.MsgCall',
    value: {
      sender: sender.toLowerCase(),
      contractAddr: contractAddress.toLowerCase(),
      input,
      value,
      accessList: [],
      authList: [],
    },
  };
}

function dispatchBridgeState(payload: InitiaBridgeState) {
  const detail: InitiaBridgeStateEventDetail = { type: 'state', payload };
  window.dispatchEvent(new CustomEvent<InitiaBridgeStateEventDetail>(INITIA_BRIDGE_STATE_EVENT, { detail }));
}

function dispatchBridgeResponse(id: string, ok: boolean, result?: Record<string, unknown> | null, error?: string) {
  const detail: InitiaBridgeResponseEventDetail = {
    type: 'response',
    payload: { id, ok, result: result ?? null, error },
  };
  window.dispatchEvent(new CustomEvent<InitiaBridgeResponseEventDetail>(INITIA_BRIDGE_RESPONSE_EVENT, { detail }));
}

function extractTxHash(tx: unknown): string | null {
  const candidate = tx as {
    txhash?: string;
    txHash?: string;
    tx_hash?: string;
    transactionHash?: string;
  } | null;
  return candidate?.txhash ?? candidate?.txHash ?? candidate?.tx_hash ?? candidate?.transactionHash ?? null;
}

function BridgeRuntime(props: { options: InitiaBridgeMountOptions; evmChain: ReturnType<typeof defineChain> }) {
  const { options, evmChain } = props;
  const {
    initiaAddress,
    address: evmAddress,
    openConnect,
    openWallet,
    requestTxBlock,
    autoSign,
  } = useInterwovenKit();

  const publicClient = useMemo(() => createPublicClient({
    chain: evmChain,
    transport: viemHttp(options.evmRpc),
  }), [evmChain, options.evmRpc]);

  const [chainOk, setChainOk] = useState(false);
  const [walletBalanceWei, setWalletBalanceWei] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>({
    exists: false,
    balance: 0n,
    autoSignEnabled: false,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      await publicClient.getBlockNumber();
      setChainOk(true);
    } catch {
      setChainOk(false);
    }

    if (evmAddress) {
      try {
        const [metadata, balance, exists, autoSignEnabled] = await publicClient.readContract({
          address: options.contractAddress as `0x${string}`,
          abi: AGENT_ABI,
          functionName: 'getAgent',
          args: [evmAddress as `0x${string}`],
        });
        void metadata;
        setAgentState({
          exists: Boolean(exists),
          balance: balance ?? 0n,
          autoSignEnabled: Boolean(autoSignEnabled),
        });
      } catch {
        setAgentState({
          exists: false,
          balance: 0n,
          autoSignEnabled: false,
        });
      }

      try {
        const walletBalance = await publicClient.getBalance({ address: evmAddress as `0x${string}` });
        setWalletBalanceWei(walletBalance.toString());
      } catch {
        setWalletBalanceWei(null);
      }
    } else {
      setAgentState({
        exists: false,
        balance: 0n,
        autoSignEnabled: false,
      });
      setWalletBalanceWei(null);
    }
  }, [evmAddress, options.contractAddress, publicClient]);

  useEffect(() => {
    void refresh();
    const pollId = window.setInterval(() => {
      void refresh();
    }, 4_000);
    return () => {
      window.clearInterval(pollId);
    };
  }, [refresh]);

  useEffect(() => {
    window.__initiaBridgeApi = {
      openConnect: () => openConnect(),
      openWallet: () => openWallet(),
      refresh: () => refresh(),
    };
    return () => {
      if (window.__initiaBridgeApi) {
        delete window.__initiaBridgeApi;
      }
    };
  }, [openConnect, openWallet, refresh]);

  const doTx = useCallback(async (action: string, input: string, valueWeiHex?: string) => {
    if (!initiaAddress) throw new Error('Connect wallet first.');
    setBusyAction(action);
    setError(null);
    try {
      const tx = await requestTxBlock({
        chainId: options.chainId,
        messages: [buildMsgCall(initiaAddress, options.contractAddress, input, valueWeiHex ?? '0x0')],
      });
      const txHash = extractTxHash(tx);
      setLastTxHash(txHash);
      await refresh();
      return txHash;
    } finally {
      setBusyAction(null);
    }
  }, [initiaAddress, options.chainId, options.contractAddress, refresh, requestTxBlock]);

  useEffect(() => {
    const onAction = (event: Event) => {
      const custom = event as CustomEvent<InitiaBridgeActionEventDetail>;
      if (custom.detail?.type !== 'action') return;

      const { id, action, params } = custom.detail.payload;
      const run = async () => {
        switch (action) {
          case 'openConnect':
            await openConnect();
            return {};
          case 'openWallet':
            await openWallet();
            return {};
          case 'refresh':
            await refresh();
            return {};
          case 'createAgentOnchain': {
            const metadataPointer = (params?.metadataPointer ?? {}) as Record<string, unknown>;
            const metadataBytes = new TextEncoder().encode(JSON.stringify(metadataPointer));
            const input = encodeFunctionData({
              abi: AGENT_ABI,
              functionName: 'createAgent',
              args: [toHex(metadataBytes)],
            });
            const txHash = await doTx('createAgentOnchain', input);
            return { txHash };
          }
          case 'deposit': {
            const amount = String(params?.amount ?? '0');
            const wei = parseEther(amount);
            const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'deposit', args: [] });
            const txHash = await doTx('deposit', input, `0x${wei.toString(16)}`);
            return { txHash };
          }
          case 'withdraw': {
            const amount = String(params?.amount ?? '0');
            const wei = parseEther(amount);
            const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'withdraw', args: [wei] });
            const txHash = await doTx('withdraw', input);
            return { txHash };
          }
          case 'enableAutoSign': {
            if (!initiaAddress) throw new Error('Connect wallet first.');
            setBusyAction('enableAutoSign');
            try {
              await (autoSign as any)?.enable?.(options.chainId, { permissions: ['/minievm.evm.v1.MsgCall'] });
              const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'enableAutoSign', args: [] });
              const tx = await requestTxBlock({
                chainId: options.chainId,
                messages: [buildMsgCall(initiaAddress, options.contractAddress, input)],
              });
              const txHash = extractTxHash(tx);
              setLastTxHash(txHash);
              await refresh();
              return { txHash };
            } finally {
              setBusyAction(null);
            }
          }
          case 'disableAutoSign': {
            if (!initiaAddress) throw new Error('Connect wallet first.');
            setBusyAction('disableAutoSign');
            try {
              await (autoSign as any)?.disable?.(options.chainId);
              const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'disableAutoSign', args: [] });
              const tx = await requestTxBlock({
                chainId: options.chainId,
                messages: [buildMsgCall(initiaAddress, options.contractAddress, input)],
              });
              const txHash = extractTxHash(tx);
              setLastTxHash(txHash);
              await refresh();
              return { txHash };
            } finally {
              setBusyAction(null);
            }
          }
          case 'executeTick': {
            if (!initiaAddress) throw new Error('Connect wallet first.');
            setBusyAction('executeTick');
            try {
              const input = encodeFunctionData({ abi: AGENT_ABI, functionName: 'executeTick', args: [] });
              const tx = await requestTxBlock({
                chainId: options.chainId,
                autoSign: agentState.autoSignEnabled || !!(autoSign as any)?.isEnabledByChain?.[options.chainId],
                messages: [buildMsgCall(initiaAddress, options.contractAddress, input)],
              } as any);
              const txHash = extractTxHash(tx);
              setLastTxHash(txHash);
              await refresh();
              return { txHash };
            } finally {
              setBusyAction(null);
            }
          }
          default:
            throw new Error(`Unsupported action: ${action}`);
        }
      };

      void run()
        .then((result) => {
          dispatchBridgeResponse(id, true, result);
        })
        .catch((err: unknown) => {
          const message = (err as Error)?.message || String(err);
          setError(message);
          dispatchBridgeResponse(id, false, null, message);
        });
    };

    window.addEventListener(INITIA_BRIDGE_ACTION_EVENT, onAction);
    return () => {
      window.removeEventListener(INITIA_BRIDGE_ACTION_EVENT, onAction);
    };
  }, [
    agentState.autoSignEnabled,
    autoSign,
    doTx,
    initiaAddress,
    openConnect,
    openWallet,
    options.chainId,
    options.contractAddress,
    refresh,
    requestTxBlock,
  ]);

  useEffect(() => {
    const state: InitiaBridgeState = {
      ready: true,
      chainOk,
      initiaAddress: initiaAddress ?? null,
      evmAddress: evmAddress ?? null,
      walletBalanceWei,
      vaultBalanceWei: agentState.balance.toString(),
      agentExists: agentState.exists,
      autoSignEnabled: agentState.autoSignEnabled || !!autoSign?.isEnabledByChain?.[options.chainId],
      busyAction,
      lastTxHash,
      error,
    };
    dispatchBridgeState(state);
  }, [
    agentState.autoSignEnabled,
    agentState.balance,
    agentState.exists,
    autoSign,
    busyAction,
    chainOk,
    error,
    evmAddress,
    initiaAddress,
    lastTxHash,
    options.chainId,
    walletBalanceWei,
  ]);

  return null;
}

function BridgeRoot(props: { options: InitiaBridgeMountOptions }) {
  const { options } = props;

  const evmChain = useMemo(() => defineChain({
    id: options.evmChainId,
    name: options.chainName,
    nativeCurrency: { name: 'GAS', symbol: 'GAS', decimals: 18 },
    rpcUrls: { default: { http: [options.evmRpc] } },
  }), [options.chainName, options.evmChainId, options.evmRpc]);

  const customChain = useMemo(() => ({
    chain_id: options.chainId,
    chain_name: options.chainName,
    pretty_name: options.chainName,
    network_type: 'testnet',
    bech32_prefix: 'init',
    apis: {
      rpc: [{ address: options.rpcUrl }],
      rest: [{ address: options.restUrl }],
      indexer: [{ address: options.indexerUrl }],
      'json-rpc': [{ address: options.evmRpc }],
    },
    fees: {
      fee_tokens: [{ denom: 'GAS', fixed_min_gas_price: 0, low_gas_price: 0, average_gas_price: 0, high_gas_price: 0 }],
    },
    staking: { staking_tokens: [{ denom: 'GAS' }] },
    native_assets: [{ denom: 'GAS', name: 'GAS', symbol: 'GAS', decimals: 18 }],
    metadata: { is_l1: false, minitia: { type: 'minievm' } },
  }), [options.chainId, options.chainName, options.evmRpc, options.indexerUrl, options.restUrl, options.rpcUrl]);

  const queryClient = useMemo(() => new QueryClient(), []);
  const wagmiConfig = useMemo(() => createConfig({
    chains: [evmChain],
    transports: {
      [evmChain.id]: http(options.evmRpc),
    },
  }), [evmChain, options.evmRpc]);

  return createElement(
    WagmiProvider as any,
    { config: wagmiConfig },
    createElement(
      QueryClientProvider as any,
      { client: queryClient },
      createElement(
        InterwovenKitProvider as any,
        {
          ...TESTNET,
          defaultChainId: options.defaultChainId,
          customChain,
          customChains: [customChain],
          enableAutoSign: { [options.chainId]: ['/minievm.evm.v1.MsgCall'] },
        } as any,
        createElement(BridgeRuntime, { options, evmChain }),
      ),
    ),
  );
}

export function mountInitiaBridge(container: HTMLElement, options: InitiaBridgeMountOptions): () => void {
  let root: Root | null = createRoot(container);
  root.render(createElement(BridgeRoot as any, { options }) as any);
  return () => {
    if (root) {
      root.unmount();
      root = null;
    }
  };
}
