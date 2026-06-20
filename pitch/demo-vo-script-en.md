# Tusk3D Demo — Voiceover Script (English)

> English narration-only version of `demo-vo-script.md`. Just the words to read.
> **`/` and `//` pause marks removed** (ElevenLabs would read "slash" out loud). Pauses are now carried by punctuation and line breaks.
> **When pasting into TTS**: paste only the narration lines of each section — **NOT the `##` headers (with the 【】 on-screen cues)**, or they'll be read aloud too.
> **Pace**: ~150 words/min, relaxed — don't rush. Target total ~4:45.
> **Tip**: written for the ear, not the page. Read it out loud once and tweak anything that trips your tongue.

---

## A — Problem 【0:00–0:50｜Poly shutdown notice + FlippedNormals closing notice screenshots】

In 2021, Google shut down Poly — its 3D-sharing platform.
The whole site and its API, gone for good — creators' work only partly rescued by volunteers.
In March 2026, FlippedNormals — a marketplace for over three thousand creators — shut down too.
Its revenue split was actually generous, seventy-five to ninety-five percent, but you sell once and it's over: a buyer makes a derivative, resells it, and the original creator earns nothing.
And the income is tied to the platform staying alive — platform closes, cashflow goes to zero.
Your work, your income — their fate was always in the platform's hands.

---

## B — Solution 【0:50–1:10｜landing page, 3D well in motion】

Tusk3D turns 3D assets into a composable creator economy.
Creators store their models on Walrus — and Walrus isn't just storage, it's memory: an AI copilot remembers what you've made before, and helps you talk a rough idea into a precise prompt.
Once it's published, others can remix it, players can use it in a game, and even AI agents can access it directly.
And every rule is enforced on-chain by Sui — not sitting on some company's server.

---

## C — Live Demo

### Scene 1 — Create and publish 【1:10–2:00｜/create: chat with AI copilot → generate from the prompt → /launch, splice in pre-recorded generation】

Let's start with a creator.
She signs in with Slush — but she doesn't have to figure out the prompt herself.
She tells the AI copilot, "I want a car," and it asks a few questions and narrows it down — and because it remembers what she's made before, all stored on Walrus, it riffs in her own style.
A few turns later it lands on a precise prompt, and out comes a car — or, of course, she could just upload her own model.
The generated model has different segmentations, she can name each part manually or just use a default value.  
Then she makes a choice: let other people remix it, and keep a small royalty for herself.
She hits publish — the model itself goes onto Walrus, and the rules go onto Sui.

### Scene 2 — Someone remixes it into a collection 【2:00–2:35｜switch to profile B, /market → /launch】

Another creator finds that car, buys an access pass, and remixes it into a whole "Neon Drift" series — same base, several variants, each with its own color scheme.
And the original creator's royalty settles automatically, on-chain, with no platform in the middle, and it holds even on resale.

### Scene 3 — A game dev finds assets via MCP and builds on them 【2:35–3:20｜terminal: claude mcp add tusk3d… + IDE B-roll】⭐

Now a game developer wants cars for a racing game — so instead of clicking around, he points an AI agent at Tusk3D's MCP endpoint.
The agent searches in plain language and picks the models he wants — free or paid. It can even surface a derived NFT collection — like Neon Drift — and wire those NFTs straight into the game, turning the collection's holders into ready-made players.
It reads the on-chain license, buys access with its own wallet, and pulls the models down — the backend never touches a key.
With assets in hand, the developer vibe-codes a racing game on top — no permission required, because it's all open and on-chain.

### Scene 3.1 — The dev registers his game 【3:20–3:32｜/integrate】

Then he registers his game on the integration page — linking it back to the Neon Drift collection, so the collection's holders can find it.

### Scene 4 — A player finds the game on the integration page and drives their NFT 【3:32–4:05｜/collection → /integrate → /track】⭐

Finally, a player buys a car from the Neon Drift collection. On the collection's page, they spot something: a game has integrated this collection. They click through — and they're driving their own NFT, right there on the track.
From a prompt, to a remix, to an agent discovering it, to a game built on top, to you driving the car you own — it's all one on-chain asset, backed by one Walrus store. That's what "composable" really means.

---

## D — Stack: why Sui + Walrus 【4:05–4:40｜architecture diagram】

So why Sui and Walrus? Because the two hard problems — permanence and trust — are exactly what they solve.
Walrus isn't just storage: the models, the encrypted content, and MemWal — the memory layer our AI copilot riffs off your past work with — all live there, decentralized and outliving any company.
And Sui makes the rules unchangeable and agent-native: license and royalty locked in at mint, access a soulbound entitlement, resale royalties through Kiosk, integrations on-chain — so an AI agent can discover, license, and buy assets directly over MCP, while Seal keeps paid content locked to that entitlement.
Storage, memory, rules, AI — all on open infrastructure, not one company's servers.

---

## E — Conclusion + Future 【4:40–5:05｜back to logo, roadmap overlay (two fronts)】

Everything you saw is live and on-chain today.
From here, we go deep on two fronts. AI-assisted creation: creators upload whole asset packs, developers discover assets in a matching style, and AI generates new models in that same style.
And the developer ecosystem: richer tools to tune and launch collections, deeper agent access over MCP, and plugging into how games are really built — Unity, and open engines like Godot.
A creator economy shouldn't let the platform decide who owns what.
Tusk3D — making 3D creation truly belong to its creators.

---

## Notes

- **Word count** ≈ 380 words → ~2:30 of pure speech; the rest of the ~4:45 is screen action and pauses. Comfortable fit under the 5-min cap.
- **AI narration**: ElevenLabs and Descript both do very natural English — you do NOT have to read English aloud yourself. Generate it, drop it on the timeline, done.
- **If you record yourself**: a relaxed, slightly-slower-than-conversational delivery reads best on a product demo. Let the screen action breathe between lines.
- **Em dashes (—)** read as a natural pause in ElevenLabs; they are not spoken as "dash".
