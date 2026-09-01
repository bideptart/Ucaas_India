/**
 * Demo mode — a signed-in shell with no backend behind it.
 *
 * It exists so the UI can be worked on without an account on whatever API the
 * deployment points at. A session token is seeded before React mounts, so the
 * route guards treat the app as authenticated and `/` lands on the dashboard,
 * and every API call is answered locally instead of going out.
 *
 * Most lists come back with no rows, so screens render their real empty
 * states. The exception is the contact centre in `demo-contact-centre.ts` —
 * queues, agents, a call log, IVR flows, campaigns, SMS, contact lists, tasks
 * and voicemail — because Performance's tables and stat cards cannot be
 * worked on against nothing. All of it is invented and Indian throughout
 * (agents, contacts, +91 numbers). Nothing here reflects a real account, and
 * no screen showing this data is showing anything true about a customer.
 *
 * It can only ever run on a preview host — a `vercel.app` domain or a local dev
 * server, per `isPreviewHost`. On a real domain the checks below return false
 * whatever the environment says, so a stray `VITE_DEMO_MODE=true` in a
 * production build cannot open a hole: it is a build that never runs on a host
 * where the flag is consulted. Set `VITE_DEMO_MODE=false` to turn it off on a
 * preview host and sign in against the real API instead.
 */
import { isPreviewHost } from '@/lib/utils';
import {
  DEMO_AGENTS,
  demoAgentReportRows,
  demoCallStats,
  demoCalls,
  demoCalendarTaskRows,
  demoCampaignRows,
  demoContactGroupRows,
  demoFlowRows,
  demoQueueReportRows,
  demoQueueRows,
  demoSmsLogRows,
  demoVoicemailRows,
} from '@/lib/demo-contact-centre';

export const DEMO_SESSION_TOKEN = 'demo-mode-session-token';

export const isDemoMode = () => {
  if (!isPreviewHost()) return false;

  return String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase() !== 'false';
};

/** Route guards read dotted paths and require exactly `true` at the leaf. */
const grant = (paths: string[]) => {
  const root: Record<string, any> = {};

  for (const path of paths) {
    const keys = path.split('.');
    let node = root;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        node[key] = true;
        return;
      }
      if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
      node = node[key];
    });
  }

  return root;
};

/* Every key the route guards in src/router/index.tsx check, so demo mode can
   reach each screen rather than bouncing to an upgrade prompt. */
const PLAN_FEATURES = grant([
  'ai.IS_SHOW',
  'ai.action.agent.view',
  'ai.action.domain.view',
  'ai.action.knowledge_base.view',
  'account_setting.access.SITE.action.view',
  'account_setting.access.USER.action.view',
  'calling_rates.IS_SHOW',
  'calling_rates.action.view',
  'campaign.IS_SHOW',
  'campaign.action.view',
  'chat.IS_SHOW',
  'chat.action.view',
  'contact.IS_SHOW',
  'contact.action.view',
  'integration.IS_SHOW',
  'integration.action.view',
  'monitoring.action.view',
  'omni_channel.IS_SHOW',
  'omni_channel.action.view',
  'phone_system_action.IS_SHOW',
  'phone_system_action.access.DEPARTMENT',
  'phone_system_action.access.IVR',
  'phone_system_action.access.QUEUE',
  'phone_system_action.action.view',
  'reports.IS_SHOW',
  'reports.action.call_recording_listen',
  'reports.action.sms',
  'settings.action.greeting.view',
  'video.IS_SHOW',
  'video.access.RECORDING',
  'video.action.view',
  'virtual_numbers.action.view',
]);

/** Shaped like the `/api/user/info` result the app hydrates the session from. */
export const DEMO_USER = {
  token: DEMO_SESSION_TOKEN,
  uuid: 'demo-user-0000-0000-0000-000000000001',
  plan_uuid: 'demo-plan-0000-0000-0000-000000000001',
  user_info: {
    uuid: 'demo-user-0000-0000-0000-000000000001',
    first_name: 'Arjun',
    last_name: 'Mehta',
    name: 'Arjun Mehta',
    email: 'arjun.mehta@example.com',
    /* ADMIN so the guards read company plan features rather than a role's,
       and admin-only pages stay reachable. */
    role: 'ADMIN',
    extension: '1001',
    status: 1,
    timezone: 'Asia/Kolkata',
    plan_features: PLAN_FEATURES,
  },
  company_info: {
    uuid: 'demo-company-0000-0000-0000-000000000001',
    company_name: 'Demo Company',
    /* AuthProvider sends anyone without this to /phone-lines-auth. */
    free_did: true,
    is_trial: 'N',
    currency: 'USD',
    country: 'IN',
    timezone: 'Asia/Kolkata',
    plan_features: PLAN_FEATURES,
  },
};

