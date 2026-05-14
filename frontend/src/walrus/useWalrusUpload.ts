import { useCallback, useRef, useState } from 'react';
import type { Signer } from '@mysten/sui/cryptography';
import { WalrusFile } from '@mysten/walrus';
import { getWalrusClient, type WalrusEnhancedClient } from './walrusClient';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

// Internal finer-grained state; surface as 'uploading' to the consumer.
// Tracked here so future debug UI / telemetry can read it via ref if needed.
type InternalStage =
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
}

export interface UploadError {
  stage: Exclude<InternalStage, 'idle' | 'done' | 'error'>;
  cause: unknown;
}

export interface UseWalrusUploadOptions {
  /** Override client (for tests / Phase 4 mainnet switcher). */
  client?: WalrusEnhancedClient;
  /** Storage epochs. Default 10 per spec.md §2.5. */
  epochs?: number;
}

// why: writeFilesFlow encodes N files into a single quilt blob then delegates
// to writeBlobFlow → 1 register + 1 certify regardless of file count. So
// `popupCount = 2` for the Walrus portion of any creator flow; U7 layers a
// third popup for the model3d::publish_and_share PTB. Verified against
// @mysten/walrus@1.1.7 source (dist/flows/write-files.mjs).
const WALRUS_POPUP_COUNT = 2;

export function useWalrusUpload(options: UseWalrusUploadOptions = {}) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<UploadError | null>(null);
  const stageRef = useRef<InternalStage>('idle');
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
      stageRef.current = 'encoding';

      const client = options.client ?? getClient();
      const owner = signer.toSuiAddress();
      const walrusFiles = files.map((bytes, i) =>
        WalrusFile.from({ contents: bytes, identifier: `file-${i}` }),
      );

      const flow = client.walrus.writeFilesFlow({ files: walrusFiles });

      try {
        await flow.encode();

        stageRef.current = 'awaiting-register';
        await flow.executeRegister({
          signer,
          epochs: options.epochs ?? 10,
          deletable: false,
          owner,
        });

        stageRef.current = 'relay-upload';
        await flow.upload({});

        stageRef.current = 'awaiting-certify';
        await flow.executeCertify({ signer });

        const fileRefs: Array<{ id: string; blobId: string }> = await flow.listFiles();
        const result: UploadResult = {
          blobIds: fileRefs.map((f: { blobId: string }) => f.blobId),
          blobObjects: fileRefs.map((f: { id: string; blobId: string }) => ({
            blobId: f.blobId,
            blobObjectId: f.id,
          })),
        };

        stageRef.current = 'done';
        setStatus('done');
        return result;
      } catch (cause) {
        const failedStage = stageRef.current as UploadError['stage'];
        stageRef.current = 'error';
        setError({ stage: failedStage, cause });
        setStatus('error');
        throw cause;
      }
    },
    [getClient, options.client, options.epochs],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    stageRef.current = 'idle';
  }, []);

  return {
    uploadFiles,
    status,
    error,
    reset,
    popupCount: WALRUS_POPUP_COUNT,
  };
}
