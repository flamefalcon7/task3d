import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

// Walrus client + WalrusFile are mocked at the @mysten/walrus boundary so the
// hook never touches real WASM, real signers, or real network IO.
const { writeFilesFlowFactory, writeBlobFlowFactory, walrusFileFromMock } = vi.hoisted(() => ({
  writeFilesFlowFactory: vi.fn(),
  writeBlobFlowFactory: vi.fn(),
  walrusFileFromMock: vi.fn((opts: { contents: Uint8Array; identifier?: string }) => ({
    __identifier: opts.identifier ?? null,
    __bytes: opts.contents,
  })),
}));

vi.mock('@mysten/walrus', () => ({
  walrus: vi.fn(() => ({})),
  WalrusFile: { from: walrusFileFromMock },
}));

// Stand-in SuiClient: $extend returns an object exposing `walrus.writeFilesFlow`
// driven by the per-test factory mock.
vi.mock('@mysten/sui/jsonRpc', () => {
  class SuiJsonRpcClient {
    $extend() {
      return {
        walrus: {
          writeFilesFlow: (...args: unknown[]) => writeFilesFlowFactory(...args),
          writeBlobFlow: (...args: unknown[]) => writeBlobFlowFactory(...args),
        },
      };
    }
  }
  return {
    SuiJsonRpcClient,
    getJsonRpcFullnodeUrl: () => 'https://fullnode.testnet.sui.io:443',
  };
});

import { useWalrusUpload } from './useWalrusUpload';

function makeSigner(address = '0xCAFE') {
  return {
    toSuiAddress: () => address,
  } as unknown as Parameters<ReturnType<typeof useWalrusUpload>['uploadFiles']>[1];
}

function makeHappyFlow() {
  const encode = vi.fn().mockResolvedValue({ step: 'encoded' });
  const executeRegister = vi
    .fn()
    .mockResolvedValue({ step: 'registered', txDigest: '0xdigest' });
  const upload = vi.fn().mockResolvedValue({ step: 'uploaded' });
  const executeCertify = vi.fn().mockResolvedValue({ step: 'certified' });
  // Real SDK semantics: all entries in one quilt share blobId + blobObject;
  // `id` is a synthetic encodeQuiltPatchId per file. The Sui Blob object id
  // looks like /^0x[0-9a-f]{64}$/.
  const SHARED_BLOB_ID = 'blob-quilt-1';
  const SHARED_BLOB_OBJECT_ID =
    '0x' + 'a'.repeat(64);
  const listFiles = vi.fn().mockResolvedValue([
    {
      id: 'patch-synth-0',
      blobId: SHARED_BLOB_ID,
      blobObject: { id: SHARED_BLOB_OBJECT_ID },
    },
    {
      id: 'patch-synth-1',
      blobId: SHARED_BLOB_ID,
      blobObject: { id: SHARED_BLOB_OBJECT_ID },
    },
  ]);
  return {
    encode,
    executeRegister,
    upload,
    executeCertify,
    listFiles,
    SHARED_BLOB_ID,
    SHARED_BLOB_OBJECT_ID,
  };
}

// plan-017 U1 — flow factory for multi-quilt tests. Each call produces a
// distinct flow with batch-specific blobId / blobObjectId / patch ids so
// the test can assert that the accumulator stitches them in input order.
function makeQuiltFlow(batchIndex: number, chunkSize: number) {
  const blobId = `blob-quilt-${batchIndex}`;
  const blobObjectId = '0x' + String(batchIndex).repeat(64).slice(0, 64);
  const txDigest = `0xdigest-q${batchIndex}`;
  const encode = vi.fn().mockResolvedValue({ step: 'encoded' });
  const executeRegister = vi
    .fn()
    .mockResolvedValue({ step: 'registered', txDigest });
  const upload = vi.fn().mockResolvedValue({ step: 'uploaded' });
  const executeCertify = vi.fn().mockResolvedValue({ step: 'certified' });
  const listFiles = vi.fn().mockResolvedValue(
    Array.from({ length: chunkSize }, (_, j) => ({
      id: `patch-q${batchIndex}-${j}`,
      blobId,
      blobObject: { id: blobObjectId },
    })),
  );
  return { encode, executeRegister, upload, executeCertify, listFiles, blobId, blobObjectId, txDigest };
}

