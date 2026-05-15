interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

const MAX = 128;

export function NameInput({ value, onChange, disabled }: Props) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, MAX))}
      placeholder="Model name (required)"
      disabled={disabled}
      style={{ width: '100%' }}
      maxLength={MAX}
      data-testid="name-input"
    />
  );
}

export function suggestNameFromTags(tags: string[]): string {
  return tags
    .slice(0, 2)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ')
    .slice(0, MAX);
}
