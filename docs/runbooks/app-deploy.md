# Runbook — App Deployment (frontend → Cloudflare Pages, backend → DigitalOcean VM)

> Sibling of `mainnet-deploy.md` (which covers the **Move contract**). This file covers the **web app**:
> the React/Vite frontend and the Hono backend. Domain: **`tusk3d.store`** (D-105).
> Network: **testnet** for the 6/21 submission (mainnet contract swap is a separate runbook + env change).

---

## 0. Architecture & key facts

```
                          ┌─ tusk3d.store / www  ──→ Cloudflare Pages (static, CF-built from GitHub)
 user browser ── CF edge ─┤
                          ├─ api.tusk3d.store    ──→ CF proxy ─HTTPS(Origin cert)→ DO VM
                          │                                          └ Caddy :443 → Node :3001 (systemd)
                          └─ cdn.tusk3d.store    ──→ CF Worker (cdn-worker/, DEFERRED — not on 6/21 path)

 DO VM backend ──→ Sui testnet fullnode · Walrus aggregator · MemWal relayer · Tripo · Gemini
```

Facts that shaped this runbook (verified in code, not assumed):

- **The backend holds NO signing key.** It returns *unsigned* PTBs; agents/users sign client-side. `TRIPO_FEE_TREASURY`/`TRIPO_FEE_OPERATOR` are **addresses** (default to the deployer address), not private keys. → The VM never needs the deploy wallet key.
- **The backend is NOT fully stateless.** It keeps a small **`node:sqlite`** DB (`TUSK_DB_PATH`, default `./data/quota.db`) holding Tripo-balance + Gemini-quota counters. This file must live **outside** any deploy-overwrite path and is gitignored. Losing it only resets quota/budget counters (recoverable, low stakes).
- **Zero native npm modules.** sqlite is a Node built-in; meshoptimizer is WASM; everything else is pure JS/ESM. → Building on the VM compiles nothing; a 1 GB droplet (+ swap) is comfortable.
- **MCP / `llms.txt` URLs are origin-derived**, honoring `PUBLIC_ORIGIN` first. → Set `PUBLIC_ORIGIN=https://api.tusk3d.store` on the VM; no hostname is hardcoded.
- **Node pin: `v22.x` (local is `22.22.3`).** `node:sqlite` loads unflagged on this version. If the VM Node errors with an "experimental sqlite" message, either match `22.22.x` exactly or add `--experimental-sqlite` to the systemd `ExecStart`.

> **Live-deploy addendum (2026-06-16) — what actually shipped, vs the procedure below:**
> - **VM**: DigitalOcean droplet `152.42.213.241` (1 GB, Singapore), Ubuntu 24.04.3.
> - **TLS**: used **Caddy `tls internal` + Cloudflare SSL mode "Full"** (NOT the Origin-cert + Full-Strict in A5). Reason: zero manual cert handling, no private key passed around; CF↔origin still encrypted. Origin-cert + Full (Strict) remains the documented hardening upgrade (A5).
> - **Frontend → backend**: the app calls **relative `/api/*`**, so production needs a same-origin proxy — added as a **Pages Function** (`functions/api/[[path]].js`) that forwards `tusk3d.store/api/*` → `api.tusk3d.store/api/*`. This bypasses CORS entirely (browser stays same-origin), so the backend's localhost-only CORS is irrelevant to the app. See A8.

---

## 1. Prerequisites / accounts

- [ ] GitHub repo (already: `git@github.com:flamefalcon7/task3d.git`, `main` pushed, `.env*` gitignored).
- [ ] Cloudflare account (free tier).
- [ ] DigitalOcean account + an SSH public key uploaded.
- [ ] Domain **`tusk3d.store`** at the registrar.
- [ ] Secrets ready to copy from **local `backend/.env`** (never regenerate — copy):
  `JWT_SECRET`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_DELEGATE_KEY`, `MEMWAL_SERVER_URL`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, `TRIPO_API_KEY`, and any `TRIPO_FEE_*` / `*_MODEL` / `GEMINI_*` you've tuned.

---

## PART A — One-time setup

### A1. Cloudflare zone + nameserver repoint

1. Cloudflare dashboard → **Add a site** → `tusk3d.store` → Free plan.
2. CF shows two nameservers. At the registrar, replace the nameservers with CF's two.
3. Wait until the zone shows **Active** (minutes to a few hours). Everything below needs Active.

### A2. Provision the droplet

1. DO → **Create → Droplet**: Ubuntu **24.04 LTS**, Basic / Regular, **1 GB / 1 vCPU ($6/mo)**, region near your users, add your SSH key.
2. Note the public IPv4 `<VM_IP>`.
3. First login + a non-root user + a swap file (cheap insurance for `pnpm install`/`tsc` on 1 GB):

```bash
ssh root@<VM_IP>
adduser tusk && usermod -aG sudo tusk
rsync --archive --chown=tusk:tusk ~/.ssh /home/tusk    # copy SSH access to the new user

