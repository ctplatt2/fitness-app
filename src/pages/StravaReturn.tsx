import { useEffect, useState } from 'preact/hooks';
import { finishConnect, startedHere, syncStrava } from '../lib/strava';
import { BASE } from '../base';

/**
 * Where Strava sends you after you approve access (…/fitness-app/?code=…&state=…).
 * If this is the same app that started the sign-in, it finishes by itself. If the
 * phone opened this page somewhere else (Safari instead of the home-screen app),
 * it shows the code to paste into the app instead.
 */
export function StravaReturn(props: { query: URLSearchParams }) {
  const code = props.query.get('code');
  const denied = props.query.get('error');
  const scope = props.query.get('scope') ?? '';
  const here = startedHere(props.query.get('state'));
  const [status, setStatus] = useState<'working' | 'done' | 'manual' | 'error'>(code && here ? 'working' : 'manual');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const goSettings = () => location.replace(`${BASE}/settings`);

  useEffect(() => {
    if (!code || !here || denied) return;
    (async () => {
      try {
        const s = await finishConnect(code);
        setMessage(`Connected${s.athlete ? ` as ${s.athlete}` : ''}. Fetching your activities…`);
        const r = await syncStrava();
        setMessage(`Connected${s.athlete ? ` as ${s.athlete}` : ''}. Added ${r.added} activit${r.added === 1 ? 'y' : 'ies'} from the last 90 days.`);
        setStatus('done');
      } catch (e) {
        setMessage((e as Error).message);
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div class="app">
      <main class="content">
        <h1>Strava</h1>
        {denied || !code ? (
          <div class="card">
            <p style="margin-top:0">Strava access wasn't approved, so nothing was connected.</p>
            <button class="btn primary block" onClick={goSettings}>Back to Settings</button>
          </div>
        ) : status === 'manual' ? (
          <div class="card">
            <strong>One more step</strong>
            <p class="small-text">
              Strava approved access, but this page opened outside your Lift Log app. Copy this code, open Lift Log from your home screen, go to <strong>Settings → Strava</strong>, and paste it there. It works for a few minutes.
            </p>
            <input class="input" readOnly value={code} onFocus={(e) => (e.target as HTMLInputElement).select()} aria-label="Strava code" />
            <button
              class="btn primary block"
              style="margin-top:12px"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                } catch {
                  /* select-and-copy by hand */
                }
              }}
            >
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        ) : (
          <div class="card">
            <p style="margin-top:0" class={status === 'error' ? 'err' : ''}>{message || 'Connecting to Strava…'}</p>
            {!/activity:read/.test(scope) && status !== 'working' && (
              <p class="warn small-text">Strava reports that activity access wasn't ticked, so runs can't be read. Disconnect and connect again with it ticked.</p>
            )}
            {status !== 'working' && <button class="btn primary block" onClick={goSettings}>{status === 'done' ? 'Done' : 'Back to Settings'}</button>}
          </div>
        )}
      </main>
    </div>
  );
}
