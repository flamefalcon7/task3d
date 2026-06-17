import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { LazyCanvasMount } from './LazyCanvasMount';

// Controllable IntersectionObserver mock — same shape as useInView.test.tsx.
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
  const live = MockIO.instances.filter((i) => i.observed.size > 0 && !i.disconnected);
  const found = live[live.length - 1] ?? MockIO.instances[MockIO.instances.length - 1];
  if (!found) throw new Error('no IntersectionObserver instance created');
  return found;
}

const CHILD = <div data-testid="heavy-child">CANVAS</div>;

beforeEach(() => {
  MockIO.instances = [];
  globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = original;
  vi.restoreAllMocks();
});

describe('LazyCanvasMount', () => {
  it('renders the placeholder and NOT the child while off-screen', () => {
    const { queryByTestId } = render(<LazyCanvasMount testId="lazy">{CHILD}</LazyCanvasMount>);
    expect(queryByTestId('heavy-child')).toBeNull();
    expect(queryByTestId('lazy')).not.toBeNull();
    expect(queryByTestId('lazy')?.textContent).toContain('PREVIEW');
  });

  it('mounts the child and drops the placeholder on intersection', () => {
    const { queryByTestId } = render(<LazyCanvasMount>{CHILD}</LazyCanvasMount>);
    lastObserving().fire(true);
    expect(queryByTestId('heavy-child')).not.toBeNull();
    expect(queryByTestId('heavy-child')?.textContent).toBe('CANVAS');
  });

  it('unmounts the child when it scrolls back off-screen (default dispose policy)', () => {
    const { queryByTestId } = render(<LazyCanvasMount>{CHILD}</LazyCanvasMount>);
    lastObserving().fire(true);
    expect(queryByTestId('heavy-child')).not.toBeNull();
    lastObserving().fire(false);
    expect(queryByTestId('heavy-child')).toBeNull();
  });

  it('keepMounted: child stays mounted after scrolling away', () => {
    const { queryByTestId } = render(<LazyCanvasMount keepMounted>{CHILD}</LazyCanvasMount>);
    const io = lastObserving();
    io.fire(true);
    expect(queryByTestId('heavy-child')).not.toBeNull();
    io.fire(false);
    expect(queryByTestId('heavy-child')).not.toBeNull();
  });

  it('renders a custom placeholder while off-screen', () => {
    const { queryByTestId } = render(
      <LazyCanvasMount placeholder={<div data-testid="custom-ph">loading…</div>}>{CHILD}</LazyCanvasMount>,
    );
    expect(queryByTestId('custom-ph')).not.toBeNull();
    expect(queryByTestId('heavy-child')).toBeNull();
  });

  it('renders the child eagerly when IntersectionObserver is unavailable (jsdom fallback)', () => {
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
    const { queryByTestId } = render(<LazyCanvasMount>{CHILD}</LazyCanvasMount>);
    expect(queryByTestId('heavy-child')).not.toBeNull();
  });

  it('survives a StrictMode double-mount and still mounts the child on intersection', () => {
    const { queryByTestId } = render(
      <StrictMode>
        <LazyCanvasMount>{CHILD}</LazyCanvasMount>
      </StrictMode>,
    );
    lastObserving().fire(true);
    expect(queryByTestId('heavy-child')).not.toBeNull();
  });
});
