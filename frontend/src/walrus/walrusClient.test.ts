import { describe, expect, it, vi } from 'vitest';

const { suiClientCtor, extendMock, walrusExtensionMock } = vi.hoisted(() => ({
  suiClientCtor: vi.fn(),
  extendMock: vi.fn(),
  walrusExtensionMock: vi.fn((opts: unknown) => ({ __walrusOptions: opts })),
}));

vi.mock('@mysten/sui/jsonRpc', () => {
  class SuiJsonRpcClient {
    constructor(opts: unknown) {
      suiClientCtor(opts);
    }
    $extend(extension: unknown) {
      extendMock(extension);
      return { walrus: { writeFilesFlow: vi.fn() }, __extension: extension };
    }
  }
  return {
    SuiJsonRpcClient,
    getJsonRpcFullnodeUrl: (n: string) =>
      n === 'testnet'
        ? 'https://fullnode.testnet.sui.io:443'
        : `https://fullnode.${n}.sui.io:443`,
  };
});

vi.mock('@mysten/walrus', () => ({
  walrus: walrusExtensionMock,
}));

import { getWalrusClient } from './walrusClient';

describe('getWalrusClient', () => {
  it('constructs a SuiClient pointing at testnet fullnode and extends it with walrus()', () => {
    suiClientCtor.mockClear();
    extendMock.mockClear();
    walrusExtensionMock.mockClear();

    const client = getWalrusClient('testnet');

    expect(suiClientCtor).toHaveBeenCalledWith({
      network: 'testnet',
      url: 'https://fullnode.testnet.sui.io:443',
    });
    expect(walrusExtensionMock).toHaveBeenCalledTimes(1);
    expect(extendMock).toHaveBeenCalledTimes(1);
    expect(client).toHaveProperty('walrus');
  });

  it('passes the upload relay config with sendTip.max=1000 (D-010)', () => {
    walrusExtensionMock.mockClear();
    getWalrusClient('testnet');

    const call = walrusExtensionMock.mock.calls.at(-1)?.[0] as {
      uploadRelay: { host: string; sendTip: { max: number } };
      wasmUrl: string;
    };
    expect(call.uploadRelay.host).toBe('https://upload-relay.testnet.walrus.space');
    expect(call.uploadRelay.sendTip).toEqual({ max: 1_000 });
  });

  it('wires the @mysten/walrus-wasm ?url import into wasmUrl', () => {
    walrusExtensionMock.mockClear();
    getWalrusClient('testnet');
    const call = walrusExtensionMock.mock.calls.at(-1)?.[0] as { wasmUrl: string };
    expect(typeof call.wasmUrl).toBe('string');
    expect(call.wasmUrl.length).toBeGreaterThan(0);
  });

  it('defaults to testnet when no network argument is passed', () => {
    suiClientCtor.mockClear();
    getWalrusClient();
    expect(suiClientCtor).toHaveBeenCalledWith({
      network: 'testnet',
      url: 'https://fullnode.testnet.sui.io:443',
    });
  });
});
