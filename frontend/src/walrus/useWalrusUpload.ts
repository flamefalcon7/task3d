import { useCallback, useRef, useState } from 'react';
import type { Signer } from '@mysten/sui/cryptography';
import { WalrusFile } from '@mysten/walrus';
import { getWalrusClient, type WalrusEnhancedClient } from './walrusClient';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

// Finer-grained stage exposed reactively so consumers (MintButton) can label
// each wallet popup correctly — generic counts are unreliable since the
// underlying writeFilesFlow always uses exactly 2 popups regardless of file
// count (see docs/solutions/architecture-patterns/walrus-writefilesflow-popup-batching).
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
  // Model3D variant to its slice (KTD-3).
  patchIds: string[];
}

export interface UploadError {
  stage: Exclude<UploadStage, 'idle' | 'done' | 'error'>;
  cause: unknown;
}

export interface UseWalrusUploadOptions {
  /** Override client (for tests / Phase 4 mainnet switcher). */
  client?: WalrusEnhancedClient;
  /** Storage epochs. Default 10 per spec.md §2.5. */
  epochs?: number;
}

// writeFilesFlow encodes N files into a single quilt blob then delegates to
// writeBlobFlow → 1 register + 1 certify regardless of file count. The Walrus
// portion of any creator flow is exactly 2 popups; U7 layers a third for the
// model3d::publish_and_share PTB. Verified against @mysten/walrus@1.1.7 source
// (dist/flows/write-files.mjs). See docs/solutions/architecture-patterns/
// walrus-writefilesflow-popup-batching for the rationale.
const WALRUS_POPUP_COUNT = 2;

export function useWalrusUpload(options: UseWalrusUploadOptions = {}) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState<UploadError | null>(null);
  const clientRef = useRef<WalrusEnhancedClient | null>(options.client ?? null);

  const getClient = useCallback((): WalrusEnhancedClient => {
    if (!clientRef.current) clientRef.current = getWalrusClient('testnet');
    return clientRef.current;
  }, []);

  const uploadFiles = useCallback(
    async (files: Uint8Array[], signer: Signer): Promise<UploadResult> => {
      if (!files || files.length === 0) {
        throw new Error('useWalrusUpload: files array must contain at least one Uint8Array');
      }

      setError(null);
      setStatus('uploading');
      setStage('encoding');

      const client = options.client ?? getClient();
      const owner = signer.toSuiAddress();
      const walrusFiles = files.map((bytes, i) =>
        WalrusFile.from({ contents: bytes, identifier: `file-${i}` }),
      );

      const flow = client.walrus.writeFilesFlow({ files: walrusFiles });

      let lastStage: UploadStage = 'encoding';
      try {
        await flow.encode();

        lastStage = 'awaiting-register';
        setStage(lastStage);
        await flow.executeRegister({
          signer,
          epochs: options.epochs ?? 10,
          deletable: false,
          owner,
        });

        lastStage = 'relay-upload';
        setStage(lastStage);
        await flow.upload({});

        lastStage = 'awaiting-certify';
        setStage(lastStage);
        await flow.executeCertify({ signer });

        // flow.listFiles() returns N entries, all sharing the same blobObject
        // and blobId (quilt = 1 Sui Blob with N internal byte-range patches).
        // `f.id` is the synthetic encoded patch id; `f.blobObject.id` is the
        // real Sui object id consumed by tx.object(...) in downstream PTBs.
        type FileRef = { id: string; blobId: string; blobObject: { id: string } };
        const fileRefs: FileRef[] = await flow.listFiles();
        const result: UploadResult = {
          blobIds: fileRefs.map((f) => f.blobId),
          blobObjects: fileRefs.map((f) => ({
            blobId: f.blobId,
            blobObjectId: f.blobObject.id,
          })),
          patchIds: fileRefs.map((f) => f.id),
        };

        setStage('done');
        setStatus('done');
        return result;
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

  const reset = useCallback(() => {
    setStatus('idle');
    setStage('idle');
    setError(null);
  }, []);

  return {
    uploadFiles,
    status,
    stage,
    error,
    reset,
    popupCount: WALRUS_POPUP_COUNT,
  };
}