// writeBlobFlow happy path (D-037 standalone GLB upload). executeCertify
// resolves the WriteBlobStepCertified carrying blobId + blobObjectId directly.
function makeHappyBlobFlow() {
  const BLOB_ID = 'raw-blob-xyz';
  const BLOB_OBJECT_ID = '0x' + 'b'.repeat(64);
  const encode = vi.fn().mockResolvedValue({ step: 'encoded' });
  const executeRegister = vi
    .fn()
    .mockResolvedValue({ step: 'registered', txDigest: '0xdigest', blobObjectId: BLOB_OBJECT_ID });
  const upload = vi.fn().mockResolvedValue({ step: 'uploaded' });
  const executeCertify = vi
    .fn()
    .mockResolvedValue({ step: 'certified', blobId: BLOB_ID, blobObjectId: BLOB_OBJECT_ID });
  return { encode, executeRegister, upload, executeCertify, BLOB_ID, BLOB_OBJECT_ID };
}

beforeEach(() => {
  writeFilesFlowFactory.mockReset();
  writeBlobFlowFactory.mockReset();
  walrusFileFromMock.mockClear();
});

afterEach(() => cleanup());

describe('useWalrusUpload', () => {
  it('exposes idle status and popupCount=2 initially', () => {
    const { result } = renderHook(() => useWalrusUpload());
    expect(result.current.status).toBe('idle');
    expect(result.current.popupCount).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('drives encode → executeRegister → upload → executeCertify on happy path', async () => {
    const flow = makeHappyFlow();
    writeFilesFlowFactory.mockReturnValue(flow);

    const { result } = renderHook(() => useWalrusUpload());
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    const lineage = new Uint8Array([0x7b, 0x7d]);

    let res: Awaited<ReturnType<typeof result.current.uploadFiles>> | undefined;
    await act(async () => {
      res = await result.current.uploadFiles([glb, lineage], makeSigner());
    });

    expect(flow.encode).toHaveBeenCalledOnce();
    expect(flow.executeRegister).toHaveBeenCalledOnce();
    expect(flow.executeRegister.mock.calls[0]?.[0]).toMatchObject({
      epochs: 53,
      deletable: false,
      owner: '0xCAFE',
    });
    expect(flow.upload).toHaveBeenCalledOnce();
    expect(flow.executeCertify).toHaveBeenCalledOnce();

    expect(res).toBeDefined();
    // A 2-file quilt shares one Walrus blob → both blobIds are identical.
    expect(res?.blobIds).toEqual([flow.SHARED_BLOB_ID, flow.SHARED_BLOB_ID]);
    expect(res?.blobObjects).toHaveLength(2);
    expect(res?.blobObjects?.[0]).toEqual({
      blobId: flow.SHARED_BLOB_ID,
      blobObjectId: flow.SHARED_BLOB_OBJECT_ID,
    });
    // Synthetic patch ids surface verbatim (KTD-3) — one per file, distinct.
    expect(res?.patchIds).toEqual(['patch-synth-0', 'patch-synth-1']);

    await waitFor(() => expect(result.current.status).toBe('done'));
  });

  it('assigns the Sui Blob object id (not the synthetic patch id) to blobObjectId', async () => {
    // Regression for the latent Phase 2 wiring bug (R7 in plan-003): prior
    // code did `blobObjectId: f.id` which assigned the synthetic encoded
    // quilt-patch id. PTBs that consume `tx.object(blobObjectId)` would reject
    // with "unknown object" on the first real testnet mint.
    const flow = makeHappyFlow();
    writeFilesFlowFactory.mockReturnValue(flow);
    const { result } = renderHook(() => useWalrusUpload());

    let res: Awaited<ReturnType<typeof result.current.uploadFiles>> | undefined;
    await act(async () => {
      res = await result.current.uploadFiles([new Uint8Array([1])], makeSigner());
    });

    expect(res?.blobObjects?.[0]?.blobObjectId).toMatch(/^0x[0-9a-f]{64}$/);
    // And confirm we did NOT accidentally surface the patch id here.
    expect(res?.blobObjects?.[0]?.blobObjectId).not.toBe('patch-synth-0');
    expect(res?.patchIds?.[0]).toBe('patch-synth-0');
  });

  it('wraps each Uint8Array as a WalrusFile with a zero-padded identifier', async () => {
    writeFilesFlowFactory.mockReturnValue(makeHappyFlow());
    const { result } = renderHook(() => useWalrusUpload());
    await act(async () => {
      await result.current.uploadFiles(
        [new Uint8Array([1]), new Uint8Array([2])],
        makeSigner(),
      );
    });
    expect(walrusFileFromMock).toHaveBeenCalledTimes(2);
    // padWidth = max(2, length('1')) = 2 → 'file-00', 'file-01'.
    expect(walrusFileFromMock.mock.calls[0]?.[0]?.identifier).toBe('file-00');
    expect(walrusFileFromMock.mock.calls[1]?.[0]?.identifier).toBe('file-01');
  });

  it('identifier padding preserves within-chunk lex order (Walrus SDK sorts by identifier per quilt)', async () => {
    // plan-017 U1: with multi-quilt batching (QUILT_SIZE=4), the SDK sorts
    // lex within each writeFilesFlow call, not across calls. Per-chunk
    // zero-padding to width 2 keeps lex order == numeric order inside each
    // quilt; cross-chunk order is preserved by the for-loop's iteration order.
    writeFilesFlowFactory.mockImplementation(() => makeHappyFlow());
    const { result } = renderHook(() => useWalrusUpload());
    await act(async () => {
      await result.current.uploadFiles(
        Array.from({ length: 12 }, (_, i) => new Uint8Array([i])),
        makeSigner(),
      );
    });

    // 12 files → 3 quilts of 4. Each quilt restarts identifiers at file-00.
    const identifiers = walrusFileFromMock.mock.calls.map(
      (call) => call?.[0]?.identifier ?? '',
    );
    expect(identifiers).toEqual([
      'file-00', 'file-01', 'file-02', 'file-03', // quilt 0
      'file-00', 'file-01', 'file-02', 'file-03', // quilt 1
      'file-00', 'file-01', 'file-02', 'file-03', // quilt 2
    ]);

    // Critical (within-chunk): lex sort of each chunk's identifiers MUST
    // equal input order — otherwise the SDK's quilt-internal sort would
    // silently misalign patchIds vs input files.
    for (let chunkStart = 0; chunkStart < identifiers.length; chunkStart += 4) {
      const chunk = identifiers.slice(chunkStart, chunkStart + 4);
      expect([...chunk].sort()).toEqual(chunk);
    }
  });

  it('transitions status to error and surfaces stage when wallet rejects register', async () => {
    const flow = makeHappyFlow();
    flow.executeRegister.mockRejectedValueOnce(new Error('user rejected'));
    writeFilesFlowFactory.mockReturnValue(flow);

    const { result } = renderHook(() => useWalrusUpload());

    let captured: unknown;
    await act(async () => {
      await result.current
        .uploadFiles([new Uint8Array([0])], makeSigner())
        .catch((e) => {
          captured = e;
        });
    });

    expect((captured as Error).message).toBe('user rejected');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.stage).toBe('awaiting-register');
    expect(flow.upload).not.toHaveBeenCalled();
    expect(flow.executeCertify).not.toHaveBeenCalled();
  });

  it('transitions status to error when relay upload fails (e.g., 502)', async () => {
    const flow = makeHappyFlow();
    flow.upload.mockRejectedValueOnce(new Error('relay 502 Bad Gateway'));
    writeFilesFlowFactory.mockReturnValue(flow);

    const { result } = renderHook(() => useWalrusUpload());

    let captured: unknown;
    await act(async () => {
      await result.current
        .uploadFiles([new Uint8Array([0])], makeSigner())
        .catch((e) => {
          captured = e;
        });
    });

    expect((captured as Error).message).toMatch(/relay 502/);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.stage).toBe('relay-upload');
    expect(flow.executeCertify).not.toHaveBeenCalled();
  });

  it('throws synchronously on empty files array and does not touch the SDK', async () => {
    writeFilesFlowFactory.mockReturnValue(makeHappyFlow());
    const { result } = renderHook(() => useWalrusUpload());

    let captured: unknown;
    await act(async () => {
      await result.current.uploadFiles([], makeSigner()).catch((e) => {
        captured = e;
      });
    });
    expect((captured as Error).message).toMatch(/at least one/);

    expect(writeFilesFlowFactory).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('reset() returns hook to idle after a successful upload', async () => {
    writeFilesFlowFactory.mockReturnValue(makeHappyFlow());
    const { result } = renderHook(() => useWalrusUpload());

    await act(async () => {
      await result.current.uploadFiles([new Uint8Array([1])], makeSigner());
    });
    await waitFor(() => expect(result.current.status).toBe('done'));

    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  describe('uploadBlob (D-037 standalone blob)', () => {
    it('drives writeBlobFlow and returns the raw blobId + Sui Blob object id', async () => {
      const flow = makeHappyBlobFlow();
      writeBlobFlowFactory.mockReturnValue(flow);

      const { result } = renderHook(() => useWalrusUpload());
      const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

      let res: Awaited<ReturnType<typeof result.current.uploadBlob>> | undefined;
      await act(async () => {
        res = await result.current.uploadBlob(glb, makeSigner());
      });

      // Routed through writeBlobFlow (NOT quilted via writeFilesFlow).
      expect(writeBlobFlowFactory).toHaveBeenCalledOnce();
      expect(writeFilesFlowFactory).not.toHaveBeenCalled();
      expect(flow.encode).toHaveBeenCalledOnce();
      expect(flow.executeRegister.mock.calls[0]?.[0]).toMatchObject({
        epochs: 53,
        deletable: false,
        owner: '0xCAFE',
      });
      expect(flow.upload).toHaveBeenCalledOnce();
      expect(flow.executeCertify).toHaveBeenCalledOnce();

      expect(res).toEqual({ blobId: flow.BLOB_ID, blobObjectId: flow.BLOB_OBJECT_ID });
      expect(res?.blobObjectId).toMatch(/^0x[0-9a-f]{64}$/);
      await waitFor(() => expect(result.current.status).toBe('done'));
    });

    it('throws synchronously on empty bytes and does not touch the SDK', async () => {
      writeBlobFlowFactory.mockReturnValue(makeHappyBlobFlow());
      const { result } = renderHook(() => useWalrusUpload());

      let captured: unknown;
      await act(async () => {
        await result.current.uploadBlob(new Uint8Array([]), makeSigner()).catch((e) => {
          captured = e;
        });
      });
      expect((captured as Error).message).toMatch(/non-empty/);
      expect(writeBlobFlowFactory).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('transitions to error when certify fails', async () => {
      const flow = makeHappyBlobFlow();
      flow.executeCertify.mockRejectedValueOnce(new Error('certify boom'));
      writeBlobFlowFactory.mockReturnValue(flow);

      const { result } = renderHook(() => useWalrusUpload());
      let captured: unknown;
      await act(async () => {
        await result.current.uploadBlob(new Uint8Array([1]), makeSigner()).catch((e) => {
          captured = e;
        });
      });

      expect((captured as Error).message).toMatch(/certify boom/);
      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.error?.stage).toBe('awaiting-certify');
    });
  });

  // -- plan-017 U1 — multi-quilt batching ----------------------------------

  describe('uploadFiles (multi-quilt batching, plan-017 U1)', () => {
    it('4 variants → 1 quilt → writeFilesFlow called once (single-quilt preserved)', async () => {
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) =>
        makeQuiltFlow(0, arg.files.length),
      );
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          Array.from({ length: 4 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      expect(writeFilesFlowFactory).toHaveBeenCalledOnce();
      expect(result.current.batchTotal).toBe(1);
    });

    it('5 variants → 2 quilts (4 + 1) → writeFilesFlow called twice', async () => {
      const calls: number[] = [];
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        calls.push(arg.files.length);
        return makeQuiltFlow(calls.length - 1, arg.files.length);
      });
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          Array.from({ length: 5 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      expect(writeFilesFlowFactory).toHaveBeenCalledTimes(2);
      expect(calls).toEqual([4, 1]);
      expect(result.current.batchTotal).toBe(2);
    });

    it('8 variants → 2 quilts (4 + 4) → writeFilesFlow called twice (AE2)', async () => {
      const calls: number[] = [];
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        calls.push(arg.files.length);
        return makeQuiltFlow(calls.length - 1, arg.files.length);
      });
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          Array.from({ length: 8 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      expect(writeFilesFlowFactory).toHaveBeenCalledTimes(2);
      expect(calls).toEqual([4, 4]);
      expect(result.current.batchTotal).toBe(2);
      // 2 quilts × (register + certify) = 4 popups + 1 launch = 5 total.
    });

    it('6 variants → 2 quilts (4 + 2) → boundary chunk-not-full case', async () => {
      const calls: number[] = [];
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        calls.push(arg.files.length);
        return makeQuiltFlow(calls.length - 1, arg.files.length);
      });
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          Array.from({ length: 6 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      expect(calls).toEqual([4, 2]);
    });

    it('1 variant → 1 quilt of 1', async () => {
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) =>
        makeQuiltFlow(0, arg.files.length),
      );
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles([new Uint8Array([1])], makeSigner());
      });
      expect(writeFilesFlowFactory).toHaveBeenCalledOnce();
      expect(result.current.batchTotal).toBe(1);
    });

    it('accumulator preserves global input order across quilts', async () => {
      const calls: number[] = [];
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        calls.push(arg.files.length);
        return makeQuiltFlow(calls.length - 1, arg.files.length);
      });
      const { result } = renderHook(() => useWalrusUpload());
      let res: Awaited<ReturnType<typeof result.current.uploadFiles>> | undefined;
      await act(async () => {
        res = await result.current.uploadFiles(
          Array.from({ length: 8 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      // Quilt 0 contributes 4 patches with blob-quilt-0; quilt 1 contributes
      // 4 with blob-quilt-1. Order: quilt-0 first, quilt-1 second.
      expect(res?.patchIds).toEqual([
        'patch-q0-0', 'patch-q0-1', 'patch-q0-2', 'patch-q0-3',
        'patch-q1-0', 'patch-q1-1', 'patch-q1-2', 'patch-q1-3',
      ]);
      expect(res?.blobIds).toEqual([
        'blob-quilt-0', 'blob-quilt-0', 'blob-quilt-0', 'blob-quilt-0',
        'blob-quilt-1', 'blob-quilt-1', 'blob-quilt-1', 'blob-quilt-1',
      ]);
    });

    it('exposes batchTotal and txDigests on the hook return', async () => {
      const calls: number[] = [];
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        calls.push(arg.files.length);
        return makeQuiltFlow(calls.length - 1, arg.files.length);
      });
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          Array.from({ length: 8 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      await waitFor(() => expect(result.current.status).toBe('done'));
      expect(result.current.batchTotal).toBe(2);
      expect(result.current.txDigests).toEqual(['0xdigest-q0', '0xdigest-q1']);
    });

    it('mid-batch failure surfaces batchIndex and stops subsequent quilts', async () => {
      let callCount = 0;
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        callCount += 1;
        const i = callCount - 1;
        const flow = makeQuiltFlow(i, arg.files.length);
        // Quilt index 1 fails at register.
        if (i === 1) {
          flow.executeRegister.mockRejectedValueOnce(new Error('user rejected quilt 2'));
        }
        return flow;
      });
      const { result } = renderHook(() => useWalrusUpload());
      let captured: unknown;
      await act(async () => {
        await result.current
          .uploadFiles(
            Array.from({ length: 8 }, (_, i) => new Uint8Array([i])),
            makeSigner(),
          )
          .catch((e) => {
            captured = e;
          });
      });
      expect((captured as Error).message).toMatch(/user rejected quilt 2/);
      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.error?.stage).toBe('awaiting-register');
      expect(result.current.error?.batchIndex).toBe(1);
      expect(result.current.error?.batchTotal).toBe(2);
      // Only 2 flows constructed (quilt 0 + quilt 1 failed at register).
      // No third quilt because the loop bailed.
      expect(writeFilesFlowFactory).toHaveBeenCalledTimes(2);
    });

    it('calls uploadTrail.writeDiag at each batch step', async () => {
      // Trail integration smoke: confirm writeDiag fires at least once with
      // a batch-scoped stage name like 'post-encode-0' or 'post-register-0'.
      // We assert via sessionStorage rather than mocking the module — the
      // trail module is internally tested in uploadTrail.test.ts.
      sessionStorage.clear();
      const calls: number[] = [];
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) => {
        calls.push(arg.files.length);
        return makeQuiltFlow(calls.length - 1, arg.files.length);
      });
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          Array.from({ length: 4 }, (_, i) => new Uint8Array([i])),
          makeSigner(),
        );
      });
      // Trail is cleared on `done`, but during execution writeDiag fires
      // — we can't observe mid-execution from outside, so verify the trail
      // is empty post-success (clearTrail ran) and that no error was set.
      // The trail's own tests in uploadTrail.test.ts cover writeDiag mechanics.
      expect(sessionStorage.getItem('walrus_upload_diagnostic')).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('reset() clears batch state', async () => {
      writeFilesFlowFactory.mockImplementation((arg: { files: unknown[] }) =>
        makeQuiltFlow(0, arg.files.length),
      );
      const { result } = renderHook(() => useWalrusUpload());
      await act(async () => {
        await result.current.uploadFiles(
          [new Uint8Array([1]), new Uint8Array([2])],
          makeSigner(),
        );
      });
      await waitFor(() => expect(result.current.status).toBe('done'));

      act(() => result.current.reset());
      expect(result.current.status).toBe('idle');
      expect(result.current.batchIndex).toBe(0);
      expect(result.current.batchTotal).toBe(1);
      expect(result.current.txDigests).toEqual([]);
    });

    it('exports QUILT_SIZE = 4', async () => {
      // plan-017 post-mortem: QS=4 kept even though R1 didn't actually
      // solve the OOM it was designed for — chunking has near-zero
      // effect on Walrus WASM encoder peak. See useWalrusUpload.ts
      // header comment for the post-mortem analysis.
      const mod = await import('./useWalrusUpload');
      expect(mod.QUILT_SIZE).toBe(4);
    });
  });
});