/**
 * A list that answers to every shape the screens unwrap results with — `result`
 * itself, `result.rows`, `result.data`. It is a real array, so a screen that
 * maps straight over it works, and it carries the same rows on the properties a
 * paginated screen reaches for.
 */
const listPayload = (items: any[] = [], extra: Record<string, any> = {}) => {
  const list: any = [...items];
  list.data = items;
  list.rows = items;
  list.total = items.length;
  list.count = items.length;
  list.totalItems = items.length;
  list.totalPages = 1;
  list.current_page = 1;
  list.last_page = 1;
  /* Aggregates a screen reads off the result alongside the rows — the call
     log's `call_stats`, for instance. */
  Object.assign(list, extra);
  return list;
};

const ok = (result: unknown) => ({
  success: true,
  status: true,
  message: 'Demo mode',
  data: { message: 'Demo mode', result },
  result,
});

/* ---------------------------------------------------------------------------
   A small store so the management screens behave, not just render.

   Creating a user, editing one, assigning a role or defining a custom role all
   write here and show up in the lists afterwards, which is what makes those
   screens worth working on. It lives in localStorage, so a reload keeps what
   was entered; clearing site data resets it to the seed below.

   Everything in it is visibly fake — example.com addresses, "Demo" names — so
   nothing on screen can be mistaken for a real customer's data.
--------------------------------------------------------------------------- */

/* Bumped when the seed changes: the store is persisted, so an existing
   browser would otherwise keep serving the previous, smaller roster. */
const STORE_KEY = 'demo-mode-data-v3';

const ROLE_SEED = [
  { uuid: 'demo-role-admin', name: 'Administrator', slug: 'ADMIN', is_custom: false },
  { uuid: 'demo-role-subadmin', name: 'Sub Admin', slug: 'SUB_ADMIN', is_custom: false },
  { uuid: 'demo-role-manager', name: 'Manager', slug: 'MANAGER', is_custom: false },
  { uuid: 'demo-role-agent', name: 'Agent', slug: 'AGENT', is_custom: false },
];

const buildUser = (
  first: string,
  last: string,
  role: string,
  roleName: string,
  extension: string,
  phone = '',
  site = '',
) => ({
  uuid: `demo-user-${extension}`,
  first_name: first,
  last_name: last,
  name: `${first} ${last}`,
  full_name: `${first} ${last}`,
  email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
  extension,
  phone,
  site: site ? { name: site } : null,
  role,
  role_name: roleName,
  role_data: { name: roleName, slug: role },
  status: 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
});

/* The same roster the contact-centre data is built around, so an agent in the
   user list is the agent Performance reports handled calls for. */
const USER_SEED = DEMO_AGENTS.map((row) =>
  buildUser(
    row.first_name,
    row.last_name,
    row.role,
    row.role_name,
    row.extension,
    row.phone,
    row.site,
  ),
);

type Store = { users: any[]; roles: any[] };

const readStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* Corrupt or unavailable storage falls back to the seed. */
  }
  return { users: [...USER_SEED], roles: [...ROLE_SEED] };
};

const writeStore = (store: Store) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* A full or blocked store only costs persistence, not the screen. */
  }
};

const newUuid = () =>
  globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const asObject = (data: unknown): Record<string, any> => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) ?? {};
    } catch {
      return {};
    }
  }
  return data && typeof data === 'object' ? (data as Record<string, any>) : {};
};

