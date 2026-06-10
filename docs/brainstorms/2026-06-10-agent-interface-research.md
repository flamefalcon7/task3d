# Brainstorm: AI-Agent Interface for Tusk3D (MCP vs API vs x402)

**Date**: 2026-06-10 · **Phase**: 4 · **Days to submission**: 11
**Question**: What form should an "AI agent interface" take so other agents/devs can discover, access, and *buy* Tusk3D content — and which form impresses Overflow 2026 judges most?

---

## TL;DR Recommendation

**Build a thin MCP server over the existing Hono backend, with the on-chain economy as the payment rail.** Frame it as: *"Agents are a third user class — the Move contract doesn't care if the buyer is human."*

- MCP is the de-facto agent-access standard in 2026 (Linux Foundation-governed since Dec 2025, 10,000+ public servers, adopted by Anthropic/OpenAI/Google/Microsoft). Judges will instantly recognize it.
- Walrus Memory itself shipped (June 3, 2026) with MCP connectors for Claude/ChatGPT/Gemini — an MCP interface puts Tusk3D in the *same idiom Mysten is promoting*, and we already use MemWal (D-080).
- **x402 is NOT the right payment rail for us** (see §4) — our fees are already native Sui Move calls. An agent holding a Sui keypair pays `access_fee` on-chain exactly like a human. That is *more* impressive to Sui judges than bolting on an HTTP-payment protocol.

Hero demo: a Claude agent connects to the Tusk3D MCP → semantic-searches "low-poly pickup truck" (MemWal recall) → reads `LicenseTerms` → pays the access fee on testnet with its own keypair → receives a soulbound `AccessEntitlement` → Seal-decrypts the GLB → drops it into the sample game scene (`samples/`). End-to-end agentic commerce on Sui + Walrus, no human in the loop.

---

## 1. Landscape (researched 2026-06-10)

