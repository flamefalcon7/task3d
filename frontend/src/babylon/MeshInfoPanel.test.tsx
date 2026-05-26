import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { formatBytes, MeshInfoPanel, truncateBlobId } from './MeshInfoPanel';

afterEach(() => cleanup());

describe('MeshInfoPanel', () => {
  it('renders all 3 mandatory rows with formatted values', () => {
    render(
      <MeshInfoPanel segmentCount={5} fileSizeBytes={2 * 1024 * 1024} materialCount={5} />,
    );
    expect(screen.getByTestId('mesh-info-segments').textContent).toMatch(/SEGMENTS.*5/);
    expect(screen.getByTestId('mesh-info-size').textContent).toMatch(/SIZE.*2\.0 MB/);
    expect(screen.getByTestId('mesh-info-materials').textContent).toMatch(/MATERIALS.*5/);
  });

  it('omits the BLOB row when walrusBlobId is undefined', () => {
    render(
      <MeshInfoPanel segmentCount={3} fileSizeBytes={1024} materialCount={3} />,
    );
    expect(screen.queryByTestId('mesh-info-blob')).toBeNull();
  });

  it('renders the BLOB row as a truncated mono pill when walrusBlobId is provided', () => {
    render(
      <MeshInfoPanel
        segmentCount={3}
        fileSizeBytes={1024}
        materialCount={3}
        walrusBlobId="abcdef1234567890mnopqrstuvwxyz"
      />,
    );
    const blob = screen.getByTestId('mesh-info-blob');
    // First 8 chars + ellipsis + last 4 chars (lower or upper-case allowed —
    // the panel preserves the input case but the row label is upper).
    expect(blob.textContent).toMatch(/abcdef12…wxyz/i);
    // Full id present in the title attribute for hover-inspect.
    const pill = blob.querySelector('[title]');
    expect(pill?.getAttribute('title')).toBe('abcdef1234567890mnopqrstuvwxyz');
  });

  it('omits the SIZE row when fileSizeBytes is 0 (unknown)', () => {
    render(<MeshInfoPanel segmentCount={1} fileSizeBytes={0} materialCount={1} />);
    expect(screen.queryByTestId('mesh-info-size')).toBeNull();
  });

  it('omits the MATERIALS row when materialCount is 0', () => {
    render(<MeshInfoPanel segmentCount={1} fileSizeBytes={1024} materialCount={0} />);
    expect(screen.queryByTestId('mesh-info-materials')).toBeNull();
  });

  it('renders SEGMENTS=0 without crashing (mid-load state)', () => {
    render(<MeshInfoPanel segmentCount={0} fileSizeBytes={0} materialCount={0} />);
    expect(screen.getByTestId('mesh-info-segments').textContent).toMatch(/SEGMENTS.*0/);
  });

  it('disambiguates testIds via the testIdSuffix prop', () => {
    render(
      <MeshInfoPanel
        segmentCount={1}
        fileSizeBytes={1024}
        materialCount={1}
        testIdSuffix="variant-strip"
      />,
    );
    expect(screen.getByTestId('mesh-info-segments-variant-strip')).toBeTruthy();
    expect(screen.queryByTestId('mesh-info-segments')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats bytes below 1 KB as plain bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats bytes below 1 MB as KB with 1 decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 100)).toBe('100.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats bytes ≥ 1 MB as MB with 1 decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('truncateBlobId', () => {
  it('passes short ids through unchanged', () => {
    expect(truncateBlobId('short')).toBe('short');
    expect(truncateBlobId('14characters!!')).toBe('14characters!!'); // exactly 14
  });

  it('truncates long ids to first 8 + ellipsis + last 4', () => {
    expect(truncateBlobId('abcdef1234567890mnopqrstuvwxyz')).toBe('abcdef12…wxyz');
  });
});
