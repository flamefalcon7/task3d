import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CopilotBar } from './CopilotBar';

afterEach(cleanup);

function bar(props: Partial<Parameters<typeof CopilotBar>[0]> = {}) {
  render(
    <CopilotBar
      personalStatus="idle"
      communityStatus="idle"
      personalCount={0}
      communityCount={0}
      {...props}
    />,
  );
}

describe('CopilotBar', () => {
  it('is always present and identifies the copilot', () => {
    bar();
    expect(screen.getByTestId('copilot-bar')).toBeTruthy();
    expect(screen.getByText(/Riff Copilot/)).toBeTruthy();
  });

  it('idle → invite copy', () => {
    bar();
    expect(screen.getByText(/Describe a model to recall/i)).toBeTruthy();
  });

  it('loading → recalling copy', () => {
    bar({ personalStatus: 'loading' });
    expect(screen.getByText(/Recalling from Walrus memory/i)).toBeTruthy();
  });

  it('empty (searched, nothing) → neutral "No similar models found"', () => {
    bar({ personalStatus: 'empty', communityStatus: 'empty' });
    expect(screen.getByText(/No similar models found/i)).toBeTruthy();
  });

  it('found → no status text (sections carry detail), bar still present', () => {
    bar({ personalStatus: 'ready', personalCount: 3 });
    expect(screen.getByTestId('copilot-bar')).toBeTruthy();
    expect(screen.queryByText(/No similar models found/i)).toBeNull();
    expect(screen.queryByText(/Describe a model to recall/i)).toBeNull();
    expect(screen.queryByText(/Recalling from Walrus/i)).toBeNull();
  });

  it('loading takes priority even if the other source is empty', () => {
    bar({ personalStatus: 'empty', communityStatus: 'loading' });
    expect(screen.getByText(/Recalling from Walrus memory/i)).toBeTruthy();
  });
});
