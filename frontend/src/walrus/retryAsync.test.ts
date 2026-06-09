import { describe, expect, it, vi } from 'vitest';
import { isRetryableUploadError, retryAsync } from './retryAsync';

const noSleep = () => Promise.resolve();

describe('retryAsync', () => {
  it('returns the first result without retrying on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryAsync(fn, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries then succeeds within the attempt budget', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('signal timed out'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const result = await retryAsync(fn, { sleep: noSleep, onRetry });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('signal timed out'));
    await expect(retryAsync(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow(
      'signal timed out',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad request'));
    await expect(
      retryAsync(fn, { sleep: noSleep, shouldRetry: () => false }),
    ).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors a custom attempt count', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(retryAsync(fn, { attempts: 5, sleep: noSleep })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(5);
  });
});

describe('isRetryableUploadError', () => {
  it('matches the AbortSignal.timeout DOMException', () => {
    const e = new Error('signal timed out');
    e.name = 'TimeoutError';
    expect(isRetryableUploadError(e)).toBe(true);
  });

  it('matches RetryableWalrusClientError by name', () => {
    const e = new Error('committee changed');
    e.name = 'RetryableWalrusClientError';
    expect(isRetryableUploadError(e)).toBe(true);
  });

  it('matches timeout/network message heuristics', () => {
    expect(isRetryableUploadError(new Error('request timed out'))).toBe(true);
    expect(isRetryableUploadError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableUploadError(new Error('network error'))).toBe(true);
    expect(isRetryableUploadError(new Error('ECONNRESET'))).toBe(true);
  });

  it('does NOT match genuine non-transient errors', () => {
    expect(isRetryableUploadError(new Error('400 bad request'))).toBe(false);
    expect(isRetryableUploadError(new Error('insufficient gas'))).toBe(false);
    expect(isRetryableUploadError(null)).toBe(false);
    expect(isRetryableUploadError(undefined)).toBe(false);
  });
});
