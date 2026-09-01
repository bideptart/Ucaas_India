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
import { demoAiVoiceRows } from '@/lib/demo-ai-voices';
import { demoCrawledPages } from '@/lib/demo-site-crawl';
import { getDemoReviewJob, startDemoReviewJob } from '@/lib/demo-knowledge-review';
import { resolveCaptainRequest } from '@/lib/demo-captain';
import {
  DEMO_AGENTS,
  demoAgentReportRows,
  demoAssignedDidRows,
  demoCallStats,
  demoCalls,
  demoCalendarTaskRows,
  demoCampaignRows,
  demoContactBookRows,
  demoContactGroupRows,
  demoDepartmentRows,
  demoDncRows,
  demoFaxConversations,
  demoFaxMessages,
  demoFlowRows,
  filterCallsByDateRange,
  demoInboundCallRows,
  demoLocalCallRows,
  demoMeetingRows,
  demoSiteRows,
  demoTemplateRows,
  demoQueueReportRows,
  demoQueueRows,
  demoSmsConversations,
  demoSmsLogRows,
  demoSmsThreadRows,
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
  'ai.access.CHAT',
  'ai.access.VOICE',
  'account_setting.access.SITE.action.view',
  'account_setting.access.SITE.action.add',
  'account_setting.access.SITE.action.edit',
  'account_setting.access.SITE.action.delete',
  'account_setting.access.USER.action.view',
  'account_setting.access.USER.action.add',
  'advance_call_management.access.RECORDING',
  'advance_call_management.access.TRANSCRIPTION',
  'billing.action.view',
  'calling_rates.IS_SHOW',
  'calling_rates.action.view',
  'campaign.IS_SHOW',
  'campaign.action.view',
  'chat.IS_SHOW',
  'chat.action.view',
  'chat.access.DIRECT_MESSAGE',
  'chat.access.TEAM_MESSAGE',
  'chat.access.UPLOAD_FILES',
  'chat.access.CHAT_VIDEO',
  'chat.create_folder',
  'chat.create_note',
  'contact.IS_SHOW',
  'contact.action.view',
  'integration.IS_SHOW',
  'integration.action.view',
  'messages.IS_SHOW',
  'messages.action.send_fax',
  'messages.action.send_message',
  'messages.action.send_mms',
  'monitoring.action.view',
  'monitoring_features.action.barge',
  'monitoring_features.action.hangup',
  'monitoring_features.action.intercept',
  'monitoring_features.action.listen',
  'monitoring_features.action.whisper',
  'omni_channel.IS_SHOW',
  'omni_channel.access',
  'omni_channel.action.view',
  'phone_system.EXTENSION',
  'phone_system.VOICEMAIL',
  'phone_system_action.IS_SHOW',
  'phone_system_action.access.ANNOUNCEMENT',
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
  'video.action.create',
  'virtual_numbers.action.view',
  'virtual_numbers.action.assign_number',
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
  /* Inbox's "Your number" picker reads `user.assigned_did` off the top-level
     session object the app hydrates `user` from (`{...data}` in
     UserContext) — not off `user_info` — so it has to sit here rather than
     nested, or the dropdown and its default-number effect have nothing to
     work with. */
  assigned_did: demoAssignedDidRows(),
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
/**
 * `page`/`limit` come third rather than being folded into `extra`: every
 * TableManager screen sends them on every request (a "per page" picker, a
 * page-forward click), and until this read them the same full array came
 * back for page 1 and page 2 alike — a 64-row call log under a 25-per-page
 * table showed all 64 with no second page to click to. Passing the raw
 * request body here is enough; page/limit default to "no real paging" (one
 * page holding everything) when the caller doesn't have them or the list is
 * always small, so most call sites need change nothing.
 */
const listPayload = (
  items: any[] = [],
  extra: Record<string, any> = {},
  requestData?: unknown,
) => {
  const totalItems = items.length;
  const requested = asObject(requestData);
  const page = Math.max(1, Number(requested?.page) || 1);
  const limit = Number(requested?.limit) || totalItems || 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const start = (page - 1) * limit;
  const pageItems = limit >= totalItems ? items : items.slice(start, start + limit);

  const list: any = [...pageItems];
  list.data = pageItems;
  list.rows = pageItems;
  list.total = totalItems;
  list.count = totalItems;
  list.totalItems = totalItems;
  list.totalPages = totalPages;
  list.current_page = page;
  list.last_page = totalPages;
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
    return ok(listPayload(store.users, {}, body));
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
    const dateRange = asObject(data)?.filter_date as { from?: string; to?: string } | undefined;
    // Callbacks ▸ "Queue voicemail" calls this same endpoint with
    // `type: 'voicemail'` — a distinct, smaller set of rows, not the whole
    // day's call log filtered down.
    if (asObject(data)?.type === 'voicemail') {
      const voicemailRows = filterCallsByDateRange(demoVoicemailRows(), dateRange);
      return ok(listPayload(voicemailRows, {}, data));
    }
    let rangedCalls = filterCallsByDateRange(demoCalls(), dateRange);
    // Reports ▸ Outbound sends `filter: [{key:'direction', value:'Outbound'}, ...]` —
    // without honoring it the page would list inbound calls under "Outbound".
    const directionFilter = (asObject(data)?.filter || []).find(
      (row: any) => row?.key === 'direction',
    );
    if (directionFilter?.value) {
      rangedCalls = rangedCalls.filter((row) => row.direction === directionFilter.value);
    }
    return ok(listPayload(rangedCalls, { call_stats: demoCallStats(rangedCalls) }, data));
  }
  if (url.includes('/api/tenant/report/agents')) {
    const dateRange = asObject(data)?.filter_date as { from?: string; to?: string } | undefined;
    const rangedCalls = filterCallsByDateRange(demoCalls(), dateRange);
    return ok(listPayload(demoAgentReportRows(rangedCalls), {}, data));
  }
  if (url.includes('/api/tenant/report/call-queue/list')) {
    /* The shipped Queue report calls this with no date filter at all (see
       queue/index.tsx, where filter_date is commented out) — always the
       full pool, matching real backend behaviour. */
    return ok(listPayload(demoQueueReportRows(), {}, data));
  }
  if (url.includes('/api/call-queue/list')) return ok(listPayload(demoQueueRows(), {}, data));
  if (url.includes('/api/tenant/ivr/list')) return ok(listPayload(demoFlowRows(), {}, data));
  /* The AI Receptionist builder's Voice & Persona step. An empty list here
     leaves its required voice field with nothing to select, which stops the
     wizard at step 2 rather than just looking bare. */
  if (url.includes('/api/ai/voice/list')) return ok(listPayload(demoAiVoiceRows()));
  /* The website scan behind both knowledge-base builders. Deliberately a bare
     array rather than `ok(...)`: both read `Array.isArray(response.data)` and
     treat anything else as nothing found. */
  if (url.includes('/api/ai/chat-agent/site-crawl')) {
    return demoCrawledPages(String(asObject(data)?.site_url || ''));
  }
  /* The Review step's job. Order matters: every path below contains the
     `review-job` prefix, so the specific ones have to be tested first or they
     would all be answered as a fresh job. */
  if (url.includes('/api/ai/knowledge-base/review-job/status')) {
    return getDemoReviewJob(String(asObject(data)?.jobId || ''));
  }
  if (url.includes('/api/ai/knowledge-base/review-job/cleanup')) return ok({ cleaned: true });
  if (url.includes('/api/ai/knowledge-base/review-job')) {
    return startDemoReviewJob(asObject(data));
  }
  /* Creating the receptionist ingests its knowledge first, and every ingest
     is checked for an id before the next one runs — "Generated knowledge base
     was created without an ingestion ID." is thrown on a missing one, which
     stopped Create Receptionist on the last step. The id is read off the body
     directly, so it sits at the top level rather than inside `ok()`. */
  if (
    url.includes('/api/ai/user/add-content') ||
    url.includes('/api/ai/user/ingest/url') ||
    url.includes('/api/ai/user/ingest/pdf')
  ) {
    return { ingestionId: `demo-ingestion-${Math.random().toString(36).slice(2, 10)}` };
  }
  if (url.includes('/api/campaign/list')) return ok(listPayload(demoCampaignRows(), {}, data));
  if (url.includes('/api/campaign/analytics')) {
    const campaignId = asObject(data)?.campaignId;
    const campaign = demoCampaignRows().find((row) => row._id === campaignId);
    return ok(campaign?.campaignAnalytics || {});
  }
  if (url.includes('/api/calendar/event-task/list')) {
    return ok(listPayload(demoCalendarTaskRows(), {}, data));
  }
  if (url.includes('/api/v1/sms/logs')) return ok(listPayload(demoSmsLogRows(), {}, data));
  if (url.includes('/api/contact/group/list')) {
    return ok(listPayload(demoContactGroupRows(), {}, data));
  }
  if (url.includes('/api/tenant/department/list')) {
    return ok(listPayload(demoDepartmentRows(), {}, data));
  }
  if (url.includes('/api/site/list')) return ok(listPayload(demoSiteRows(), {}, data));
  if (url.includes('/api/contact/list')) {
    /* Directory ▸ Blocked reads this same endpoint twice — once for the whole
       book, once filtered to `tag: 'BLOCK'` for the table itself — so the
       filter has to actually apply or "blocked" shows everyone. */
    const tagFilter = (asObject(data)?.filters || []).find((row: any) => row?.key === 'tag');
    const rows = tagFilter
      ? demoContactBookRows().filter((row) => row.tag === tagFilter.value)
      : demoContactBookRows();
    return ok(listPayload(rows, {}, data));
  }
  if (url.includes('/api/tenant/report/inbound-calls')) {
    /* This page reads `result.data.data` for rows and `result.data.call_stats`
       for the summary tiles — one extra `.data` nesting level deeper than
       every other call-list-backed report. */
    const dateRange = asObject(data)?.filter_date as { from?: string; to?: string } | undefined;
    const rangedCalls = filterCallsByDateRange(demoCalls(), dateRange);
    const rows = demoInboundCallRows(rangedCalls);
    const totalDuration = rows.reduce((sum, row) => sum + (Number(row.billsectotal) || 0), 0);
    return ok({
      data: {
        data: rows,
        call_stats: { ...demoCallStats(rangedCalls), total_duration: totalDuration },
      },
    });
  }
  if (url.includes('/api/tenant/local-call-list')) {
    return ok(listPayload(demoLocalCallRows(), {}, data));
  }
  if (url.includes('/api/campaign/dnc/list')) return ok(listPayload(demoDncRows(), {}, data));
  if (url.includes('/api/tenant/user/template/list')) {
    return ok(listPayload(demoTemplateRows(), {}, data));
  }
  if (url.includes('/api/v1/meeting/listing')) return ok(listPayload(demoMeetingRows(), {}, data));

  /* Inbox and the admin Numbers list both read the same handful of company
     numbers — one function, three callers. */
  if (url.includes('/api/fax/did/number/assigned')) return ok(demoAssignedDidRows());
  if (url.includes('/api/numbers/list')) return ok(listPayload(demoAssignedDidRows(), {}, data));

  /* Inbox's conversation list, then the open thread's own messages. Neither
     shares a URL with the SMS *log* above — that's Reports, this is Inbox. */
  if (url.includes('/api/v1/sms/did-list')) return ok(demoSmsConversations());
  if (url.includes('/api/v1/sms/list')) {
    const chatId = asObject(data)?.chat_id;
    return ok(listPayload(demoSmsThreadRows(chatId), {}, data));
  }
  if (url.includes('/api/fax/to-number-list')) {
    return ok(listPayload(demoFaxConversations(), {}, data));
  }
  if (url.includes('/api/fax/list')) {
    const faxMessageId = asObject(data)?.filters?.faxMessageId;
    return ok(listPayload(demoFaxMessages(faxMessageId), {}, data));
  }

  /* Home's "today" digest re-reads the call log through a second endpoint
     rather than the one `demoCalls()` already answers above. */
  if (url.includes('/api/tenant/report/phone-call-list')) {
    const params = asObject(data);
    if (params?.type === 'voicemail') {
      const rows = demoVoicemailRows();
      return ok(listPayload(rows, { totalRecords: rows.length }, data));
    }
    const wantsMissed = (params?.filter || []).some(
      (row: any) => row?.key === 'direction' && row?.value === 'Missed',
    );
    const rows = wantsMissed
      ? demoCalls()
          .filter((row) => row.direction === 'Inbound' && row.billsectotal === 0)
          .map((row) => ({ ...row, direction: 'Missed' }))
      : demoCalls();
    return ok(listPayload(rows, { totalRecords: rows.length }, data));
  }

  if (url.includes('/api/user/role/list')) return ok(listPayload(readStore().roles, {}, data));
  if (url.includes('/api/user/list')) return ok(listPayload(readStore().users, {}, data));
  if (url.includes('/api/user/detail')) return ok(readStore().users[0] ?? null);

  return ok(listPayload());
};

