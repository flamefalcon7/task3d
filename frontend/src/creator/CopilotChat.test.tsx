import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CopilotChat } from './CopilotChat';
import type { CopilotMessage, CopilotStatus } from './useRiffCopilot';

afterEach(cleanup);

function panel(over: Partial<Parameters<typeof CopilotChat>[0]> = {}) {
  const onSend = over.onSend ?? vi.fn();
  const onGenerateNow = over.onGenerateNow ?? vi.fn();
  const onDraftChange = over.onDraftChange ?? vi.fn();
  const onStartOver = over.onStartOver ?? vi.fn();
  const onRetry = over.onRetry ?? vi.fn();
  render(
    <CopilotChat
      messages={over.messages ?? []}
      status={over.status ?? ('idle' as CopilotStatus)}
      onSend={onSend}
      onGenerateNow={onGenerateNow}
      draftPrompt={over.draftPrompt ?? ''}
      onDraftChange={onDraftChange}
      onStartOver={onStartOver}
      onRetry={onRetry}
      generateSlot={over.generateSlot}
    />,
  );
  return { onSend, onGenerateNow, onDraftChange, onStartOver, onRetry };
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

  it('done state delivers the drafted prompt in place (editable field, no mode switch)', () => {
    panel({
      messages: [
        { role: 'user', content: 'a car' },
        { role: 'assistant', content: 'low-poly red car' },
      ],
      status: 'done',
      draftPrompt: 'low-poly red car',
    });
    expect(screen.queryByTestId('copilot-answer-input')).toBeNull(); // Q&A input gone
    const result = screen.getByTestId('copilot-result') as HTMLTextAreaElement;
    expect(result.value).toBe('low-poly red car'); // drafted prompt shown in place
  });

  it('editing the drafted prompt in the done state flows up via onDraftChange (AE5)', () => {
    const { onDraftChange } = panel({ status: 'done', draftPrompt: 'low-poly red car' });
    fireEvent.change(screen.getByTestId('copilot-result'), { target: { value: 'low-poly red car, chrome wheels' } });
    expect(onDraftChange).toHaveBeenCalledWith('low-poly red car, chrome wheels');
  });

  it('Start over fires onStartOver', () => {
    const { onStartOver } = panel({ status: 'done', draftPrompt: 'x' });
    fireEvent.click(screen.getByTestId('copilot-start-over'));
    expect(onStartOver).toHaveBeenCalled();
  });

  it('renders the generateSlot (Generate gate) in the done state', () => {
    panel({
      status: 'done',
      draftPrompt: 'x',
      generateSlot: <button data-testid="gen-slot">Generate</button>,
    });
    expect(screen.getByTestId('gen-slot')).toBeTruthy();
  });

  it('error status shows a retry affordance (not a dead end) and fires onRetry', () => {
    const { onRetry } = panel({ status: 'error', messages: [{ role: 'user', content: 'a car' }] });
    expect(screen.getByTestId('copilot-error')).toBeTruthy();
    expect(screen.queryByTestId('copilot-answer-input')).toBeNull(); // input hidden in error
    fireEvent.click(screen.getByTestId('copilot-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('does NOT render the generateSlot before synthesis (only in done)', () => {
    panel({
      status: 'asking',
      messages: [{ role: 'assistant', content: 'Q?' }],
      generateSlot: <button data-testid="gen-slot">Generate</button>,
    });
    expect(screen.queryByTestId('gen-slot')).toBeNull();
  });
});