# 2 GB swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# firewall: SSH + HTTPS only (Caddy uses an explicit cert, so no port 80 needed)
ufw allow OpenSSH && ufw allow 443/tcp && ufw --force enable
```

> Hardening (optional, recommended): restrict 443 to [Cloudflare IP ranges](https://www.cloudflare.com/ips/) so the origin can't be hit directly. Skip for 6/21 if short on time.

### A3. Install the runtime (as `tusk`)

```bash
ssh tusk@<VM_IP>

# Node 22.x via NodeSource (gives a stable /usr/bin/node path for systemd)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo corepack enable && corepack prepare pnpm@8.14.1 --activate   # match local pnpm
node -v   # expect v22.x

# Caddy (TLS termination + reverse proxy)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

### A4. DNS records (Cloudflare → DNS)

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | `<VM_IP>` | **Proxied (orange)** |
| CNAME | `@` / `tusk3d.store` | (set by CF Pages in A7) | Proxied |
| CNAME | `www` | (set by CF Pages in A7) | Proxied |
| CNAME | `cdn` | (later, by the Worker) | — DEFERRED |

### A5. TLS — Cloudflare Origin cert + Caddy (Full Strict)

1. CF → **SSL/TLS → Overview** → set mode to **Full (Strict)**.
2. CF → **SSL/TLS → Origin Server → Create Certificate** (default RSA, 15-year). Copy the **cert** and **private key** PEM blocks.
3. On the VM:

```bash
sudo install -d -m 755 /etc/caddy
sudo tee /etc/caddy/cf-origin.pem >/dev/null   # paste the CERTIFICATE block, then Ctrl-D
sudo tee /etc/caddy/cf-origin.key >/dev/null   # paste the PRIVATE KEY block, then Ctrl-D
sudo chmod 600 /etc/caddy/cf-origin.key

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
api.tusk3d.store {
    tls /etc/caddy/cf-origin.pem /etc/caddy/cf-origin.key
    reverse_proxy 127.0.0.1:3001
}
EOF
sudo systemctl restart caddy
```

> Caddy auto-sets `X-Forwarded-Proto/Host/For`. The backend reads these for origin + per-IP rate limiting — see `MCP_TRUST_FORWARDED=true` in A6.

### A6. Backend code, secrets, DB dir, systemd

```bash
ssh tusk@<VM_IP>
git clone git@github.com:flamefalcon7/task3d.git ~/app   # or https:// + a PAT
mkdir -p ~/data                                          # persistent sqlite lives here (outside any rebuild)
```

**Secrets — copy the local `backend/.env` to the VM, then add deploy overrides. Never regenerate.**

```bash
# from your LOCAL machine:
scp backend/.env tusk@<VM_IP>:~/app/backend/.env
```

Then on the VM, append the deploy-specific overrides (append-only — do not rewrite the file):

```bash
cat >> ~/app/backend/.env <<'EOF'

# ---- deploy overrides (DO VM) ----
PORT=3001
PUBLIC_ORIGIN=https://api.tusk3d.store
TUSK_DB_PATH=/home/tusk/data/quota.db
MCP_TRUST_FORWARDED=true
# WALRUS_AGGREGATOR — leave unset to use the testnet aggregator; set to
# https://cdn.tusk3d.store only AFTER the CDN worker is deployed.
EOF
```

> If `~/app/backend/.env` ever looks empty or missing `MEMWAL_*`, **STOP** — do not self-heal. See CLAUDE.md → "MemWal recovery".

**systemd unit:**