export const buildDemoPayload = (url: string, data?: unknown) => matchDemoPayload(url, data);

/**
 * The Captain screens call their own service with `fetch`, so the axios
 * adapter never sees them. Answering them means intercepting `fetch` itself.
 *
 * Only `/captain-api/` paths are handled; everything else — the organisation
 * lookup, fonts, the Vite dev client — is passed through to the real `fetch`
 * untouched, so nothing outside Captain changes behaviour.
 */
const CAPTAIN_PREFIX = '/captain-api/';

export const installCaptainDemoFetch = () => {
  if (!isDemoMode()) return;
  if ((window.fetch as { __demo?: boolean }).__demo) return;

  const realFetch = window.fetch.bind(window);

  const demoFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (!url.includes(CAPTAIN_PREFIX)) return realFetch(input as RequestInfo, init);

    const method = init?.method || (input instanceof Request ? input.method : undefined) || 'GET';

    return new Response(
      JSON.stringify({ data: resolveCaptainRequest(url, { ...init, method }) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  (demoFetch as { __demo?: boolean }).__demo = true;
  window.fetch = demoFetch as typeof window.fetch;
};

/** Seeded before React mounts so the guards see a session on first render. */
export const seedDemoSession = (sessionKey: string) => {
  if (!isDemoMode()) return;
  if (localStorage.getItem(sessionKey)) return;

  localStorage.setItem(sessionKey, DEMO_SESSION_TOKEN);
};