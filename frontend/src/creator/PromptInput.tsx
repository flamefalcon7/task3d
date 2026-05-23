import { input as inputStyle, monoLabel, tokens } from '../ux/tokens';

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
        style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
        data-testid="prompt-input"
      />
      <div style={{ ...monoLabel, color: tokens.color.hint, marginTop: 4 }}>
        {value.length} / {MAX}
      </div>
    </div>
  );
}