```bash
sudo tee /etc/systemd/system/tusk3d-api.service >/dev/null <<'EOF'
[Unit]
Description=Tusk3D API (Hono backend)
After=network.target

[Service]
Type=simple
User=tusk
WorkingDirectory=/home/tusk/app/backend
ExecStart=/usr/bin/node --env-file=.env dist/server.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable tusk3d-api
# first start happens after the first deploy (Part B) builds dist/
```

### A7. Frontend — Cloudflare Pages

1. CF → **Workers & Pages → Create → Pages → Connect to Git** → pick the GitHub repo.
2. Build settings:
   - Framework preset: **None / Vite**
   - Build command: `pnpm --filter frontend... build`  (CF runs `pnpm install` automatically first; `frontend...` builds the `@overflow2026/shared` dep then `frontend`)
   - Build output directory: `frontend/dist`
   - Root directory: repo root (monorepo — the filter handles the rest)
   - Note: the workspace package names are `frontend`, `backend`, `@overflow2026/shared` (only `shared` is scoped).
3. **Environment variables** (Pages → Settings → Variables) — set every `VITE_*` the app needs for testnet:
   `VITE_TEST_WALLET` (leave **unset/0** in prod — see the VITE_TEST_WALLET gotcha), `VITE_WALRUS_AGGREGATOR` (unset = testnet default, or the CDN later), plus any package id / network vars from `frontend/.env.example`.
4. **Custom domains** (Pages → Custom domains): add `tusk3d.store` and `www.tusk3d.store`. CF auto-creates the proxied CNAMEs from A4.

> Frontend builds in **CF's** cloud, never on the VM. Pushes to `main` auto-rebuild. (Manual alternative: `pnpm --filter frontend... build && npx wrangler pages deploy frontend/dist --project-name tusk3d`.)

---

### A8. Frontend → backend wiring (same-origin `/api` proxy)

The app calls the backend with **relative paths** (`fetch('/api/...')`); Vite proxies these to `localhost:3001` in dev. Production has no such proxy, so a Pages Function bridges it:

- `functions/api/[[path]].js` (repo root, committed) forwards every `tusk3d.store/api/*` request to `https://api.tusk3d.store/api/*`.
- CF Pages picks up the `functions/` directory automatically on deploy (root directory = repo root).
- The browser only ever calls its own origin → **no CORS preflight**, so the backend's `cors({ origin: ['http://localhost:5173', …] })` doesn't need a production origin added.
- Agents bypass this entirely and call `https://api.tusk3d.store/mcp` directly.

Verify after deploy: `curl -sS -X POST https://tusk3d.store/api/auth/challenge` should reach the backend (a JSON body or a 400/4xx from the app — **not** a Pages 404).

---

## PART B — Deploy (recurring)

### B1. Backend (build on the VM, backend subtree only)

`~/app/deploy.sh` on the VM:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/app
git pull --ff-only
# install backend + its workspace dep (shared); the trailing ... pulls deps, skips frontend
# package names: frontend, backend, @overflow2026/shared (only shared is scoped)
pnpm install --frozen-lockfile --filter backend...
pnpm --filter backend... build      # builds @overflow2026/shared then backend, in order
sudo systemctl restart tusk3d-api
echo "deployed: $(git rev-parse --short HEAD)"
```

```bash
chmod +x ~/app/deploy.sh
# allow the restart without a password prompt (optional convenience):
echo 'tusk ALL=(ALL) NOPASSWD: /bin/systemctl restart tusk3d-api' | sudo tee /etc/sudoers.d/tusk3d-api
```

Each release, from anywhere:

```bash
ssh tusk@<VM_IP> '~/app/deploy.sh'
journalctl -u tusk3d-api -n 30 --no-pager     # confirm clean start
```

### B2. Frontend

Just `git push origin main` — CF Pages rebuilds automatically. (Or the manual `wrangler pages deploy` line from A7.)

---

## PART C — Verify (smoke test)

```bash
# backend live + TLS chain OK
curl -fsS https://api.tusk3d.store/llms.txt | head -5          # 200, markdown, contains api.tusk3d.store/mcp
curl -fsS -o /dev/null -w '%{http_code}\n' https://api.tusk3d.store/mcp   # 405 (GET blocked — transport guard, expected)

