import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CopilotChat } from './CopilotChat';
import type { CopilotMessage, CopilotStatus } from './useRiffCopilot';

afterEach(cleanup);

function panel(over: Partial<Parameters<typeof CopilotChat>[0]> = {}) {
  const onSend = vi.fn();
  const onGenerateNow = vi.fn();
  render(
    <CopilotChat
      messages={over.messages ?? []}
      status={over.status ?? ('idle' as CopilotStatus)}
      onSend={over.onSend ?? onSend}
      onGenerateNow={over.onGenerateNow ?? onGenerateNow}
    />,
  );
  return { onSend: over.onSend ?? onSend, onGenerateNow: over.onGenerateNow ?? onGenerateNow };
}

describe('CopilotChat', () => {
  it('empty state shows a kickoff hint and the input', () => {
    panel();
    expect(screen.getByTestId('copilot-chat')).toBeTruthy();
    expect(screen.getByTestId('copilot-answer-input')).toBeTruthy();
    expect(screen.getByText(/Describe your idea to start/i)).toBeTruthy();
  });

  it('renders a history-aware greeting from the copilot (AE3)', () => {
    const messages: CopilotMessage[] = [
      { role: 'assistant', content: 'Welcome back — you made three low-poly vehicles. A new one?' },
    ];
    panel({ messages, status: 'asking' });
    expect(screen.getByText(/three low-poly vehicles/i)).toBeTruthy();
  });

  it('renders a neutral opener with no fabricated history (AE4)', () => {
    const messages: CopilotMessage[] = [{ role: 'assistant', content: 'What would you like to make?' }];
    panel({ messages, status: 'asking' });
    expect(screen.getByText(/What would you like to make\?/i)).toBeTruthy();
    expect(screen.queryByText(/welcome back/i)).toBeNull();
  });

  it('Send forwards trimmed text and clears the box', () => {
    const { onSend } = panel({ status: 'idle' });
    fireEvent.change(screen.getByTestId('copilot-answer-input'), { target: { value: '  a red car  ' } });
    fireEvent.click(screen.getByTestId('copilot-send'));
    expect(onSend).toHaveBeenCalledWith('a red car');
    expect((screen.getByTestId('copilot-answer-input') as HTMLInputElement).value).toBe('');
  });

  it('Generate now is enabled once there is a message and fires onGenerateNow', () => {
    const { onGenerateNow } = panel({ messages: [{ role: 'user', content: 'a car' }], status: 'asking' });
    fireEvent.click(screen.getByTestId('copilot-generate-now'));
    expect(onGenerateNow).toHaveBeenCalled();
  });

  it('input + buttons are disabled while thinking', () => {
    panel({ messages: [{ role: 'user', content: 'a car' }], status: 'thinking' });
    expect((screen.getByTestId('copilot-answer-input') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('copilot-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('done state hides the input and shows the drafted-prompt note', () => {
    panel({
      messages: [
        { role: 'user', content: 'a car' },
        { role: 'assistant', content: 'low-poly red car' },
      ],
      status: 'done',
    });
    expect(screen.queryByTestId('copilot-answer-input')).toBeNull();
    expect(screen.getByTestId('copilot-done')).toBeTruthy();
  });
});
