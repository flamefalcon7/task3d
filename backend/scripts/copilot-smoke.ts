// Throwaway live smoke for the L2 copilot (D-081). Exercises the REAL Gemini
// path through copilot-client (no fakes), so it validates the API key + the
// synthesis/question logic end-to-end without a wallet or the browser.
// Run: pnpm --dir backend exec tsx --env-file=.env scripts/copilot-smoke.ts
import { buildCopilotClient } from '../src/lib/copilot-client.js';

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  console.log('key present:', !!apiKey, apiKey ? `(${apiKey.slice(0, 6)}… len ${apiKey.length})` : '');
  const client = buildCopilotClient({ apiKey, model: process.env.COPILOT_MODEL });
  console.log('configured:', client.configured);
  if (!client.configured) return;

  // 1) Question turn (turnIndex 0, no memory) — should return a clarifying question.
  try {
    const q = await client.turn({
      messages: [{ role: 'user', content: 'a spaceship' }],
      memoryContext: [],
      turnIndex: 0,
    });
    console.log('\n[turn 0 → question]', JSON.stringify(q, null, 2));
  } catch (e) {
    console.error('\n[turn 0 FAILED]', e instanceof Error ? `${e.name}: ${e.message}` : e);
  }

  // 1b) Memory-aware greeting (turn 0 WITH history) — should reference past
  //     vehicles and ask something that skips what memory already answers (R6/R7).
  try {
    const g = await client.turn({
      messages: [{ role: 'user', content: 'a flying vehicle' }],
      memoryContext: ['low-poly red sports car', 'off-road truck, big wheels', 'low-poly muscle car'],
      turnIndex: 0,
    });
    console.log('\n[turn 0 WITH memory → greeting/question]', JSON.stringify(g, null, 2));
  } catch (e) {
    console.error('\n[memory greeting FAILED]', e instanceof Error ? `${e.name}: ${e.message}` : e);
  }

  // 2) Memory-aware forced synthesis — should fold history + emit a Tripo prompt.
  try {
    const p = await client.turn({
      messages: [
        { role: 'user', content: 'a spaceship' },
        { role: 'assistant', content: 'What style — sleek sci-fi or chunky retro?' },
        { role: 'user', content: 'sleek sci-fi, neon accents' },
      ],
      memoryContext: ['low-poly red sports car', 'off-road truck, big wheels'],
      turnIndex: 1,
      forceSynthesize: true,
    });
    console.log('\n[forced synthesis → prompt]', JSON.stringify(p, null, 2));
  } catch (e) {
    console.error('\n[synthesis FAILED]', e instanceof Error ? `${e.name}: ${e.message}` : e);
  }
}

void main();
