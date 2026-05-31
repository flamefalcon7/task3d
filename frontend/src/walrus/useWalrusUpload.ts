import { useCallback, useEffect, useRef, useState } from 'react';
import type { Signer } from '@mysten/sui/cryptography';
import { WalrusFile } from '@mysten/walrus';
import { getWalrusClient, type WalrusEnhancedClient } from './walrusClient';
import { clearTrail, surfaceStaleTrail, writeDiag } from './uploadTrail';

// plan-017 U1 / D-062 — multi-quilt batching size. N variants chunked into
// K = ⌈N/QUILT_SIZE⌉ quilts.
//
// POST-MORTEM (2026-05-28): R1 multi-quilt batching turned out to NOT
// solve the OOM it was designed for. Empirical data:
//   - shuriken (4.40 MB/variant) × 8 = 35 MB total: ✅ at any QS (4/2/16)
//   - pickup truck (5.80 MB/variant) × 8 = 46 MB total: ❌ at any QS
// The Walrus WASM encoder (`@mysten/walrus-wasm` Reed-Solomon) has a
// per-quilt baseline working memory that doesn't scale linearly with
// input bytes — chunking provides negligible heap savings. The actual
// OOM gate is total input bytes × encoder constant ≈ 100×, regardless
// of chunk count. See docs/solutions/integration-issues/
// walrus-encoder-oom-investigation-2026-05-28.md for the full
// investigation + open questions filed for Walrus team consult.
//
// QUILT_SIZE = 4 kept anyway, because:
//   1. The chunked code path is correct and tested (no harm)
//   2. BatchProgressPanel UX surfaces the Walrus quilt structure to
//      users — kept as a hackathon positioning beat for the Walrus track
//   3. Future SDK improvements may make chunking actually load-bearing
//   4. Reverting would just be cleanup for cleanup's sake
//
// Real root-cause fix (mesh decimation in backend swap pipeline) deferred
// pending mentor consult; user does not want to sacrifice mesh quality
// without confirming there's no better path from the Walrus team.
export const QUILT_SIZE = 4;

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

// Finer-grained stage exposed reactively so consumers (MintButton) can label
// each wallet popup correctly — generic counts are unreliable since
// writeFilesFlow always uses exactly 2 popups per quilt regardless of file
// count (see docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching).
// plan-017 U1 — names preserved for backward compat with existing consumers;
// multi-quilt is layered orthogonally via batchIndex/batchTotal.
export type UploadStage =
  | 'idle'
  | 'encoding'
  | 'awaiting-register'
  | 'relay-upload'
  | 'awaiting-certify'
  | 'done'
  | 'error';

export interface BlobUploadResult {
  blobId: string;
  blobObjectId: string;
}

export interface UploadResult {
  blobIds: string[];
  blobObjects: BlobUploadResult[];
  // Synthetic quilt-patch IDs from encodeQuiltPatchId — one per file. All files
  // in a quilt share the same Sui Blob object; patchIds address individual
  // files within the shared blob. Used by Collection Forge to bind each
  // Model3D variant to its slice (KTD-3). With multi-quilt batching, the
  // accumulator preserves global input order across quilts.
  patchIds: string[];
}

export interface UploadError {
  stage: Exclude<UploadStage, 'idle' | 'done' | 'error'>;
  cause: unknown;
  // plan-017 U1 — populated when the failure occurred during the chunked
  // upload loop. batchIndex = the failing quilt (0-based); batchTotal =
  // total quilts the upload tried. Earlier quilts (< batchIndex) succeeded
  // and their Walrus blobs are alive but orphaned (no on-chain Collection
  // object exists yet — created by LaunchCollectionPage after upload
  // resolves). The orphan blobs expire on the epoch boundary if unused.
  batchIndex?: number;
  batchTotal?: number;
}

export interface UseWalrusUploadOptions {
  /** Override client (for tests / Phase 4 mainnet switcher). */
  client?: WalrusEnhancedClient;
  /** Storage epochs. Default 10 per spec.md §2.5. */
  epochs?: number;
}

// Each writeFilesFlow call encodes K files into a single quilt blob then
// produces 2 wallet popups (register + certify). With multi-quilt batching,
// total popups = 2K + 1 (the +1 is the launch PTB owned by LaunchCollectionPage).
// Verified against @mysten/walrus@1.1.7 source (dist/flows/write-files.mjs):
// createWriteFilesFlow uses closure-scoped `let quiltBytes/quiltIndex` so
// each invocation returns an independent flow (no cross-quilt contamination).
// See docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching.
const WALRUS_POPUP_COUNT_PER_QUILT = 2;

