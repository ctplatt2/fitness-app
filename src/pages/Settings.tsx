import { useEffect, useState } from 'preact/hooks';
import { checkBackup, type BackupCheck } from '../lib/backup-format';
import { parseHistoryCsv } from '../lib/csv-history';
import { backUpNow, planImport, restoreBackup, runImport, type ImportPlan } from '../lib/data-io';
import { db, getSettings, type Settings } from '../lib/db';
import { beginConnect, disconnect, finishConnect, getStrava, isConnected, saveApp, syncStrava } from '../lib/strava';
import { askForNotifications, lockAlarmEnabled, notificationState, setLockAlarm } from '../lib/timer';
import { useLive } from '../lib/use-live';

const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function SettingsPage(_props: { path?: string }) {
  const s = useLive(() => getSettings());
  if (!s) return <h1>Settings</h1>;

  const save = (patch: Partial<Settings>) => db.settings.put({ ...s, ...patch });

  return (
    <>
      <h1>Settings</h1>

      <div class="card">
        <strong>Weight units</strong>
        <div class="chips" style="margin-bottom:0">
          {(['lb', 'kg'] as const).map((u) => (
            <button
              key={u}
              class={s.units === u ? 'btn primary' : 'btn'}
              onClick={() =>
                u !== s.units &&
                save({ units: u, barWeight: u === 'kg' ? 20 : 45, plates: u === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5] })
              }
            >
              {u}
            </button>
          ))}
        </div>
        <p class="muted small-text" style="margin:10px 0 0">Switching resets the bar and plates below. It doesn't convert weights you've already logged.</p>
      </div>

      <div class="card">
        <strong>Distance units</strong>
        <div class="chips" style="margin-bottom:0">
          {(['mi', 'km'] as const).map((u) => (
            <button key={u} class={s.distanceUnit === u ? 'btn primary' : 'btn'} onClick={() => save({ distanceUnit: u })}>{u}</button>
          ))}
        </div>
      </div>

      <Equipment s={s} save={save} />
      <AlertsCard />
      <ListsCard s={s} save={save} />
      <StravaCard />
      <BackupCard s={s} />
      <ImportCard s={s} />
    </>
  );
}