/** Writes that the management screens make; returns null when none applies. */
const applyWrite = (url: string, body: Record<string, any>) => {
  const store = readStore();

  if (url.includes('/api/user/add-member')) {
    const created = {
      ...buildUser(
        body.first_name || 'New',
        body.last_name || 'Member',
        body.role || 'AGENT',
        body.role_name || body.role || 'Agent',
        String(body.extension || 1000 + store.users.length + 1),
      ),
      ...body,
      uuid: newUuid(),
    };
    store.users = [...store.users, created];
    writeStore(store);
    return ok(created);
  }

  if (url.includes('/api/user/update') || url.includes('/api/user/assign-role-bulk-users')) {
    const targets = new Set<string>(
      [body.uuid, body.user_uuid, ...(Array.isArray(body.user_uuids) ? body.user_uuids : [])].filter(
        Boolean,
      ),
    );
    store.users = store.users.map((user) =>
      targets.has(user.uuid) ? { ...user, ...body, uuid: user.uuid } : user,
    );
    writeStore(store);
    return ok(listPayload(store.users));
  }

  if (url.includes('/api/user/delete')) {
    const target = body.uuid || body.user_uuid;
    store.users = store.users.filter((user) => user.uuid !== target);
    writeStore(store);
    return ok({ deleted: true });
  }

  if (url.includes('/api/user/role/custom/upsert')) {
    const existing = store.roles.find((role) => role.uuid && role.uuid === body.uuid);
    if (existing) {
      store.roles = store.roles.map((role) =>
        role.uuid === body.uuid ? { ...role, ...body } : role,
      );
      writeStore(store);
      return ok(existing);
    }
    const created = { ...body, uuid: newUuid(), is_custom: true, name: body.name || 'Custom Role' };
    store.roles = [...store.roles, created];
    writeStore(store);
    return ok(created);
  }

  if (url.includes('/api/user/role/custom/remove')) {
    const target = url.split('/').filter(Boolean).pop();
    store.roles = store.roles.filter((role) => role.uuid !== target && role.uuid !== body.uuid);
    writeStore(store);
    return ok({ deleted: true });
  }

  return null;
};

/** Endpoint-specific answers; everything else gets an empty list. */
const matchDemoPayload = (url: string, data: unknown) => {
  if (url.includes('/api/user/info')) return ok(DEMO_USER);

  if (url.includes('/api/login') || url.includes('/api/verify-otp')) {
    return ok({ ...DEMO_USER, auth: DEMO_USER, token: DEMO_SESSION_TOKEN });
  }

  if (url.includes('/api/send-otp')) return ok({ sent: true });

  const written = applyWrite(url, asObject(data));
  if (written) return written;

  /* The contact centre the Performance views read. Empty lists would leave
     Queues, Agents, Calls, Flows and Boards as five empty states. */
  if (url.includes('/api/tenant/report/call-list')) {
    // Callbacks ▸ "Queue voicemail" calls this same endpoint with
    // `type: 'voicemail'` — a distinct, smaller set of rows, not the whole
    // day's call log filtered down.
    if (asObject(data)?.type === 'voicemail') return ok(listPayload(demoVoicemailRows()));
    return ok(listPayload(demoCalls(), { call_stats: demoCallStats() }));
  }
  if (url.includes('/api/tenant/report/agents')) return ok(listPayload(demoAgentReportRows()));
  if (url.includes('/api/tenant/report/call-queue/list')) {
    return ok(listPayload(demoQueueReportRows()));
  }
  if (url.includes('/api/call-queue/list')) return ok(listPayload(demoQueueRows()));
  if (url.includes('/api/tenant/ivr/list')) return ok(listPayload(demoFlowRows()));
  if (url.includes('/api/campaign/list')) return ok(listPayload(demoCampaignRows()));
  if (url.includes('/api/campaign/analytics')) {
    const campaignId = asObject(data)?.campaignId;
    const campaign = demoCampaignRows().find((row) => row._id === campaignId);
    return ok(campaign?.campaignAnalytics || {});
  }
  if (url.includes('/api/calendar/event-task/list')) return ok(listPayload(demoCalendarTaskRows()));
  if (url.includes('/api/v1/sms/logs')) return ok(listPayload(demoSmsLogRows()));
  if (url.includes('/api/contact/group/list')) return ok(listPayload(demoContactGroupRows()));

  if (url.includes('/api/user/role/list')) return ok(listPayload(readStore().roles));
  if (url.includes('/api/user/list')) return ok(listPayload(readStore().users));
  if (url.includes('/api/user/detail')) return ok(readStore().users[0] ?? null);

  return ok(listPayload());
};

export const buildDemoPayload = (url: string, data?: unknown) => matchDemoPayload(url, data);

/** Seeded before React mounts so the guards see a session on first render. */
export const seedDemoSession = (sessionKey: string) => {
  if (!isDemoMode()) return;
  if (localStorage.getItem(sessionKey)) return;

  localStorage.setItem(sessionKey, DEMO_SESSION_TOKEN);
};
