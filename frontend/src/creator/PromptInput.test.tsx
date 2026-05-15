import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PromptInput } from './PromptInput';

afterEach(() => cleanup());

describe('PromptInput', () => {
  it('renders char counter showing length/200', () => {
    render(<PromptInput value="hello" onChange={() => {}} />);
    expect(screen.getByText('5 / 200')).toBeTruthy();
  });

  it('truncates input to 200 chars', () => {
    const onChange = vi.fn();
    render(<PromptInput value="" onChange={onChange} />);
    const longValue = 'a'.repeat(250);
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: longValue },
    });
    expect(onChange).toHaveBeenCalledWith('a'.repeat(200));
  });

  it('respects disabled prop', () => {
    render(<PromptInput value="" onChange={() => {}} disabled />);
    expect(
      (screen.getByTestId('prompt-input') as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });
});
