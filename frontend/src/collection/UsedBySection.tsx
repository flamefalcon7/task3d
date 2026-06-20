import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { validateUrl } from '../integration/appMetadataValidation';
import { POLICY_PERMISSIONLESS } from '../integration/useCollections';
import { tokens, card, monoLabel } from '../ux/tokens';

// plan-008 U14 — public "Used by" section for a collection detail page. Lists
// the game integrations the backend indexer has validated for this collection
// (R16, AE4/AE6).
//
// XSS posture (defense in depth — AE4): the backend `parseAppMetadata` already
// drops non-https / control-char records, but the render layer NEVER trusts
// that. `name` is rendered as a React text child (auto-escaped — `<img onerror>`
// becomes inert text, not an element). `url` becomes an <a href> ONLY after a
// fresh client-side https allowlist check; anything that fails renders as plain
// text with no link. We never use dangerouslySetInnerHTML.

interface Integration {
  name: string;
  url: string;
  integrator: string;
  registered_at_ms: number;
}

interface IntegrationsResponse {
  integrations?: Integration[];
}

function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export interface UsedBySectionProps {
  collectionId: string;
  integrationPolicy: number;
}

// --- styles (D-044 tokens) ---

const heading: CSSProperties = {
  ...monoLabel,
  fontSize: tokens.size.sm,
  color: tokens.color.ink,
  margin: '0 0 8px',
};

const hint: CSSProperties = {
  ...monoLabel,
  textTransform: 'none',
  letterSpacing: '0.5px',
  fontSize: 12,
  color: tokens.color.hint,
};

const errorText: CSSProperties = { ...hint, color: tokens.color.err };

const item: CSSProperties = {
  ...card,
  padding: '10px 12px',
  marginBottom: 8,
};

const itemName: CSSProperties = {
  fontFamily: tokens.font.body,
  fontWeight: tokens.weight.medium,
  color: tokens.color.ink,
};

const itemUrl: CSSProperties = {
  color: tokens.color.accent,
  fontFamily: tokens.font.mono,
  fontSize: 13,
  wordBreak: 'break-all',
};

const itemUrlInert: CSSProperties = { ...itemUrl, color: tokens.color.hint };

const itemMeta: CSSProperties = {
  ...monoLabel,
  textTransform: 'none',
  letterSpacing: '0.5px',
  fontSize: 11,
  color: tokens.color.hint,
  marginTop: 2,
};

export function UsedBySection({ collectionId, integrationPolicy }: UsedBySectionProps) {
  const open = integrationPolicy === POLICY_PERMISSIONLESS;
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [loading, setLoading] = useState(open);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // A closed collection shows the "not accepting" state — no fetch.
    if (!open || !collectionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/collections/${collectionId}/integrations`);
        if (!res.ok) throw new Error(`Used-by API ${res.status}`);
        const body = (await res.json()) as IntegrationsResponse;
        if (!cancelled) setIntegrations(body.integrations ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, collectionId]);

  return (
    <section data-testid="usedby-section" style={{ marginTop: 32 }}>
      <h2 style={heading}>Used by</h2>

      {!open && (
        <p data-testid="usedby-restricted" style={hint}>
          This collection is not accepting integrations.
        </p>
      )}

      {open && loading && (
        <p data-testid="usedby-loading" style={hint}>
          Loading integrations…
        </p>
      )}

      {open && !loading && error && (
        <p data-testid="usedby-error" style={errorText}>
          Couldn’t load integrations: {error.message}
        </p>
      )}

      {open && !loading && !error && integrations && integrations.length === 0 && (
        <p data-testid="usedby-empty" style={hint}>
          No integrations yet.
        </p>
      )}

      {open && !loading && !error && integrations && integrations.length > 0 && (
        <ul data-testid="usedby-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {integrations.map((it, i) => {
            const urlOk = validateUrl(it.url).ok;
            return (
              <li
                key={`${it.integrator}-${i}`}
                data-testid={`usedby-item-${i}`}
                style={item}
              >
                {/* name: text child only — never raw HTML (AE4) */}
                <div data-testid={`usedby-name-${i}`} style={itemName}>
                  {it.name}
                </div>
                {/* url: link ONLY when it passes the https allowlist; else inert text */}
                {urlOk ? (
                  <a
                    data-testid={`usedby-url-${i}`}
                    href={it.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={itemUrl}
                  >
                    {it.url}
                  </a>
                ) : (
                  <span data-testid={`usedby-url-${i}`} style={itemUrlInert}>
                    {it.url}
                  </span>
                )}
                <div style={itemMeta}>
                  by <code>{truncate(it.integrator)}</code>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