# frontend
curl -fsS -o /dev/null -w '%{http_code}\n' https://tusk3d.store           # 200
```

Then, in a browser, walk the demo arc per CLAUDE.md → Frontend Verification Protocol: `/ → /create → /launch → /market → /track`. Wallet-gated steps run in your own Chrome (Slush), report back.

**Agent demo (the hero shot):** `claude mcp add tusk3d https://api.tusk3d.store/mcp`, then run search → license check → buy (testnet) → decrypt → `samples/`.

---

## PART D — Rollback

```bash
ssh tusk@<VM_IP>
cd ~/app && git log --oneline -5
git checkout <good-sha>
~/app/deploy.sh                 # rebuilds + restarts at that sha
```

Frontend: CF Pages → Deployments → pick a previous build → **Rollback** (instant, no rebuild).

---

## PART E — Troubleshooting

| Symptom | Check |
|---|---|
| `api.tusk3d.store` → 502/Bad Gateway | `systemctl status tusk3d-api` + `journalctl -u tusk3d-api -n 50`. Node crashed or wrong `dist/` — re-run `deploy.sh`. |
| CF "Error 526" (invalid origin cert) | SSL mode must be **Full (Strict)** *and* `/etc/caddy/cf-origin.*` must be the CF **Origin** cert (not a self-signed one). |
| `node:sqlite` "experimental" error on start | VM Node major ≠ local. Match `22.22.x`, or add `--experimental-sqlite` to `ExecStart`. |
| MemWal banner "unconfigured" at startup | `MEMWAL_*` missing from `~/app/backend/.env`. Do **not** regenerate the file — recover per CLAUDE.md. |
| All MCP requests share one rate bucket | `MCP_TRUST_FORWARDED=true` missing, so every request looks like `127.0.0.1` (Caddy). Add it, restart. |
| Quota/budget counters reset after deploy | `TUSK_DB_PATH` points inside a rebuilt dir. It must be `/home/tusk/data/quota.db` (outside `~/app`). |
| `pnpm install` OOM on the 1 GB box | Confirm the 2 GB swap is active (`swapon --show`). |

---

## Appendix — env var inventory (backend)

**Secrets (copy from local `backend/.env`):** `JWT_SECRET`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_DELEGATE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `TRIPO_API_KEY`.

**Deploy-specific (set on VM):** `PORT=3001`, `PUBLIC_ORIGIN=https://api.tusk3d.store`, `TUSK_DB_PATH=/home/tusk/data/quota.db`, `MCP_TRUST_FORWARDED=true`, `MEMWAL_SERVER_URL=https://relayer.dev.memwal.ai`.

**Optional tunables (defaults are fine):** `SUI_RPC_URL`, `WALRUS_AGGREGATOR`, `TRIPO_ENABLED`, `TRIPO_FEE_TREASURY`, `TRIPO_FEE_OPERATOR`, `TRIPO_FEE_MIST`, `TRIPO_BALANCE_POLL_MS`, `TRIPO_PREFLIGHT_MIN_CREDITS`, `GEMINI_DAILY_BUDGET`, `GEMINI_PER_ADDRESS_DAILY`, `COPILOT_MODEL`, `CAPTION_MODEL`, `MEMORY_DENYLIST`, `MEMORY_MAX_DISTANCE`, `MCP_RATE_WINDOW_MS`, `MCP_RATE_MAX_PER_WINDOW`, `MCP_IP_RATE_MAX_PER_WINDOW`, `MCP_FULLNODE_TIMEOUT_MS`.

**Cost:** DO droplet $6/mo + domain (~annual) + Cloudflare Pages/Worker free tier. ≈ **$6/mo**.

---

## Critical path for 6/21 (in order)

1. **Now (slow, start first):** A1 — add `tusk3d.store` zone + repoint nameservers (propagation lag).
2. A2–A3 droplet + runtime · A5 Caddy/TLS · A6 secrets + systemd.
3. First `deploy.sh` → Part C backend smoke test (`/llms.txt` 200).
4. A7 CF Pages + custom domain → frontend smoke test.
5. Agent demo arc end-to-end against `https://api.tusk3d.store/mcp`.
6. **Deferred (post-6/21):** `cdn.tusk3d.store` Worker (`cdn-worker/`); mainnet contract swap.
