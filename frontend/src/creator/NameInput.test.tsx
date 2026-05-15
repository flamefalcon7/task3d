import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NameInput, suggestNameFromTags } from './NameInput';

afterEach(() => cleanup());

describe('NameInput', () => {
  it('truncates input over 128 chars', () => {
    const onChange = vi.fn();
    render(<NameInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('name-input'), {
      target: { value: 'x'.repeat(200) },
    });
    expect(onChange).toHaveBeenCalledWith('x'.repeat(128));
  });

  it('passes value through to input', () => {
    render(<NameInput value="My Model" onChange={() => {}} />);
    expect(
      (screen.getByTestId('name-input') as HTMLInputElement).value,
    ).toBe('My Model');
  });
});

describe('suggestNameFromTags', () => {
  it('capitalizes first 2 tags and joins with space', () => {
    expect(suggestNameFromTags(['fantasy', 'chest', 'wood'])).toBe(
      'Fantasy Chest',
    );
  });

  it('handles single tag', () => {
    expect(suggestNameFromTags(['box'])).toBe('Box');
  });

  it('returns empty string for empty tags', () => {
    expect(suggestNameFromTags([])).toBe('');
  });

  it('caps at 128 chars', () => {
    const long = 'x'.repeat(200);
    expect(suggestNameFromTags([long]).length).toBeLessThanOrEqual(128);
  });
});