### MCP (Model Context Protocol)
- Donated to the Agentic AI Foundation under the Linux Foundation (Dec 2025); vendor-neutral; >10,000 public servers as of Mar 2026; 41% of surveyed orgs in production. ([Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol), [adoption stats](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol))
- Works with Claude, ChatGPT, Gemini, Copilot, Cursor, custom agents — any MCP client. JSON-RPC; official TS SDK; streamable-HTTP transport means our Node/Hono backend can host it on a route.
- Sui ecosystem precedent: community `sui-mcp` servers exist ([example](https://skywork.ai/skypage/en/sui-mcp-server-ai-blockchain/1981560828485234688)); **Walrus Memory ships MCP tooling natively** ([PR Newswire](http://www.prnewswire.com/news-releases/walrus-launches-walrus-memory-as-portable-memory-layer-for-ai-agents-302790486.html), [walrus.xyz](https://walrus.xyz/products/walrus-memory/)).

### x402 (HTTP 402 agent payments)
- Coinbase-originated; x402 Foundation under Linux Foundation since Apr 2026; ~165M transactions / 69k active agents (Coinbase Apr 2026); zero protocol fees. ([x402.org](https://www.x402.org/), [Coinbase docs](https://docs.cdp.coinbase.com/x402/welcome))
- **Sui IS a supported network**; BlockEden.xyz runs a Sui-first facilitator with Move integration. ([network support](https://docs.cdp.coinbase.com/x402/network-support), [BlockEden](https://blockeden.xyz/docs/x402/introduction/))
- "Paid MCP tools" is a live, recognized pattern: Coinbase x402-MCP example, Cloudflare Agents SDK reference impl, xpay/Zuplo gateways. ([Zuplo](https://zuplo.com/blog/mcp-api-payments-with-x402), [Cloudflare](https://developers.cloudflare.com/agents/tools/payments/x402/))

### Track fit (handbook / spec.md §0)
- Walrus track verbatim: *"Build AI agents and agentic workflows **powered by Walrus as a verifiable data and memory layer**"* — an agent-facing interface over Walrus-stored, MemWal-indexed content is a literal reading of the prompt.
- Core track framing this year: *"autonomous AI agents that can act, **transact**, and coordinate using Sui's object model"* ([overflow.sui.io](https://overflow.sui.io/)). An agent buying an `AccessEntitlement` is exactly "transact using the object model".

---

## 2. Options compared

| Option | Effort | Judge impact | Notes |
|---|---|---|---|
| **A. REST + OpenAPI docs only** | ~0.5d | Low | Baseline; "we have an API" impresses no one in 2026 |
| **B. MCP server (read/discover)** | ~1–1.5d | High | Thin wrapper over existing Hono routes + MemWal recall; works in Claude/ChatGPT/Cursor day one |
| **C. B + on-chain agent purchase path** | +1–2d | **Very high** | Agent keypair signs `purchase_access` PTB; soulbound entitlement to agent address; Seal decrypt gated as today. The hero demo |
| **D. x402-gated MCP tools** | +1–2d | Medium-high | Recognizable buzzword, but duplicates a payment rail we already have on-chain (§4); only worth it for *off-chain* metering (e.g. Tripo generation) |
| **E. A2A / agent-to-agent protocol** | high | Low-med | Overkill; no time; judges care about commerce, not inter-agent chat |
| **F. `llms.txt` + machine-readable manifest** | ~0.5h | Low (cheap garnish) | Add anyway: `/llms.txt` describing the MCP endpoint + API |

**Recommended: B → C (C is the prize), F as garnish. D only as stretch/pitch-slide mention.**

---

## 3. Proposed MCP tool surface (v0 → v1)

v0 — read-only, no auth (1–1.5 days):
- `search_models(query)` — wraps the existing MemWal semantic recall (the `/browse` "Ask" path). *This single tool IS the track quote: agent memory as verifiable discovery layer.*
- `get_model(id)` — metadata, `LicenseTerms` (policy, access_fee, derivative_mint_fee), Walrus blob refs, lineage.
- `get_preview(id)` — watermarked preview still / public GLB via the CDN worker.
- `get_license_terms(id)` — explicit, so an agent can reason about cost before buying.

v1 — agent transaction path (1–2 days):
- `build_purchase_tx(id, agent_address)` — returns the `purchase_access` PTB bytes; **agent signs with its own Sui keypair** (demo agent reuses the test-wallet keypair pattern; D-012 server keypair seam already exists).
- `download_content(id)` — succeeds only when the caller's address holds the `AccessEntitlement`; Seal decryption path unchanged (respect the C-1 audit fix — entitlement check stays server/Seal-side, never trust the client).

Security guardrails: read-only tools rate-limited; no tool ever holds user keys; signing always client/agent-side; existing JWT gate on `/api/generate` untouched (MCP does NOT expose Tripo generation for free — that's the one place x402 could later meter).

---

## 4. Why not x402 as the core rail (pitch-ready argument)

x402 solves payments for services that *lack* a native on-chain economy. Tusk3D's fees (`access_fee`, `derivative_mint_fee`, royalties ≤30% bps) are **already enforced by Sui Move objects** — the soulbound `AccessEntitlement` is simultaneously the receipt, the access token, and the fork-precondition. Routing payment through x402 would add a second settlement layer and *weaken* the "enforced by Sui Move" story. The pitch line: *"Other platforms need x402 to charge agents. Our contract already does — the buyer's species is irrelevant."* (Mention x402 compatibility as a roadmap item for off-chain metering; BlockEden's Sui facilitator makes it credible.)

---

## 5. Judge-impressing framing (pitch deck bullets)

1. **Third user class**: Creators publish → Forkers derive → **Agents consume**. Same contract, same fees, zero new trust assumptions.
2. **Literal track fulfillment**: agents discover content through Walrus-backed memory (MemWal recall) and act on Walrus-stored verifiable data — the track prompt, verbatim.
3. **Ecosystem-native idiom**: Walrus Memory itself launched with MCP connectors three weeks before our submission; we speak the same protocol Mysten is betting on.
4. **Live demo, not vaporware**: Claude buys a model on testnet during the video. (Backup: pre-recorded; agent-browser can't sign — use test-wallet keypair, which the demo agent legitimately owns.)

---

## 6. Risks / open questions

- **Scope vs 6/21**: v0+v1 ≈ 2.5–3.5 days inside an 11-day window that also needs pitch deck + video. v0 alone still demos well (agent searches + reasons over licenses). Decide cut-line early.
- New public API surface ⇒ **Full ADR + plan-mode required** (CLAUDE.md decision discipline) before implementation.
- MCP server hosting: same Node process (new Hono route w/ streamable HTTP) vs separate process — plan-mode question.
- Demo agent wallet funding on testnet (faucet ok).
- Does the contract's `purchase_access` have any human-UX assumption (e.g. frontend-only checks) that an agent path would bypass? Verify against the 2026-06-04 security audit findings before exposing.

## 7. Demo design (added 2026-06-10 — how to make judges gasp)

Principles: make the invisible visible (split-screen agent ↔ chain), close the economic loop (creator gets paid), prove autonomy (agent *rejects* something), end with "try it yourself".

**The 90-second arc** (works for 6/21 video AND 7/20 live):

1. **(0–10s) Setup**: Claude (Desktop/Code) with Tusk3D MCP connected. One human prompt, then hands off keyboard: *"Find a low-poly pickup truck for my racing game. Budget 0.5 SUI. License must allow commercial use."* The human never touches anything again.
2. **(10–30s) Reasoning, not scripting**: agent calls `search_models` (MemWal semantic recall), gets 2–3 candidates, **reads each `LicenseTerms` aloud and REJECTS one** ("this one's derivative royalty is 30%, over your constraint") — a visible rejection is the single strongest proof this isn't a canned macro.
3. **(30–50s) The transaction**: agent calls `build_purchase_tx`, signs with its own keypair. **Split screen**: left = agent chat; right = Sui explorer / Tusk3D `/track` where the soulbound `AccessEntitlement` object **appears live**, owned by the agent's address. Beat of silence here — let the object materialize.
4. **(50–75s) Use the goods**: agent Seal-decrypts via the entitlement, writes the GLB into `samples/` game scene, scene reloads — **the truck is in the game, drivable**. (Content actually delivered, not just a tx hash.)
5. **(75–90s) The kicker — close the loop**: cut to creator dashboard: balance ticked up. Line: *"While the AI built its game, a human creator got paid. We didn't add agent support — the Move contract never cared whether the buyer was human."*
6. **Outro frame**: `claude mcp add tusk3d <url>` + QR. Judges can run tool 1 themselves during judging week (read-only tools are free — zero risk).

Force multipliers (cheap, high-impact):
- **Budget adherence + rejection** (beat 2) = autonomy proof. Scripted demos never say no.
- **Second client flash** (5s): same server in Cursor or ChatGPT — "standard, not bespoke integration".
- **Live on demo day, recorded for submission**: testnet live run with the video as fallback; pre-fund the agent wallet, pre-warm Walrus reads via CDN worker.
- **Failure honesty**: if live tx hiccups (the known `signal timed out` class), the retry (D-102) succeeding on camera is itself a resilience story.

Anti-patterns to avoid: showing JSON-RPC payloads (judges don't care), narrating MCP internals, demoing more than ~4 tools, any moment where a human clicks something the agent should have done.

## 8. Pain points the MCP solves (added 2026-06-10 — pitch narrative)

**Agent/developer lens — the lead story.** AI can write an entire game's code but can't get assets. Three stacked gaps:

1. **Payment gap** — agents have no credit card. Traditional asset stores (Sketchfab, Unity Asset Store) require accounts, cards, human checkout clicks. On-chain payment is agent-native: a keypair is sufficient, no signup.
2. **License gap** — web-scraped assets carry fuzzy human-language licenses ("non-commercial", "attribution required") that agents cannot reliably interpret; the user bears the legal risk. Tusk3D's `LicenseTerms` are **on-chain, structured, machine-readable** — an agent can reason over commercial-use/derivative-fee terms directly, and the soulbound `AccessEntitlement` is a permanent on-chain purchase receipt (audit trail).
3. **Delivery gap** — even after buying: links rot, CDNs die, content can be swapped. Walrus is hash-addressed: the blob an agent receives is verifiable and persistent.

One-liner: *"Content got API-ified; content **commerce** didn't. We compress search, license reasoning, payment, and verifiable delivery into one MCP connection."*

**Creator lens — the emotional kicker.** The agent economy is here, but creators watch AI "use" their work without compensation — the deepest creator anxiety of the AI era. Tusk3D turns agents into a **paying buyer class**: royalties enforced by Move, not platform goodwill. "An AI used your work = you got paid." Aligns with demo beat 5 (creator balance ticks up).

**Ecosystem lens (for Mysten judges) — Q&A reserve, not main arc.** M2M commerce lacks a trust layer: between two mutually-unknown agents, who guarantees payment→delivery→authenticity? On-chain settlement + soulbound receipt + Walrus-verifiable content — all native Sui object model, no bolt-ons.

**Pitch ordering**: lead with the three-gap story, close with the creator kicker, hold the ecosystem argument for Q&A.

## Sources

- [MCP — Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol) · [MCP adoption stats 2026](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol) · [State of MCP 2026](https://truthifi.com/education/state-of-mcp-2026-ai-agents-custom-connectors)
- [Walrus Memory launch PR (2026-06-03)](http://www.prnewswire.com/news-releases/walrus-launches-walrus-memory-as-portable-memory-layer-for-ai-agents-302790486.html) · [walrus.xyz/products/walrus-memory](https://walrus.xyz/products/walrus-memory/) · [Decrypt interview](https://decrypt.co/369895/walrus-memory-enables-ai-agents-to-actually-learn-about-us-mysten-labs-co-founder)
- [x402.org](https://www.x402.org/) · [Coinbase x402 docs](https://docs.cdp.coinbase.com/x402/welcome) · [x402 network support (incl. Sui)](https://docs.cdp.coinbase.com/x402/network-support) · [BlockEden Sui facilitator](https://blockeden.xyz/docs/x402/introduction/)
- [Paid MCP tools w/ x402 — Zuplo](https://zuplo.com/blog/mcp-api-payments-with-x402) · [Cloudflare Agents x402](https://developers.cloudflare.com/agents/tools/payments/x402/) · [Agentic payment protocols compared — Crossmint](https://www.crossmint.com/learn/agentic-payments-protocols-compared)
- [Sui Overflow 2026](https://overflow.sui.io/) · community [sui-mcp precedent](https://skywork.ai/skypage/en/sui-mcp-server-ai-blockchain/1981560828485234688)