export function useWalrusUpload(options: UseWalrusUploadOptions = {}) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [stage, setStage] = useState<UploadStage>('idle');
  // plan-017 U1 — multi-quilt progress state. batchIndex is 0-based; consumers
  // (BatchProgressPanel — U4) compute display strings like
  // "Quilt {batchIndex + 1} of {batchTotal}".
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(1);
  const [txDigests, setTxDigests] = useState<readonly string[]>([]);
  const [error, setError] = useState<UploadError | null>(null);
  const clientRef = useRef<WalrusEnhancedClient | null>(options.client ?? null);

  // plan-017 U6 — surface any stale crash diagnostic on first mount. The
  // surface guard inside uploadTrail makes this idempotent across multiple
  // useWalrusUpload mounts on the same page.
  useEffect(() => {
    surfaceStaleTrail();
  }, []);

  const getClient = useCallback((): WalrusEnhancedClient => {
    if (!clientRef.current) clientRef.current = getWalrusClient('testnet');
    return clientRef.current;
  }, []);

  // Upload ONE file as a STANDALONE (non-quilted) Walrus blob via writeBlobFlow.
  // Unlike uploadFiles (which always quilts, even for N=1), the returned blobId
  // resolves directly at the aggregator's `/v1/blobs/<blobId>` path to the raw
  // bytes — required by D-037 so a published Model3D's glb_blob_id previews the
  // base mesh and an nft creator can fork it. Same 2-popup cost as a single
  // uploadFiles quilt; writeFilesFlow delegates to this same flow.
  const uploadBlob = useCallback(
    async (bytes: Uint8Array, signer: Signer): Promise<BlobUploadResult> => {
      if (!bytes || bytes.length === 0) {
        throw new Error('useWalrusUpload: uploadBlob requires a non-empty Uint8Array');
      }

      setError(null);
      setStatus('uploading');
      setStage('encoding');

      const client = options.client ?? getClient();
      const owner = signer.toSuiAddress();
      const flow = client.walrus.writeBlobFlow({ blob: bytes });

      let lastStage: UploadStage = 'encoding';
      try {
        await flow.encode();

        lastStage = 'awaiting-register';
        setStage(lastStage);
        const registerResult = await flow.executeRegister({
          signer,
          epochs: options.epochs ?? 10,
          deletable: false,
          owner,
        });

        lastStage = 'relay-upload';
        setStage(lastStage);
        await flow.upload({ digest: registerResult.txDigest });

        lastStage = 'awaiting-certify';
        setStage(lastStage);
        const certified = await flow.executeCertify({ signer });

        setStage('done');
        setStatus('done');
        return { blobId: certified.blobId, blobObjectId: certified.blobObjectId };
      } catch (cause) {
        const failedStage = lastStage as UploadError['stage'];
        setError({ stage: failedStage, cause });
        setStage('error');
        setStatus('error');
        throw cause;
      }
    },
    [getClient, options.client, options.epochs],
  );

  const uploadFiles = useCallback(
    async (
      files: Uint8Array[],
      signer: Signer,
      // plan-026 — `quiltSize` overrides the default chunk size for THIS call.
      // The encrypted publish passes files.length to force ONE quilt (ciphertext
      // + N preview stills in a single register+certify → 3 popups), independent
      // of the global QUILT_SIZE (which still drives the forker's variant bake +
      // its BatchProgressPanel popup math). Safe per the OOM post-mortem: chunking
      // doesn't reduce encoder memory; the gate is TOTAL bytes, not chunk count.
      opts?: { quiltSize?: number },
    ): Promise<UploadResult> => {
      if (!files || files.length === 0) {
        throw new Error('useWalrusUpload: files array must contain at least one Uint8Array');
      }
      const chunkSize = Math.max(1, opts?.quiltSize ?? QUILT_SIZE);

      setError(null);
      setStatus('uploading');
      setStage('encoding');
      setBatchIndex(0);
      setTxDigests([]);

      const total = Math.ceil(files.length / chunkSize);
      setBatchTotal(total);

      const startedAt = performance.now();
      writeDiag('pre-encode', startedAt, {
        fileCount: files.length,
        batchTotal: total,
      });

      const client = options.client ?? getClient();
      const owner = signer.toSuiAddress();

      // Accumulators preserving global input order across quilts. The for-loop
      // iterates chunks in input order, so appending to flat arrays inside
      // each iteration gives a globally-ordered final result.
      const aggBlobIds: string[] = [];
      const aggBlobObjects: BlobUploadResult[] = [];
      const aggPatchIds: string[] = [];
      const collectedDigests: string[] = [];

      let lastStage: UploadStage = 'encoding';
      let currentBatchIndex = 0;

      try {
        for (let i = 0; i < total; i++) {
          currentBatchIndex = i;
          setBatchIndex(i);
          const chunk = files.slice(i * chunkSize, (i + 1) * chunkSize);
          // Identifier zero-pad MUST be set per-chunk (not globally) because
          // @mysten/walrus@1.1.7 sorts lex within each quilt's encodeQuilt
          // call. Within a chunk of up to QUILT_SIZE=4, pad-width 2 is
          // always sufficient (max identifier 'file-03') and lex order
          // equals numeric order.
          const padWidth = Math.max(2, String(chunk.length - 1).length);
          const walrusFiles = chunk.map((bytes, idx) =>
            WalrusFile.from({
              contents: bytes,
              identifier: `file-${String(idx).padStart(padWidth, '0')}`,
            }),
          );

          // typed as nullable so we can release the flow reference between
          // chunks — V8 reclaims the quilt assembly buffer before the next
          // chunk allocates its own.
          let flow: ReturnType<WalrusEnhancedClient['walrus']['writeFilesFlow']> | null =
            client.walrus.writeFilesFlow({ files: walrusFiles });

          setStage('encoding');
          lastStage = 'encoding';
          writeDiag(`pre-encode-${i}`, startedAt, { batchIndex: i });
          await flow.encode();
          writeDiag(`post-encode-${i}`, startedAt, { batchIndex: i });

          lastStage = 'awaiting-register';
          setStage(lastStage);
          writeDiag(`pre-register-${i}`, startedAt, { batchIndex: i });
          // executeRegister returns a WriteBlobStepRegistered carrying the
          // on-chain register tx digest. flow.upload() needs that digest
          // (or a resume.blobObjectId) to bind the upload-relay write to
          // the just-registered Blob — without it the SDK throws
          // "Either resume.blobObjectId or upload digest must be provided".
          const registerResult = await flow.executeRegister({
            signer,
            epochs: options.epochs ?? 10,
            deletable: false,
            owner,
          });
          collectedDigests.push(registerResult.txDigest);
          setTxDigests([...collectedDigests]);
          writeDiag(`post-register-${i}`, startedAt, {
            batchIndex: i,
            txDigest: registerResult.txDigest,
          });

          lastStage = 'relay-upload';
          setStage(lastStage);
          writeDiag(`pre-upload-${i}`, startedAt, { batchIndex: i });
          await flow.upload({ digest: registerResult.txDigest });
          writeDiag(`post-upload-${i}`, startedAt, { batchIndex: i });

          lastStage = 'awaiting-certify';
          setStage(lastStage);
          writeDiag(`pre-certify-${i}`, startedAt, { batchIndex: i });
          await flow.executeCertify({ signer });
          writeDiag(`post-certify-${i}`, startedAt, { batchIndex: i });

          // flow.listFiles() returns N entries (this quilt's slice), all
          // sharing the same blobObject and blobId. Append to global
          // accumulator so cross-quilt order = global input order.
          type FileRef = { id: string; blobId: string; blobObject: { id: string } };
          const fileRefs: FileRef[] = await flow.listFiles();
          for (const f of fileRefs) {
            aggBlobIds.push(f.blobId);
            aggBlobObjects.push({ blobId: f.blobId, blobObjectId: f.blobObject.id });
            aggPatchIds.push(f.id);
          }

          // Explicit null-out so V8 can reclaim this quilt's working set
          // (Promise.all encode buffers, listFiles refs) before the next
          // chunk's flow allocates. React closure refs hold only the digest
          // strings + result accumulator, never raw flow objects.
          flow = null;
          // plan-017 P1-B: yield to the event loop between chunks. V8's
          // major-GC is opportunistic — without a task-queue boundary
          // between `flow = null` and the next iteration's `writeFilesFlow`
          // + `flow.encode()` allocations, the previous chunk's encode
          // buffer (~120 MB) may still be live garbage when the next
          // 120 MB allocation begins → 240 MB transient peak instead of
          // the budgeted 120 MB, undercutting the entire heap envelope
          // this plan was designed around. setTimeout(0) costs ~4ms per
          // chunk (negligible vs the ~10s upload) but gives V8 a clean
          // allocation pause. Found by plan-017 adversarial review.
          if (i < total - 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        setStage('done');
        setStatus('done');
        clearTrail();
        return {
          blobIds: aggBlobIds,
          blobObjects: aggBlobObjects,
          patchIds: aggPatchIds,
        };
      } catch (cause) {
        const failedStage = lastStage as UploadError['stage'];
        setError({
          stage: failedStage,
          cause,
          batchIndex: currentBatchIndex,
          batchTotal: total,
        });
        setStage('error');
        setStatus('error');
        clearTrail();
        throw cause;
      }
    },
    [getClient, options.client, options.epochs],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setStage('idle');
    setBatchIndex(0);
    setBatchTotal(1);
    setTxDigests([]);
    setError(null);
  }, []);

  return {
    uploadFiles,
    uploadBlob,
    status,
    stage,
    batchIndex,
    batchTotal,
    txDigests,
    error,
    reset,
    /** Per-quilt popup count (register + certify). Total = popupCount × ceil(N/QUILT_SIZE). */
    popupCount: WALRUS_POPUP_COUNT_PER_QUILT,
  };
}
