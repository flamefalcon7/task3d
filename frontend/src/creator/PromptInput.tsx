interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

const MAX = 200;

export function PromptInput({ value, onChange, disabled }: Props) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        placeholder="Describe what you want — e.g., 'ornate wooden chest with brass fittings'"
        disabled={disabled}
        rows={3}
        style={{ width: '100%' }}
        data-testid="prompt-input"
      />
      <div style={{ fontSize: 12, color: '#888' }}>
        {value.length} / {MAX}
      </div>
    </div>
  );
}
