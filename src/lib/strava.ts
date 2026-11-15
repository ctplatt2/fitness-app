import { BASE } from '../base';
import { db, getSettings } from './db';
import { advanceProgram, currentDay, getActiveProgram, isPlanComplete, matchesPlanCardio } from './programs';
import { mapActivity, planSync, type StravaActivity } from './strava-map';

// Strava details live in this device's local storage only. They are deliberately
// kept out of the database so they never end up in a backup file.
const KEY = 'liftlog.strava';
const PENDING = 'liftlog.strava.state';
const IGNORED = 'liftlog.strava.ignored';
export const STATE_PREFIX = 'liftlog-';

export interface StravaState {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  /** epoch seconds */
  expiresAt?: number;
  athlete?: string;
  lastSync?: number;
}

export function getStrava(): StravaState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function put(s: StravaState | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export const isConnected = (s: StravaState | null): s is StravaState & { refreshToken: string } => !!s?.refreshToken;

export function saveApp(clientId: string, clientSecret: string) {
  put({ clientId: clientId.replace(/\s/g, ''), clientSecret: clientSecret.replace(/\s/g, '') });
}

/** Where Strava sends you back to. Its host must be the app's "Authorization Callback Domain". */
export const redirectUri = () => `${location.origin}${BASE}/`;

/** Send the user to Strava to approve read access to their activities. */
export function beginConnect() {
  const s = getStrava();
  if (!s) return;
  const state = STATE_PREFIX + Math.random().toString(36).slice(2, 12);
  localStorage.setItem(PENDING, state);
  const q = new URLSearchParams({
    client_id: s.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state,
  });
  location.href = `https://www.strava.com/oauth/authorize?${q}`;
}

/** True when this device started the sign-in that produced `state` (so it can finish it automatically). */
export function startedHere(state: string | null): boolean {
  return !!state && localStorage.getItem(PENDING) === state && !!getStrava();
}

async function tokenRequest(params: Record<string, string>) {
  const s = getStrava();
  if (!s) throw new Error('Add your Strava app details first.');
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: s.clientId, client_secret: s.clientSecret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = body?.errors?.[0];
    const field = first?.field;
    if (field === 'client_id') throw new Error("Strava doesn't recognise that Client ID. Tap Change app details and check it against your Strava API page.");
    // Strava answers a known Client ID with the wrong secret as an "Application" error with no field.
    if (field === 'client_secret' || (first?.resource === 'Application' && !field)) {
      throw new Error(
        "Strava recognised the Client ID, but the Client Secret doesn't match it. Tap Change app details and enter the secret again. Use the line labelled Client Secret on your Strava API page, not the access token or refresh token below it.",
      );
    }
    if (field === 'code') throw new Error('That code has expired or was already used. Tap Connect to get a new one.');
    throw new Error(body?.message ? `Strava said: ${body.message}` : `Strava returned an error (${res.status}).`);
  }
  const next: StravaState = {
    ...s,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? s.refreshToken,
    expiresAt: body.expires_at,
    athlete: body.athlete ? [body.athlete.firstname, body.athlete.lastname].filter(Boolean).join(' ') : s.athlete,
  };
  put(next);
  return next;
}

/** Swap the code Strava sent back for tokens. */
export async function finishConnect(code: string): Promise<StravaState> {
  const s = await tokenRequest({ code: code.trim(), grant_type: 'authorization_code' });
  localStorage.removeItem(PENDING);
  return s;
}

async function accessToken(): Promise<string> {
  let s = getStrava();
  if (!isConnected(s)) throw new Error('Strava is not connected.');
  if (!s.accessToken || !s.expiresAt || s.expiresAt * 1000 < Date.now() + 60_000) {
    s = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken! });
  }
  return s.accessToken!;
}

export async function disconnect(forgetApp: boolean) {
  const s = getStrava();
  if (s?.accessToken) {
    // Best effort: tell Strava to revoke this app's access.
    void fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${s.accessToken}` } }).catch(() => {});
  }
  put(forgetApp || !s ? null : { clientId: s.clientId, clientSecret: s.clientSecret });
  localStorage.removeItem(PENDING);
}

function ignored(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(IGNORED) || '[]'));
  } catch {
    return new Set();
  }
}

/** Remember that a Strava activity was deleted here, so a later sync doesn't bring it back. */
export function ignoreStravaId(id: number) {
  const all = ignored();
  all.add(id);
  localStorage.setItem(IGNORED, JSON.stringify([...all].slice(-500)));
}

export interface SyncResult {
  added: number;
  linked: number;
  /** Activities Strava returned for the window. */
  seen: number;
  planAdvanced: boolean;
}

const DAY = 86_400_000;
let syncing: Promise<SyncResult> | null = null;

/** Pull recent activities. The first sync goes back 90 days; later ones re-check the last 3 days for late uploads. */
export function syncStrava(): Promise<SyncResult> {
  syncing ??= runSync().finally(() => (syncing = null));
  return syncing;
}

async function runSync(): Promise<SyncResult> {
  const token = await accessToken();
  const s = getStrava()!;
  const startedAt = Date.now();
  const after = Math.floor((s.lastSync ? s.lastSync - 3 * DAY : startedAt - 90 * DAY) / 1000);
  const activities: StravaActivity[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) throw new Error("Strava no longer accepts this sign-in. Disconnect and connect again, and leave 'View data about your activities' ticked.");
    if (res.status === 429) throw new Error('Strava is rate-limiting requests. Try again in 15 minutes.');
    if (!res.ok) throw new Error(`Strava returned an error (${res.status}).`);
    const batch = (await res.json()) as StravaActivity[];
    activities.push(...batch);
    if (batch.length < 100) break;
  }

  const settings = await getSettings();
  const mapped = activities.map((a) => mapActivity(a, settings.distanceUnit)).filter((a) => a !== null);
  const plan = planSync(await db.cardio.toArray(), mapped, ignored());
  await db.transaction('rw', db.cardio, async () => {
    if (plan.add.length) await db.cardio.bulkAdd(plan.add);
    for (const l of plan.link) await db.cardio.update(l.id, l.patch);
  });

  // If today's plan day is a cardio session and a matching activity from today just arrived, move the plan on.
  let planAdvanced = false;
  const program = await getActiveProgram();
  const day = program && !isPlanComplete(program) ? currentDay(program).day : undefined;
  if (program && day?.cardio && day.slots.length === 0) {
    const today = new Date().toDateString();
    const hit = [...plan.add, ...plan.link.map((l) => mapped.find((m) => m.stravaId === l.patch.stravaId)!)].some(
      (a) => new Date(a.date).toDateString() === today && matchesPlanCardio(a, day.cardio!),
    );
    if (hit) {
      await advanceProgram(program.id!);
      planAdvanced = true;
    }
  }

  put({ ...getStrava()!, lastSync: startedAt });
  return { added: plan.add.length, linked: plan.link.length, seen: activities.length, planAdvanced };
}

/** Sync quietly if connected and it's been a while. Safe to call on every app open. */
export async function autoSync(): Promise<void> {
  const s = getStrava();
  if (!isConnected(s) || !navigator.onLine) return;
  if (s.lastSync && Date.now() - s.lastSync < 15 * 60_000) return;
  try {
    await syncStrava();
  } catch {
    /* shown when the user syncs by hand */
  }
}
