import { createElement, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InterwovenKitProvider, TESTNET } from '@initia/interwovenkit-react';

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
  showcaseTokenAddress?: string;
  showcaseTokenFaucetAddress?: string;
  executorAddress?: string;
  showcaseTargetAddress?: string;
  maxTradeValueWei?: string;
  dailyTradeValueWei?: string;
  bridgeUrl?: string;
}

export function BridgeRoot(props: { options: InitiaBridgeMountOptions; runtime: React.FC<{ options: InitiaBridgeMountOptions; evmChain: any }> }) {
  const { options, runtime } = props;

  const evmChain = useMemo(() => ({
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
    chains: [evmChain as any],
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
        createElement(runtime as any, { options, evmChain }),
      ),
    ),
  );
}
