/**
 * Demo mode — a signed-in shell with no backend behind it.
 *
 * It exists so the UI can be worked on without an account on whatever API the
 * deployment points at. A session token is seeded before React mounts, so the
 * route guards treat the app as authenticated and `/` lands on the dashboard,
 * and every API call is answered locally instead of going out.
 *
 * The data is empty, not invented: lists come back with no rows so screens
 * render their real empty states. Nothing here reflects a real account, and no
 * screen showing this data is showing anything true about a customer.
 *
 * It can only ever run on a preview host — a `vercel.app` domain or a local dev
 * server, per `isPreviewHost`. On a real domain the checks below return false
 * whatever the environment says, so a stray `VITE_DEMO_MODE=true` in a
 * production build cannot open a hole: it is a build that never runs on a host
 * where the flag is consulted. Set `VITE_DEMO_MODE=false` to turn it off on a
 * preview host and sign in against the real API instead.
 */
import { isPreviewHost } from '@/lib/utils';

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
  'account_setting.access.SITE.action.add',
  'account_setting.access.SITE.action.edit',
  'account_setting.access.SITE.action.delete',
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
  'phone_system_action.action.add',
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
    first_name: 'Demo',
    last_name: 'User',
    name: 'Demo User',
    email: 'demo.user@example.com',
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
const listPayload = (items: any[] = []) => {
  const list: any = [...items];
  list.data = items;
  list.rows = items;
  list.total = items.length;
  list.count = items.length;
  list.current_page = 1;
  list.last_page = 1;
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

const STORE_KEY = 'demo-mode-data';
/* Bump this whenever USER_SEED/ROLE_SEED change shape or content. Without a
   version check, a browser's cached store (see `readStore`) would keep
   serving whatever the seed looked like the first time that browser ever
   ran demo mode, silently ignoring every later fix to the seed itself —
   which is exactly what happened while building this: the seed grew a
   `description` and `company_uuid` on each role, but browsers that had
   already cached a store kept the old shape indefinitely. */
const SEED_VERSION = 5;

/* `company_uuid: 'PREDEFINED'` is what marks a role as one of the platform's
   built-in starting points — `add-new-role/select-role` filters on exactly
   this to build its "Select a role to use as a starting point" list, and
   `permission.plan_features` is what its permissions accordion reads. Seed
   roles carried neither, so both of those rendered empty. */
const ROLE_SEED = [
  {
    uuid: 'demo-role-admin',
    role_uuid: 'demo-role-admin',
    name: 'Administrator',
    slug: 'ADMIN',
    is_custom: false,
    company_uuid: 'PREDEFINED',
    description: 'Full access — billing, users, numbers and every setting.',
    permission: { plan_features: PLAN_FEATURES },
  },
  {
    uuid: 'demo-role-subadmin',
    role_uuid: 'demo-role-subadmin',
    name: 'Sub Admin',
    slug: 'SUB_ADMIN',
    is_custom: false,
    company_uuid: 'PREDEFINED',
    description: 'Runs day-to-day settings without billing or plan changes.',
    permission: { plan_features: PLAN_FEATURES },
  },
  {
    uuid: 'demo-role-manager',
    role_uuid: 'demo-role-manager',
    name: 'Manager',
    slug: 'MANAGER',
    is_custom: false,
    company_uuid: 'PREDEFINED',
    description: 'Oversees a team — queues, reports and their own department.',
    permission: { plan_features: PLAN_FEATURES },
  },
  {
    uuid: 'demo-role-agent',
    role_uuid: 'demo-role-agent',
    name: 'Agent',
    slug: 'AGENT',
    is_custom: false,
    company_uuid: 'PREDEFINED',
    description: 'Takes calls and chats — no settings or other people’s data.',
    permission: { plan_features: PLAN_FEATURES },
  },
  {
    uuid: 'demo-role-supervisor',
    role_uuid: 'demo-role-supervisor',
    name: 'Supervisor',
    slug: 'SUPERVISOR',
    is_custom: true,
    description: 'Monitors live queues and can barge into calls.',
    permission: { plan_features: PLAN_FEATURES },
  },
  {
    uuid: 'demo-role-billing',
    role_uuid: 'demo-role-billing',
    name: 'Billing Specialist',
    slug: 'BILLING_SPECIALIST',
    is_custom: true,
    description: 'Invoices, refunds and payment methods only.',
    permission: { plan_features: PLAN_FEATURES },
  },
  {
    uuid: 'demo-role-readonly',
    role_uuid: 'demo-role-readonly',
    name: 'Read Only',
    slug: 'READ_ONLY',
    is_custom: true,
    description: 'Can view every screen, cannot change anything.',
    permission: { plan_features: PLAN_FEATURES },
  },
];

/** A couple of voices per language the greeting text-to-speech screen offers. */
const DEMO_VOICES = [
  { short_name: 'en-US-demo-1', display_name: 'Ava', gender: 'Female', locale: 'en-US' },
  { short_name: 'en-US-demo-2', display_name: 'Guy', gender: 'Male', locale: 'en-US' },
  { short_name: 'hi-IN-demo-1', display_name: 'Swara', gender: 'Female', locale: 'hi-IN' },
  { short_name: 'hi-IN-demo-2', display_name: 'Madhur', gender: 'Male', locale: 'hi-IN' },
  { short_name: 'es-ES-demo-1', display_name: 'Elvira', gender: 'Female', locale: 'es-ES' },
  { short_name: 'ar-SA-demo-1', display_name: 'Hamed', gender: 'Male', locale: 'ar-SA' },
];

/* A ~1-second silent WAV — there is no real speech engine behind demo mode,
   so this stands in for "the synthesized clip" wherever one is needed
   (audio preview player, the file handed to Upload). */
const DEMO_SILENT_WAV_BASE64 =
  'UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';

/** Enough sites that Directory ▸ Locations has more than two near-empty
   rows, and ▸ People's Location filter offers a real choice. */
const SITE_SEED = [
  {
    uuid: 'demo-site-hq',
    name: 'Bengaluru HQ',
    address: '4th Floor, Prestige Tech Park',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    postal_code: '560103',
    timezone: 'Asia/Kolkata',
    is_default: '1',
  },
  {
    uuid: 'demo-site-remote',
    name: 'Remote',
    address: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    timezone: '',
  },
  {
    uuid: 'demo-site-mumbai',
    name: 'Mumbai Office',
    address: '12th Floor, One World Center',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    postal_code: '400013',
    timezone: 'Asia/Kolkata',
  },
  {
    uuid: 'demo-site-austin',
    name: 'Austin Office',
    address: '500 W 2nd St, Suite 1900',
    city: 'Austin',
    state: 'Texas',
    country: 'United States',
    postal_code: '78701',
    timezone: 'America/Chicago',
  },
  {
    uuid: 'demo-site-london',
    name: 'London Office',
    address: '1 Canada Square, Canary Wharf',
    city: 'London',
    state: '',
    country: 'United Kingdom',
    postal_code: 'E14 5AB',
    timezone: 'Europe/London',
  },
];

const buildUser = (
  first: string,
  last: string,
  role: string,
  roleName: string,
  extension: string,
  site: (typeof SITE_SEED)[number] = SITE_SEED[0],
) => ({
  uuid: `demo-user-${extension}`,
  first_name: first,
  last_name: last,
  name: `${first} ${last}`,
  full_name: `${first} ${last}`,
  email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
  extension,
  role,
  role_name: roleName,
  role_data: { name: roleName, slug: role },
  status: 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  site_uuid: site.uuid,
  site: { name: site.name },
});

const USER_SEED = [
  buildUser('Demo', 'User', 'ADMIN', 'Administrator', '1001', SITE_SEED[0]),
  buildUser('Sam', 'Sub', 'SUB_ADMIN', 'Sub Admin', '1002', SITE_SEED[0]),
  buildUser('Mia', 'Manager', 'MANAGER', 'Manager', '1003', SITE_SEED[1]),
  buildUser('Alex', 'Agent', 'AGENT', 'Agent', '1004', SITE_SEED[1]),
  buildUser('Priya', 'Sharma', 'MANAGER', 'Manager', '1005', SITE_SEED[0]),
  buildUser('David', 'Park', 'AGENT', 'Agent', '1006', SITE_SEED[1]),
];

/** Four departments with managers and varied member counts, so the Groups
   view has more than two near-empty rows to show. Membership and manager
   are keyed by the same `demo-user-<extension>` uuids `buildUser` mints. */
const DEPARTMENT_SEED = [
  {
    uuid: 'demo-dept-sales',
    name: 'Sales',
    extension: '7001',
    description: 'Inbound and outbound sales calls, routed to whoever is free first.',
    manager: JSON.stringify({ user_uuid: 'demo-user-1005' }),
    members: JSON.stringify([
      { user_uuid: 'demo-user-1002' },
      { user_uuid: 'demo-user-1004' },
      { user_uuid: 'demo-user-1006' },
    ]),
  },
  {
    uuid: 'demo-dept-support',
    name: 'Customer Support',
    extension: '7002',
    description: 'Existing-customer tickets and calls — billing questions go to Finance instead.',
    manager: JSON.stringify({ user_uuid: 'demo-user-1003' }),
    members: JSON.stringify([{ user_uuid: 'demo-user-1003' }, { user_uuid: 'demo-user-1004' }]),
  },
  {
    uuid: 'demo-dept-engineering',
    name: 'Engineering',
    extension: '7003',
    description: 'Internal extension for the on-call engineer, not customer-facing.',
    manager: JSON.stringify({ user_uuid: 'demo-user-1005' }),
    members: JSON.stringify([{ user_uuid: 'demo-user-1005' }, { user_uuid: 'demo-user-1006' }]),
  },
  {
    uuid: 'demo-dept-finance',
    name: 'Finance & Billing',
    extension: '7004',
    description: 'Invoices, refunds and payment method updates.',
    members: JSON.stringify([{ user_uuid: 'demo-user-1002' }]),
  },
];

type Store = { version: number; users: any[]; roles: any[]; departments: any[]; sites: any[] };

const freshStore = (): Store => ({
  version: SEED_VERSION,
  users: [...USER_SEED],
  roles: [...ROLE_SEED],
  departments: [...DEPARTMENT_SEED],
  sites: [...SITE_SEED],
});

const readStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      // A cache from an older seed version is discarded rather than trusted —
      // it may be missing fields (or whole roles/users) that only exist in
      // the current seed, and there is no reliable way to merge the two.
      if (parsed?.version === SEED_VERSION) return parsed;
    }
  } catch {
    /* Corrupt or unavailable storage falls back to the seed. */
  }
  return freshStore();
};