function Equipment(props: { s: Settings; save: (p: Partial<Settings>) => Promise<unknown> }) {
  const { s } = props;
  const [bar, setBar] = useState(String(s.barWeight));
  const [plates, setPlates] = useState(s.plates.join(', '));
  const [rest, setRest] = useState(String(s.defaultRest));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Follow outside changes (unit switch, restore).
  useEffect(() => {
    setBar(String(s.barWeight));
    setPlates(s.plates.join(', '));
    setRest(String(s.defaultRest));
  }, [s.barWeight, s.plates.join(','), s.defaultRest]);

  const dirty = bar !== String(s.barWeight) || plates !== s.plates.join(', ') || rest !== String(s.defaultRest);

  async function apply() {
    const b = Number(bar);
    const r = Number(rest);
    const list = plates.split(/[,\s]+/).filter(Boolean).map(Number);
    if (!(b >= 0) || bar.trim() === '') return setError('Bar weight should be a number.');
    if (list.length === 0 || list.some((p) => !(p > 0))) return setError('Plates should be a list of numbers, like 45, 25, 10, 5, 2.5.');
    if (!(r >= 0) || rest.trim() === '') return setError('Rest should be a number of seconds.');
    setError('');
    await props.save({ barWeight: b, plates: [...new Set(list)].sort((x, y) => y - x), defaultRest: Math.round(r) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div class="card">
      <strong>Equipment and rest</strong>
      <div class="grid2">
        <label>
          <span class="muted">Bar weight ({s.units})</span>
          <input class="input" type="number" inputMode="decimal" step="any" value={bar} onInput={(e) => setBar((e.target as HTMLInputElement).value)} />
        </label>
        <label>
          <span class="muted">Default rest (sec)</span>
          <input class="input" type="number" inputMode="numeric" value={rest} onInput={(e) => setRest((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <label style="display:block; margin-top:10px">
        <span class="muted small-text">Plates you have ({s.units}), separated by commas</span>
        <input class="input" inputMode="decimal" value={plates} onInput={(e) => setPlates((e.target as HTMLInputElement).value)} />
      </label>
      <p class="muted small-text" style="margin:8px 0 0">
        Used by the plate calculator, warm-up sets, and the smallest weight jump. Default rest applies to exercises with no rest of their own.
      </p>
      {error && <p class="err" style="margin:8px 0 0">{error}</p>}
      <button class="btn small primary" style="margin-top:12px" disabled={!dirty} onClick={apply}>{saved ? 'Saved' : 'Save'}</button>
    </div>
  );
}

function BackupCard(props: { s: Settings }) {
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<Extract<BackupCheck, { ok: true }> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    try {
      const r = await backUpNow();
      setStatus(r === 'cancelled' ? '' : r === 'shared' ? 'Backup shared.' : 'Backup file downloaded.');
    } finally {
      setBusy(false);
    }
  }

  async function chosen(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setError('');
    setPending(null);
    setStatus('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return setError("That file couldn't be read as a backup.");
    }
    const check = checkBackup(parsed);
    if (!check.ok) return setError(check.error);
    setPending(check);
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.backup);
      setPending(null);
      setStatus('Restored.');
    } catch (e) {
      setError(`Restore failed, nothing was changed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <strong>Backup</strong>
      <p class="muted small-text" style="margin:6px 0 0">
        Your data lives only on this device. A backup is one file with everything in it: plans, workouts, cardio, body weight and settings. Save it to Files or iCloud.
      </p>
      <p class="small-text" style="margin:8px 0 0">
        Last backup: {props.s.lastBackup ? fmtDay(props.s.lastBackup) : 'never'}
      </p>
      <div class="chips" style="margin-bottom:0">
        <button class="btn small primary" disabled={busy} onClick={backup}>Back up now</button>
        <label class="btn small">
          Restore from file
          <input type="file" accept=".json,application/json" hidden onChange={chosen} />
        </label>
      </div>
      {status && <p class="ok small-text" style="margin:10px 0 0">{status}</p>}
      {error && <p class="err small-text" style="margin:10px 0 0">{error}</p>}
      {pending && (
        <div class="notice">
          <div class="small-text">
            Backup from {fmtDay(pending.backup.exportedAt)}: {pending.counts.workouts} workouts, {pending.counts.cardio} cardio sessions, {pending.counts.programs} plans.
            Restoring <strong>replaces everything on this device</strong> and can't be undone.
          </div>
          <div class="chips" style="margin-bottom:0">
            <button class="btn small danger" disabled={busy} onClick={restore}>Replace my data</button>
            <button class="btn small" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportCard(props: { s: Settings }) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [format, setFormat] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function chosen(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setError('');
    setStatus('');
    setPlan(null);
    const parsed = parseHistoryCsv(await file.text(), props.s.units);
    if (parsed.error) return setError(parsed.error);
    setFormat(parsed.format === 'hevy' ? 'Hevy' : 'Strong');
    setPlan(await planImport(parsed.workouts));
  }

  async function go() {
    if (!plan) return;
    setBusy(true);
    try {
      await runImport(plan);
      setStatus(`Imported ${plan.fresh.length} workout${plan.fresh.length === 1 ? '' : 's'}.`);
      setPlan(null);
    } catch (e) {
      setError(`Import failed, nothing was added: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <strong>Import history</strong>
      <p class="muted small-text" style="margin:6px 0 0">
        Bring in past workouts from a Strong or Hevy export (a .csv file). This adds to what's here; it never replaces anything.
      </p>
      <div class="chips" style="margin-bottom:0">
        <label class="btn small">
          Choose CSV file
          <input type="file" accept=".csv,text/csv" hidden onChange={chosen} />
        </label>
      </div>
      {status && <p class="ok small-text" style="margin:10px 0 0">{status}</p>}
      {error && <p class="err small-text" style="margin:10px 0 0">{error}</p>}
      {plan && (
        <div class="notice">
          <div class="small-text">
            {format} export: {plan.fresh.length} new workout{plan.fresh.length === 1 ? '' : 's'} with {plan.sets} sets.
            {plan.duplicates > 0 && ` ${plan.duplicates} already here will be skipped.`}
            {plan.newExercises.length > 0 &&
              ` ${plan.newExercises.length} exercise${plan.newExercises.length === 1 ? '' : 's'} will be added to your library: ${plan.newExercises.slice(0, 6).join(', ')}${plan.newExercises.length > 6 ? '…' : ''}.`}
          </div>
          <div class="chips" style="margin-bottom:0">
            <button class="btn small primary" disabled={busy || plan.fresh.length === 0} onClick={go}>Import</button>
            <button class="btn small" onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsCard() {
  const [perm, setPerm] = useState(notificationState());
  const [lock, setLock] = useState(lockAlarmEnabled());
  return (
    <div class="card">
      <strong>Rest timer alerts</strong>
      <p class="muted small-text" style="margin:6px 0 0">
        With the app open, the timer beeps when rest is over. Phones pause web apps in the background, so these two options help when you switch apps or lock the screen.
      </p>

      <div class="row-between" style="margin-top:12px">
        <div>
          <div>Notification</div>
          <div class="muted small-text">
            {perm === 'granted'
              ? 'On. Shows "Rest over" if the app is in the background and still running.'
              : perm === 'denied'
                ? "Blocked. Allow notifications for Lift Log in your phone's settings."
                : perm === 'unsupported'
                  ? 'Not available here. On iPhone, open the app from its home-screen icon.'
                  : 'Shows "Rest over" if the app is in the background and still running.'}
          </div>
        </div>
        {perm === 'default' && <button class="btn small" onClick={async () => setPerm(await askForNotifications())}>Allow</button>}
      </div>

      <div class="row-between" style="margin-top:12px">
        <div>
          <div>Lock-screen sound <span class="badge subtle">experimental</span></div>
          <div class="muted small-text">
            Plays a silent track during rest that ends in the beeps, so they sound even with the phone locked. It will pause music from other apps.
          </div>
        </div>
        <button
          class={lock ? 'btn small primary' : 'btn small'}
          onClick={() => {
            setLockAlarm(!lock);
            setLock(!lock);
          }}
        >
          {lock ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  );
}

function ListsCard(props: { s: Settings; save: (p: Partial<Settings>) => Promise<unknown> }) {
  const { s } = props;
  const [mobility, setMobility] = useState(s.mobility.join('\n'));
  const [target, setTarget] = useState(String(s.mobilityTarget));
  const [tests, setTests] = useState(s.testMetrics.join('\n'));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMobility(s.mobility.join('\n'));
    setTarget(String(s.mobilityTarget));
    setTests(s.testMetrics.join('\n'));
  }, [s.mobility.join('|'), s.mobilityTarget, s.testMetrics.join('|')]);

  const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
  const dirty = mobility !== s.mobility.join('\n') || target !== String(s.mobilityTarget) || tests !== s.testMetrics.join('\n');

  async function apply() {
    await props.save({ mobility: lines(mobility), mobilityTarget: Math.max(1, Math.round(Number(target)) || 1), testMetrics: lines(tests) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div class="card">
      <strong>Mobility and check-ins</strong>
      <label style="display:block; margin-top:8px">
        <span class="muted small-text">Mobility circuit, one move per line (add " · dose" after the name)</span>
        <textarea class="input" rows={7} value={mobility} onInput={(e) => setMobility((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label style="display:block; margin-top:10px">
        <span class="muted small-text">Circuits per week to aim for</span>
        <input class="input" type="number" inputMode="numeric" value={target} onInput={(e) => setTarget((e.target as HTMLInputElement).value)} />
      </label>
      <label style="display:block; margin-top:10px">
        <span class="muted small-text">Check-in tests, one per line (renaming a test hides its old results)</span>
        <textarea class="input" rows={6} value={tests} onInput={(e) => setTests((e.target as HTMLTextAreaElement).value)} />
      </label>
      <button class="btn small primary" style="margin-top:12px" disabled={!dirty} onClick={apply}>{saved ? 'Saved' : 'Save'}</button>
    </div>
  );
}

function StravaCard() {
  const [st, setSt] = useState(getStrava());
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => setSt(getStrava());

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      setMsg((await fn()) ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const sync = () =>
    run(async () => {
      const r = await syncStrava();
      const parts = [`${r.added} added`];
      if (r.linked) parts.push(`${r.linked} matched to entries you logged`);
      return `Synced: ${parts.join(', ')}.${r.planAdvanced ? ' Your plan moved on a day.' : ''}`;
    });

  return (
    <div class="card">
      <strong>Strava</strong>
      {!st ? (
        <>
          <p class="muted small-text" style="margin:6px 0 0">
            Pull your runs, rides, walks, swims, rows, tennis and soccer in from Strava so you don't log them twice. Strava needs you to register a free API application first:
          </p>
          <ol class="steps small-text">
            <li>On a computer, open <strong>strava.com/settings/api</strong> and create an application (any name and website will do).</li>
            <li>Set <strong>Authorization Callback Domain</strong> to <code>{location.hostname}</code>.</li>
            <li>Copy its <strong>Client ID</strong> and <strong>Client Secret</strong> into the boxes below.</li>
          </ol>
          <div class="grid2">
            <label>
              <span class="muted">Client ID</span>
              <input class="input" inputMode="numeric" autocomplete="off" value={id} onInput={(e) => setId((e.target as HTMLInputElement).value)} />
            </label>
            <label>
              <span class="muted">Client Secret</span>
              <input class="input" type="password" autocomplete="off" value={secret} onInput={(e) => setSecret((e.target as HTMLInputElement).value)} />
            </label>
          </div>
          <p class="muted small-text" style="margin:8px 0 0">These stay on this device only. They are not in the app's code and are left out of backups.</p>
          <button
            class="btn small primary"
            style="margin-top:12px"
            disabled={!/^\d+$/.test(id.trim()) || secret.trim().length < 20}
            onClick={() => {
              saveApp(id, secret);
              setSecret('');
              refresh();
            }}
          >
            Save
          </button>
        </>
      ) : !isConnected(st) ? (
        <>
          <p class="muted small-text" style="margin:6px 0 0">
            App details saved (client ID {st.clientId}). Now approve access on Strava. Leave "View data about your activities" ticked.
          </p>
          <div class="chips" style="margin-bottom:0">
            <button class="btn small primary" disabled={busy} onClick={beginConnect}>Connect to Strava</button>
            <button class="btn small" onClick={() => run(async () => disconnect(true))}>Change app details</button>
          </div>
          <label style="display:block; margin-top:12px">
            <span class="muted small-text">If Strava sent you to a page with a code instead of back here, paste it:</span>
            <input class="input" autocomplete="off" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
          </label>
          <button
            class="btn small"
            style="margin-top:8px"
            disabled={busy || code.trim().length < 10}
            onClick={() =>
              run(async () => {
                await finishConnect(code);
                setCode('');
                const r = await syncStrava();
                return `Connected. Added ${r.added} activities from the last 90 days.`;
              })
            }
          >
            Use code
          </button>
        </>
      ) : (
        <>
          <p class="small-text" style="margin:6px 0 0">
            Connected{st.athlete ? ` as ${st.athlete}` : ''}. Last sync: {st.lastSync ? new Date(st.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet'}.
          </p>
          <p class="muted small-text" style="margin:6px 0 0">
            Syncs by itself when you open the app. Strength sessions on Strava are skipped. Deleting an imported entry here keeps it from coming back.
          </p>
          <div class="chips" style="margin-bottom:0">
            <button class="btn small primary" disabled={busy} onClick={sync}>{busy ? 'Syncing…' : 'Sync now'}</button>
            {confirm ? (
              <>
                <button class="btn small danger" onClick={() => { setConfirm(false); void run(async () => disconnect(false)); }}>Yes, disconnect</button>
                <button class="btn small" onClick={() => setConfirm(false)}>Cancel</button>
              </>
            ) : (
              <button class="btn small" onClick={() => setConfirm(true)}>Disconnect</button>
            )}
          </div>
        </>
      )}
      {msg && <p class="ok small-text" style="margin:10px 0 0">{msg}</p>}
      {error && <p class="err small-text" style="margin:10px 0 0">{error}</p>}
    </div>
  );
}
