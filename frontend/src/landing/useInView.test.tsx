import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { useInView } from './useInView';

// ---------------------------------------------------------------------------
// Controllable IntersectionObserver mock — captures instances so tests can
// fire the intersection callback by hand.
// ---------------------------------------------------------------------------
class MockIO {
  static instances: MockIO[] = [];
  cb: IntersectionObserverCallback;
  observed = new Set<Element>();
  disconnected = false;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    MockIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }
  fire(isIntersecting: boolean) {
    act(() => {
      this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    });
  }
}

const original = globalThis.IntersectionObserver;

function lastObserving(): MockIO {
  // The active observer is the most recent one that has an observed element
  // (StrictMode creates throwaway instances whose observers were disconnected).
  const live = MockIO.instances.filter((i) => i.observed.size > 0 && !i.disconnected);
  return live[live.length - 1] ?? MockIO.instances[MockIO.instances.length - 1];
}

function Probe({ once }: { once?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once });
  return <div ref={ref} data-testid="probe" data-inview={String(inView)} />;
}

beforeEach(() => {
  MockIO.instances = [];
  globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = original;
  vi.restoreAllMocks();
});

describe('useInView', () => {
  it('starts not-in-view, flips true on intersection, back false on exit', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').dataset.inview).toBe('false');

    lastObserving().fire(true);
    expect(getByTestId('probe').dataset.inview).toBe('true');

    lastObserving().fire(false);
    expect(getByTestId('probe').dataset.inview).toBe('false');
  });

  it('once: latches true and stops observing after first intersection', () => {
    const { getByTestId } = render(<Probe once />);
    const io = lastObserving();
    io.fire(true);
    expect(getByTestId('probe').dataset.inview).toBe('true');
    expect(io.disconnected).toBe(true);
    // A later "exit" must not reset a latched value.
    io.fire(false);
    expect(getByTestId('probe').dataset.inview).toBe('true');
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Probe />);
    const io = lastObserving();
    unmount();
    expect(io.disconnected).toBe(true);
  });

  it('falls back to in-view when IntersectionObserver is unavailable (SSR/jsdom)', () => {
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').dataset.inview).toBe('true');
  });

  it('survives a StrictMode double-mount without leaking an active observer', () => {
    const { getByTestId } = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    lastObserving().fire(true);
    expect(getByTestId('probe').dataset.inview).toBe('true');
  });
});