/** The Roles table's "People" column reads `user_count` off each role — the
   seed never carried one, which is why it always showed 0. Computed here
   instead of hardcoded so it stays right as users are added, edited or
   reassigned rather than drifting from a number typed in once. */
const withUserCounts = (roles: any[], users: any[]) => {
  const bySlug = new Map<string, number>();
  users.forEach((user: any) => {
    const slug = String(user?.role || '').toUpperCase();
    if (!slug) return;
    bySlug.set(slug, (bySlug.get(slug) || 0) + 1);
  });
  return roles.map((role: any) => ({
    ...role,
    user_count: bySlug.get(String(role?.slug || '').toUpperCase()) || 0,
  }));
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

  /* `createDeparment` puts an edit's uuid on the URL (`.../upsert/<uuid>`)
     rather than the body, so a create is whatever's left after that path
     segment is stripped off — no uuid there at all. */
  if (url.includes('/api/tenant/department/upsert')) {
    const urlUuid = url.split('/api/tenant/department/upsert/')[1]?.split(/[/?]/)[0];
    const existing = urlUuid && store.departments.find((dept) => dept.uuid === urlUuid);
    const record = existing
      ? { ...existing, ...body, uuid: existing.uuid }
      : { ...body, uuid: newUuid() };
    store.departments = existing
      ? store.departments.map((dept) => (dept.uuid === existing.uuid ? record : dept))
      : [...store.departments, record];
    writeStore(store);
    return ok(record);
  }

  if (url.includes('/api/tenant/department/delete')) {
    const target = body.uuid || url.split('/').filter(Boolean).pop();
    store.departments = store.departments.filter((dept) => dept.uuid !== target);
    writeStore(store);
    return ok({ deleted: true });
  }

  /* `upsertSite` puts an edit's uuid on the URL (`.../upsert/<uuid>`), same
     as department upsert above. */
  if (url.includes('/api/site/upsert')) {
    const urlUuid = url.split('/api/site/upsert/')[1]?.split(/[/?]/)[0];
    const existing = urlUuid && store.sites.find((site) => site.uuid === urlUuid);
    const record = existing
      ? { ...existing, ...body, uuid: existing.uuid }
      : { ...body, uuid: newUuid() };
    store.sites = existing
      ? store.sites.map((site) => (site.uuid === existing.uuid ? record : site))
      : [...store.sites, record];
    writeStore(store);
    return ok(record);
  }

  if (url.includes('/api/site/delete')) {
    const target = body.uuid || body.id || url.split('/').filter(Boolean).pop();
    store.sites = store.sites.filter((site) => site.uuid !== target);
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

  if (url.includes('/api/user/role/list')) {
    const store = readStore();
    return ok(listPayload(withUserCounts(store.roles, store.users)));
  }
  if (url.includes('/api/user/list')) return ok(listPayload(readStore().users));
  if (url.includes('/api/user/detail')) return ok(readStore().users[0] ?? null);
  if (url.includes('/api/site/list')) return ok(listPayload(readStore().sites));
  if (url.includes('/api/tenant/department/list')) return ok(listPayload(readStore().departments));

  /* Whoever can be forwarded to — the same roster new-department's "Add
     Members" step, and anywhere else in the app that offers "who should
     this go to", picks from. Unhandled before, so every one of those
     pickers always came back empty ("Nobody to add") regardless of how
     many people exist. */
  if (url.includes('/api/tenant/forwarding-action/type')) {
    const params = asObject(data);
    let rows = readStore().users;
    if (params.site_uuid) {
      rows = rows.filter((user: any) => user?.site_uuid === params.site_uuid);
    }
    const needle = String(params.search || '')
      .trim()
      .toLowerCase();
    if (needle) {
      rows = rows.filter((user: any) =>
        [user?.first_name, user?.last_name, user?.email, user?.extension]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
    }
    return ok(listPayload(rows));
  }

  /* Text-to-speech has no real synthesis engine to call from a static
     preview, so this hands back a tiny (silent) WAV instead of the actual
     spoken text — enough for the "convert" round-trip (voice list → speak →
     preview → attach) to work end to end rather than silently doing
     nothing, which is what every screen using this flow did before. */
  if (url.includes('/api/tenant/greeting/voice-list')) {
    const params = asObject(data);
    const locale = String(params.locale || 'en-US');
    return ok({
      voices: DEMO_VOICES.filter((voice) => voice.locale === locale),
    });
  }
  if (url.includes('/api/tenant/greeting/upload-v2')) {
    return ok(DEMO_SILENT_WAV_BASE64);
  }
  if (url.includes('/api/media/upload/url')) {
    const params = asObject(data);
    return ok({ url: 'demo://upload', file_name: params.file_name || 'audio.mp3' });
  }
  if (url.includes('/api/tenant/greeting/create') || url.includes('/api/tenant/greeting/update')) {
    return ok({ uuid: `demo-greeting-${Date.now()}` });
  }

  return ok(listPayload());
};

export const buildDemoPayload = (url: string, data?: unknown) => matchDemoPayload(url, data);

/** Seeded before React mounts so the guards see a session on first render. */
export const seedDemoSession = (sessionKey: string) => {
  if (!isDemoMode()) return;
  if (localStorage.getItem(sessionKey)) return;

  localStorage.setItem(sessionKey, DEMO_SESSION_TOKEN);
};
