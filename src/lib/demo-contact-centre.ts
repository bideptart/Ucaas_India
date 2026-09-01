/**
 * A contact centre worth looking at, for demo mode.
 *
 * `demo-mode.ts` answers every request with an empty list, which is honest but
 * leaves most of Performance — Queues, Agents, Calls, Flows, Boards, Callbacks,
 * Speech & Text, and the Reports catalog — rendering empty states. You cannot
 * judge a layout, a stat card or a table against no rows. This is the invented
 * account those screens read instead.
 *
 * Everything is derived from one generated call log, so the surfaces agree with
 * each other: a queue's Handled, an agent's AHT and the CDR table are the same
 * calls counted three ways rather than three unrelated made-up numbers.
 *
 * The account is Indian throughout, by request: agents, contacts and every
 * phone number are Indian names and +91 numbers, not a mixed international
 * roster. It is only ever reachable through demo mode, which only ever runs on
 * a preview host, so nothing here can be mistaken for a real customer's data.
 */

const DAY_START_HOUR = 9;

/* Deterministic, so a refresh does not reshuffle every number on screen. */
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type DemoAgent = {
  uuid: string;
  first_name: string;
  last_name: string;
  extension: string;
  /** A +91 mobile, distinct per agent — Directory ▸ People and the admin
   *  roster both read this, so it can't be left blank without every one of
   *  them rendering a bare "+undefined". */
  phone: string;
  /** One of the two IVR flow sites below, so an agent's site and a flow's
   *  site are the same short list rather than two unrelated ones. */
  site: string;
  role: string;
  role_name: string;
};

const agent = (
  first: string,
  last: string,
  extension: string,
  site: string,
  role = 'AGENT',
  roleName = 'Agent',
): DemoAgent => ({
  uuid: `demo-user-${extension}`,
  first_name: first,
  last_name: last,
  extension,
  /* Extension's last two digits keep each agent's number distinct and easy
     to eyeball against their extension. */
  phone: `+9198765430${extension.slice(-2)}`,
  site,
  role,
  role_name: roleName,
});

/** The floor. Extensions are the join key every surface matches on. */
export const DEMO_AGENTS: DemoAgent[] = [
  agent('Arjun', 'Mehta', '1001', 'Mumbai HQ', 'ADMIN', 'Administrator'),
  agent('Sanjay', 'Kapoor', '1002', 'Mumbai HQ', 'SUB_ADMIN', 'Sub Admin'),
  agent('Meera', 'Nair', '1003', 'Mumbai HQ', 'MANAGER', 'Manager'),
  agent('Priya', 'Sharma', '1004', 'Mumbai HQ'),
  agent('Karan', 'Malhotra', '1005', 'Mumbai HQ'),
  agent('Ananya', 'Iyer', '1006', 'Bengaluru'),
  agent('Vikram', 'Reddy', '1007', 'Bengaluru'),
  agent('Neha', 'Gupta', '1008', 'Bengaluru'),
];

type DemoQueue = {
  uuid: string;
  name: string;
  memberExtensions: string[];
  /** Right-now service level, the figure the KPI band and wallboard read. */
  sla: number;
};

export const DEMO_QUEUES: DemoQueue[] = [
  { uuid: 'demo-queue-sales', name: 'Sales', memberExtensions: ['1004', '1005', '1006'], sla: 88 },
  {
    uuid: 'demo-queue-support',
    name: 'Support',
    memberExtensions: ['1004', '1006', '1007', '1008'],
    sla: 74,
  },
  { uuid: 'demo-queue-billing', name: 'Billing', memberExtensions: ['1002', '1007'], sla: 91 },
  {
    uuid: 'demo-queue-onboarding',
    name: 'Onboarding',
    memberExtensions: ['1003', '1005'],
    sla: 96,
  },
  {
    uuid: 'demo-queue-retention',
    name: 'Retention',
    memberExtensions: ['1006', '1008'],
    sla: 58,
  },
];

export const DEMO_FLOWS = [
  { uuid: 'demo-ivr-main', name: 'Main Menu', extension: '8001', site: 'Mumbai HQ' },
  { uuid: 'demo-ivr-support', name: 'Support Routing', extension: '8002', site: 'Mumbai HQ' },
  { uuid: 'demo-ivr-afterhours', name: 'After Hours', extension: '8003', site: 'Bengaluru' },
  { uuid: 'demo-ivr-callback', name: 'Callback Offer', extension: '8004', site: 'Bengaluru' },
];

/**
 * `campaignStatus`/`dialMethod` use the platform's own tokens (`PROCESSING`,
 * `PAUSE`, `PROGRESSIVE`...) so `StatusPill`/`DIAL_METHOD_LABEL` in
 * `pages/auto-dialer/campaign/campaign-ui.tsx` render them, not an "Unknown"
 * fallback. `assignedLeads` is the base every outcome count below is a share
 * of, so the four always foot back to it.
 */
const DEMO_CAMPAIGN_SEED = [
  {
    uuid: 'demo-campaign-renewals',
    name: 'Q3 Renewals',
    campaignStatus: 'PROCESSING',
    dialMethod: 'PROGRESSIVE',
    assignedLeads: 420,
    answeredLeads: 231,
    totalCallNotAnswered: 96,
    totalDnc: 18,
    memberExtensions: ['1004', '1005', '1006'],
    daysAgoStarted: 6,
    daySpan: 14,
  },
  {
    uuid: 'demo-campaign-winback',
    name: 'Winback - Lapsed',
    campaignStatus: 'PROCESSING',
    dialMethod: 'PREDICTIVE',
    assignedLeads: 860,
    answeredLeads: 302,
    totalCallNotAnswered: 411,
    totalDnc: 47,
    memberExtensions: ['1006', '1007', '1008'],
    daysAgoStarted: 2,
    daySpan: 21,
  },
  {
    uuid: 'demo-campaign-survey',
    name: 'CSAT Survey',
    campaignStatus: 'PAUSE',
    dialMethod: 'PREVIEW',
    assignedLeads: 150,
    answeredLeads: 84,
    totalCallNotAnswered: 40,
    totalDnc: 6,
    memberExtensions: ['1002', '1005'],
    daysAgoStarted: 10,
    daySpan: 10,
  },
  {
    uuid: 'demo-campaign-upsell',
    name: 'Upsell - Pro Tier',
    campaignStatus: 'COMPLETED',
    dialMethod: 'PROGRESSIVE',
    assignedLeads: 300,
    answeredLeads: 210,
    totalCallNotAnswered: 76,
    totalDnc: 14,
    memberExtensions: ['1004', '1007'],
    daysAgoStarted: 30,
    daySpan: 12,
  },
];

/* Exported: Directory ▸ External reuses these same twelve people as address
   book entries, so a caller in the CDR and a contact in the directory are
   recognisably the same person rather than two disconnected invented lists. */
export const CONTACT_NAMES = [
  'Rahul Deshmukh',
  'Sneha Joshi',
  'Aditya Kumar',
  'Pooja Bansal',
  'Rohan Chatterjee',
  'Kavya Pillai',
  'Siddharth Rao',
  'Ishita Agarwal',
  'Manish Tiwari',
  'Divya Menon',
  'Farhan Sheikh',
  'Ritu Choudhary',
];

/* The company's own numbers — an Indian toll-free line and a Mumbai (022)
   landline, both carrying +91 so the flag lookup reads them as Indian rather
   than defaulting to +1 once a leading '+' is added. Exported: Inbox's
   "Your number" / fax-number pickers and the admin Numbers list all read the
   same handful of numbers rather than each inventing their own. */
export const DIDS = ['+911800123456', '+911800234567', '+912233445566'];

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** "HH:MM:SS" — the format the report pages parse `billsec` as. */
const secondsToClock = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

/* A handful of Indian mobile prefixes cycling with a varied five-digit tail —
   reads as a real +91 number without ever landing on one actually issued. */
const INDIAN_MOBILE_PREFIXES = ['98765', '99887', '97123', '96654', '91234', '88990'];
const fakeCaller = (index: number) => {
  const prefix = INDIAN_MOBILE_PREFIXES[index % INDIAN_MOBILE_PREFIXES.length];
  const tail = pad((index * 37 + 10007) % 90000, 5);
  return `+91${prefix}${tail}`;
};

const CONTACT_COMPANIES = [
  'Nimbus Retail Pvt Ltd',
  'Shree Enterprises',
  'Vertex Logistics',
  'Coral Bay Hospitality',
  'Aster Healthcare',
  'Pinnacle Realty',
  'Bluewave Textiles',
  'Orion Fintech',
  'Meadow Foods',
  'Sundar Consulting',
  'Northstar Freight',
  'Zenith Apparel',
];

/** `/api/contact/list` — Directory ▸ External, the address book. */
export const demoContactBookRows = () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  return CONTACT_NAMES.map((fullName, index) => {
    const [first, ...rest] = fullName.split(' ');
    const last = rest.join(' ');
    return {
      _id: `demo-contact-${index + 1}`,
      name: { first, last },
      contact: {
        phone: fakeCaller(500 + index),
        email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      },
      profile: { contactPic: null, company: CONTACT_COMPANIES[index % CONTACT_COMPANIES.length] },
      company: CONTACT_COMPANIES[index % CONTACT_COMPANIES.length],
      title: index % 3 === 0 ? 'Owner' : index % 3 === 1 ? 'Purchase Manager' : 'Operations Lead',
      social: {},
      groupMeta: [],
      is_vip: index % 5 === 0,
      is_dnc: index === 4,
      is_blocked: index === 9,
      tag: index === 9 ? 'BLOCK' : index === 4 ? 'DNC' : index % 5 === 0 ? 'VIP' : 'STANDARD',
      createdAt: new Date(now - (30 + index) * DAY_MS).toISOString(),
      updatedAt: new Date(now - index * DAY_MS).toISOString(),
    };
  });
};

export type DemoCall = Record<string, any>;

const buildCalls = (now: number): DemoCall[] => {
  const random = mulberry32(20260831);
  const rows: DemoCall[] = [];

  const dayStart = new Date(now);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  /* Before the working day has started, still lay the calls out behind us. */
  const windowStart = Math.min(dayStart.getTime(), now - 60 * 60 * 1000);
  const span = Math.max(now - windowStart, 60 * 60 * 1000);

  const total = 64;

  for (let index = 0; index < total; index += 1) {
    const roll = random();
    const kind = roll < 0.58 ? 'QUEUE' : roll < 0.78 ? 'IVR' : 'DIRECT';
    const outbound = kind === 'DIRECT' && random() < 0.62;

    const queue = DEMO_QUEUES[Math.floor(random() * DEMO_QUEUES.length)];
    const flow = DEMO_FLOWS[Math.floor(random() * DEMO_FLOWS.length)];
    const handler =
      kind === 'QUEUE'
        ? queue.memberExtensions[Math.floor(random() * queue.memberExtensions.length)]
        : DEMO_AGENTS[Math.floor(random() * DEMO_AGENTS.length)].extension;
    const handlerAgent = DEMO_AGENTS.find((row) => row.extension === handler) as DemoAgent;

    /* Retention is the queue that is struggling — it abandons more, which is
       what gives the SLA and abandon-rate cards something to say. */
    const abandonChance = kind === 'IVR' ? 0.12 : queue.uuid === 'demo-queue-retention' ? 0.34 : 0.1;
    const answered = outbound ? random() > 0.14 : random() > abandonChance;

    const wait = answered ? Math.round(4 + random() * 46) : Math.round(20 + random() * 70);
    const talk = answered ? Math.round(45 + random() * 520) : 0;

    const startedAt = windowStart + Math.floor((span * (index + random())) / total);
    const contact = CONTACT_NAMES[index % CONTACT_NAMES.length];
    const caller = fakeCaller(index);
    const did = DIDS[index % DIDS.length];

    rows.push({
      uuid: `demo-cdr-${index + 1}`,
      sipcall_id: `demo-sip-${index + 1}`,
      count: 1,
      start_stamp: new Date(startedAt).toISOString(),
      answer_stamp: answered ? new Date(startedAt + wait * 1000).toISOString() : null,
      end_stamp: new Date(startedAt + (wait + talk) * 1000).toISOString(),
      direction: outbound ? 'Outbound' : 'Inbound',
      status: answered ? 'ANSWERED' : 'NO ANSWER',
      caller_id_number: outbound ? handler : caller,
      display_caller_number: caller,
      from_display_name: outbound ? `${handlerAgent.first_name} ${handlerAgent.last_name}` : contact,
      contact_name: contact,
      contact_type: index % 5 === 0 ? 'LEAD' : '',
      extension: handler,
      agent_extension: handler,
      via_did: kind === 'IVR' ? flow.extension : did,
      destination_number: kind === 'IVR' ? flow.extension : outbound ? caller : did,
      forward_type: kind === 'DIRECT' ? null : kind,
      forward_value: kind === 'QUEUE' ? queue.uuid : kind === 'IVR' ? flow.uuid : null,
      forward_name: kind === 'QUEUE' ? queue.name : kind === 'IVR' ? flow.name : null,
      queue_uuid: kind === 'QUEUE' ? queue.uuid : null,
      is_voicemail: 0,
      hangup_cause: answered ? 'NORMAL_CLEARING' : 'NO_ANSWER',
      /* The report pages (Call History, Outbound, Voicemail, Call Recording,
         Inbound, Local Call List — and Performance ▸ Calls, which embeds
         Call History) all parse `billsec` as an "HH:MM:SS" string themselves
         (`timeStringToSeconds`, or sliced straight as a fallback duration);
         `billsectotal` is the one every page's primary duration column reads
         as a plain number, so that stays numeric. Internally, every demo
         aggregation below reads `billsectotal`, never `billsec`, for exactly
         this reason. */
      billsec: secondsToClock(talk),
      billsectotal: talk,
      duration: wait + talk,
      durationtotal: wait + talk,
      charge: Number(((talk / 60) * 0.012).toFixed(4)),
      chargeTotal: Number(((talk / 60) * 0.012).toFixed(4)),
    });
  }

  return rows.sort((left, right) => Date.parse(right.start_stamp) - Date.parse(left.start_stamp));
};

/* Built once per page load: the figures then hold still across the 2s refetch
   instead of every card animating to a new number twice a second. */
let cachedCalls: DemoCall[] | null = null;
export const demoCalls = () => {
  if (!cachedCalls) cachedCalls = buildCalls(Date.now());
  return cachedCalls;
};

const isMissed = (row: DemoCall) => row.direction === 'Inbound' && row.billsectotal === 0;

export const demoCallStats = () => {
  const rows = demoCalls();
  return {
    total_calls: rows.length,
    missed_calls: rows.filter(isMissed).length,
    inbound_calls: rows.filter((row) => row.direction === 'Inbound').length,
    outbound_calls: rows.filter((row) => row.direction === 'Outbound').length,
    voicemail: 0,
  };
};

/** `/api/tenant/report/inbound-calls` — Reports ▸ Inbound, the same log
 *  filtered to one direction. */
export const demoInboundCallRows = () =>
  demoCalls()
    .filter((row) => row.direction === 'Inbound')
    /* `billsec` already arrives as the "HH:MM:SS" string this page (and every
       other call-list report) expects; only `waitsec` is specific to this
       one's own duration-column fallback. */
    .map((row): DemoCall => ({ ...row, waitsec: 2 }));

/** `/api/tenant/local-call-list` — extension-to-extension calls, which the
 *  generated CDR doesn't otherwise model. A handful of short internal calls
 *  between agents on the same roster the rest of the app already uses. */
export const demoLocalCallRows = () => {
  const now = Date.now();
  const MIN_MS = 60 * 1000;
  const pairs = [
    { fromExt: '1004', toExt: '1005', minutesAgo: 42, durationSec: 95 },
    { fromExt: '1006', toExt: '1003', minutesAgo: 130, durationSec: 210 },
    { fromExt: '1002', toExt: '1001', minutesAgo: 260, durationSec: 48 },
    { fromExt: '1008', toExt: '1007', minutesAgo: 400, durationSec: 165 },
  ];
  return pairs.map((row, index) => {
    const from = DEMO_AGENTS.find((agent) => agent.extension === row.fromExt) as DemoAgent;
    const to = DEMO_AGENTS.find((agent) => agent.extension === row.toExt) as DemoAgent;
    const startedAt = now - row.minutesAgo * MIN_MS;
    return {
      uuid: `demo-local-call-${index + 1}`,
      start_stamp: new Date(startedAt).toISOString(),
      end_stamp: new Date(startedAt + row.durationSec * 1000).toISOString(),
      caller_id_number: from.extension,
      from_name: `${from.first_name} ${from.last_name}`,
      destination_number: to.extension,
      to_name: `${to.first_name} ${to.last_name}`,
      to_display_name: `${to.first_name} ${to.last_name}`,
      direction: 'Internal',
      status: 'ANSWERED',
      /* `billsectotal`/`waitsec` are what the two duration columns actually
         read; `billsec` is only their fallback and has to stay a sliceable
         string there (`"HH:MM:SS".slice(3)`), not the number every other
         report page uses it as — this page is the one exception. */
      billsec: new Date(row.durationSec * 1000).toISOString().slice(11, 19),
      billsectotal: row.durationSec,
      waitsec: 2,
      duration: row.durationSec,
      durationtotal: row.durationSec,
    };
  });
};

/** `/api/campaign/dnc/list` — numbers a campaign must never dial. */
export const demoDncRows = () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const seed = [
    { name: 'Yash Oberoi', daysAgo: 40 },
    { name: 'Nikita Bhat', daysAgo: 18 },
    { name: 'Suresh Iyengar', daysAgo: 5 },
  ];
  return seed.map((row, index) => ({
    uuid: `demo-dnc-${index + 1}`,
    name: row.name,
    phone: fakeCaller(600 + index),
    email: `${row.name.split(' ')[0].toLowerCase()}@example.com`,
    createdAt: new Date(now - row.daysAgo * DAY_MS).toISOString(),
  }));
};

/** `/api/tenant/user/template/list` — Admin ▸ Templates ▸ User Settings, the
 *  named presets an admin applies when creating or editing someone. Deliberately
 *  does not include a "Company Default" row: that reserved name is company-wide
 *  policy (see company-policy.ts), and its absence is the documented, correct
 *  "nothing configured yet" state — inventing one would silently lock settings
 *  no admin actually chose to lock. */
export const demoTemplateRows = () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const seed = [
    { name: 'Sales Team Defaults', daysAgo: 60 },
    { name: 'Support Agent Defaults', daysAgo: 45 },
  ];
  return seed.map((row, index) => ({
    uuid: `demo-template-${index + 1}`,
    name: row.name,
    settings: JSON.stringify({}),
    greetings: JSON.stringify({}),
    created_at: new Date(now - row.daysAgo * DAY_MS).toISOString(),
    updated_at: new Date(now - (row.daysAgo - 3) * DAY_MS).toISOString(),
  }));
};

/* Matches `DEMO_USER.uuid` in demo-mode.ts. Not imported from there —
   demo-mode.ts already imports this module, and the reverse import would be
   circular — so the id is repeated here rather than shared. */
const DEMO_USER_UUID = 'demo-user-0000-0000-0000-000000000001';

/** Activity ▸ Chat's `allChats` — arrives over the socket, which demo mode has
 *  no server for, so like presence and in-progress calls this seeds the
 *  socket context's initial state instead. A handful of real direct threads
 *  with the roster Chat already lists as "available", each with a last
 *  message, so the list shows real conversations rather than every colleague
 *  reading "Click to start a new chat". Full message history inside an
 *  opened thread is a live `socket.emit(GET_CHAT_MESSAGES, ...)` round trip
 *  this doesn't answer — demo mode has no server on the other end of that
 *  socket at all, so opening one of these still comes back empty. */
export const demoChatThreads = () => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const me = { uuid: DEMO_USER_UUID, first_name: 'Arjun', last_name: 'Mehta' };
  const seed = [
    { extension: '1004', hoursAgo: 1, message: 'Can you take the Sales queue for the next hour?' },
    { extension: '1006', hoursAgo: 4, message: 'Sent over the Retention numbers from this morning.' },
    { extension: '1003', hoursAgo: 26, message: 'Approved your leave request for next week.' },
  ];
  return seed.map((row, index) => {
    const other = DEMO_AGENTS.find((agent) => agent.extension === row.extension) as DemoAgent;
    const createdAt = new Date(now - row.hoursAgo * HOUR_MS).toISOString();
    return {
      chatId: `demo-chat-${index + 1}`,
      isGroupChat: false,
      groupType: 'DM',
      users: [
        me,
        {
          uuid: other.uuid,
          first_name: other.first_name,
          last_name: other.last_name,
          extension: other.extension,
        },
      ],
      lastMessage: {
        message: row.message,
        createdAt,
        senderId: other.uuid,
      },
      createdAt,
      favoriteChats: [],
      isHidden: [],
      isDeleted: false,
    };
  });
};

/** `/api/tenant/report/agents` — matched back to the roster by name. */
export const demoAgentReportRows = () =>
  DEMO_AGENTS.map((row) => {
    const handled = demoCalls().filter((call) => call.extension === row.extension);
    const answered = handled.filter((call) => call.billsectotal > 0);
    const talkSeconds = answered.reduce((sum, call) => sum + call.billsectotal, 0);
    return {
      uuid: row.uuid,
      first_name: row.first_name,
      last_name: row.last_name,
      extension: row.extension,
      stats: {
        answered_calls: answered.length,
        missed_calls: handled.length - answered.length,
        total_calls: handled.length,
        incoming_calls: handled.filter((call) => call.direction === 'Inbound').length,
        outgoing_calls: handled.filter((call) => call.direction === 'Outbound').length,
        time_on_calls_minutes: Math.round(talkSeconds / 60),
      },
    };
  });

/** `/api/tenant/report/call-queue/list` — the per-queue REST report. */
export const demoQueueReportRows = () =>
  DEMO_QUEUES.map((queue) => {
    const handled = demoCalls().filter((call) => call.forward_value === queue.uuid);
    const answered = handled.filter((call) => call.billsectotal > 0);
    const waitTotal = handled.reduce((sum, call) => sum + (call.duration - call.billsectotal), 0);
    return {
      uuid: queue.uuid,
      name: queue.name,
      queue_stats: {
        answered_calls: answered.length,
        missed_calls: handled.length - answered.length,
        total_calls: handled.length,
        avg_waiting_time: handled.length ? Math.round(waitTotal / handled.length) : 0,
      },
    };
  });

/** `/api/call-queue/list` — members are stored as a JSON string on the platform. */
export const demoQueueRows = () =>
  DEMO_QUEUES.map((queue, index) => ({
    uuid: queue.uuid,
    name: queue.name,
    extension: String(9001 + index),
    strategy: 'ring-all',
    status: 1,
    members: JSON.stringify(
      queue.memberExtensions.map((extension) => {
        const member = DEMO_AGENTS.find((row) => row.extension === extension) as DemoAgent;
        return {
          uuid: member.uuid,
          user_uuid: member.uuid,
          extension: member.extension,
          name: `${member.first_name} ${member.last_name}`,
        };
      }),
    ),
  }));

/** `/api/site/list` — Directory ▸ Locations and Company Info's own site list.
 *  Same two cities the agents and IVR flows already carry, so a "Mumbai HQ"
 *  named elsewhere resolves to a real site here rather than a label nothing
 *  backs up. */
export const demoSiteRows = () => [
  {
    uuid: 'demo-site-mumbai',
    name: 'Mumbai HQ',
    address: '14th Floor, Bandra Kurla Complex',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'IN',
    postal_code: '400051',
    timezone: 'Asia/Kolkata',
    is_default: 'Y',
  },
  {
    uuid: 'demo-site-bengaluru',
    name: 'Bengaluru',
    address: '2nd Block, Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'IN',
    postal_code: '560034',
    timezone: 'Asia/Kolkata',
    is_default: 'N',
  },
];

/** `/api/tenant/ivr/list` — `site` arrives as a JSON string on the platform. */
export const demoFlowRows = () =>
  DEMO_FLOWS.map((flow) => ({
    uuid: flow.uuid,
    name: flow.name,
    extension: flow.extension,
    site: JSON.stringify({ label: flow.site, value: flow.site.toLowerCase() }),
    status: 1,
  }));

/** `/api/fax/did/number/assigned` and `DEMO_USER.assigned_did` — the numbers
 *  Inbox's "Your number" / fax-number pickers offer, and what the admin
 *  Numbers list shows as owned by the tenant. */
export const demoAssignedDidRows = () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const seed = [
    { did: DIDS[0], name: 'Sales Line', type: 'toll_free', site: 'Mumbai HQ', daysAgo: 210 },
    { did: DIDS[1], name: 'Support Line', type: 'toll_free', site: 'Mumbai HQ', daysAgo: 180 },
    { did: DIDS[2], name: 'Bengaluru Office', type: 'local', site: 'Bengaluru', daysAgo: 95 },
  ];
  return seed.map((row, index) => ({
    uuid: `demo-did-${index + 1}`,
    did_number: row.did,
    phone_number: row.did,
    did_name: row.name,
    did_type: row.type,
    user_details: null,
    site_data: { name: row.site },
    Site: { name: row.site },
    type: row.site,
    features: ['voice', 'sms', 'fax'],
    buy_date: new Date(now - row.daysAgo * DAY_MS).toISOString(),
  }));
};

/* `DEMO_USER.uuid` in demo-mode.ts — duplicated as a literal rather than
   imported, since demo-mode.ts already imports from this module and an
   import the other way would cycle. Outbound SMS messages are attributed to
   this uuid so Inbox's "is this message mine" check reads correctly. */
const DEMO_ACCOUNT_UUID = 'demo-user-0000-0000-0000-000000000001';

/** `/api/v1/sms/did-list` — Inbox's conversation list for the selected number. */
export const demoSmsConversations = () => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const seed = [
    {
      name: 'Rahul Deshmukh',
      lastMessage: 'Thanks, that resolved it!',
      hoursAgo: 2,
      inbound: true,
    },
    {
      name: 'Sneha Joshi',
      lastMessage: 'Can you resend the invoice for this month?',
      hoursAgo: 7,
      inbound: true,
    },
    {
      name: 'Aditya Kumar',
      lastMessage: 'Sounds good, talk then.',
      hoursAgo: 27,
      inbound: false,
    },
  ];
  return seed.map((row, index) => {
    const phone = fakeCaller(400 + index);
    return {
      _id: `demo-chat-${index + 1}`,
      chatId: `demo-chat-${index + 1}`,
      from: row.inbound ? phone : DIDS[0],
      to: row.inbound ? DIDS[0] : phone,
      name: row.name,
      toContactName: row.name,
      phone,
      contactPic: null,
      metaData: {
        direction: row.inbound ? 'inbound' : 'outbound',
        lastMessage: row.lastMessage,
        timestamp: new Date(now - row.hoursAgo * HOUR_MS).toISOString(),
        messageMimeType: 'sms',
      },
    };
  });
};

/** `/api/v1/sms/list` — the open conversation's messages, keyed by chat_id. */
export const demoSmsThreadRows = (chatId: string) => {
  const conversation = demoSmsConversations().find((row) => row.chatId === chatId);
  if (!conversation) return [];

  const now = Date.now();
  const MIN_MS = 60 * 1000;
  const script = [
    { fromMe: false, minutesAgo: 130, text: `Hi, I need help with my account.` },
    { fromMe: true, minutesAgo: 125, text: `Hi ${conversation.name.split(' ')[0]}, happy to help — what's going on?` },
    { fromMe: false, minutesAgo: 118, text: conversation.metaData.lastMessage },
    { fromMe: true, minutesAgo: 110, text: `On it — give me a moment.` },
  ];

  return script.map((row, index) => ({
    _id: `${conversation.chatId}-msg-${index + 1}`,
    chatId: conversation.chatId,
    senderId: row.fromMe ? DEMO_ACCOUNT_UUID : `demo-contact-${conversation.chatId}`,
    message: row.text,
    messageMimeType: 'sms',
    dlrStatus: row.fromMe ? 'delivered' : 'received',
    createdAt: new Date(now - row.minutesAgo * MIN_MS).toISOString(),
  }));
};

/** `/api/tenant/department/list` — Directory ▸ Groups and Admin ▸ Departments. */
export const demoDepartmentRows = () => {
  const seed = [
    { name: 'Sales Team', extension: '7001', memberExtensions: ['1004', '1005', '1006'], managerExt: '1003' },
    { name: 'Customer Support', extension: '7002', memberExtensions: ['1004', '1006', '1007', '1008'], managerExt: '1003' },
    { name: 'Finance & Billing', extension: '7003', memberExtensions: ['1002', '1007'], managerExt: '1002' },
    { name: 'Engineering', extension: '7004', memberExtensions: ['1006', '1008'], managerExt: '1001' },
  ];
  return seed.map((dept, index) => {
    const manager = DEMO_AGENTS.find((row) => row.extension === dept.managerExt) as DemoAgent;
    return {
      uuid: `demo-dept-${index + 1}`,
      name: dept.name,
      extension: dept.extension,
      manager: JSON.stringify({
        first_name: manager.first_name,
        last_name: manager.last_name,
        name: `${manager.first_name} ${manager.last_name}`,
      }),
      members: JSON.stringify(
        dept.memberExtensions.map((extension) => {
          const member = DEMO_AGENTS.find((row) => row.extension === extension) as DemoAgent;
          return {
            uuid: member.uuid,
            user_uuid: member.uuid,
            extension: member.extension,
            name: `${member.first_name} ${member.last_name}`,
          };
        }),
      ),
    };
  });
};

/** `/api/v1/meeting/listing` — Video ▸ Upcoming meetings. */
export const demoMeetingRows = () => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const seed = [
    { name: 'Q3 Renewals — Sync', hostExt: '1001', daysFromNow: 1, hour: 11, durationHrs: 1 },
    { name: 'Support Escalation Review', hostExt: '1003', daysFromNow: 2, hour: 15, durationHrs: 1 },
    { name: 'Bengaluru Team Standup', hostExt: '1006', daysFromNow: 3, hour: 9.5, durationHrs: 0.5 },
  ];
  return seed.map((row, index) => {
    const host = DEMO_AGENTS.find((agent) => agent.extension === row.hostExt) as DemoAgent;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const startAt = start.getTime() + row.daysFromNow * 24 * HOUR_MS + row.hour * HOUR_MS;
    const endAt = startAt + row.durationHrs * HOUR_MS;
    const members = DEMO_AGENTS.filter((agent) => agent.extension !== row.hostExt)
      .slice(0, 3)
      .map((agent) => ({
        type: 'MEMBER',
        invited: true,
        name: `${agent.first_name} ${agent.last_name}`,
        extension: agent.extension,
      }));
    return {
      meetingId: `demo-meeting-${index + 1}`,
      name: row.name,
      hostName: `${host.first_name} ${host.last_name}`,
      createdById: host.uuid,
      mode: 'scheduled',
      status: 'upcoming',
      timezone: 'Asia/Kolkata',
      startUtc: new Date(startAt).toISOString(),
      startTimeLocal: new Date(startAt).toISOString(),
      endTimeLocal: new Date(endAt).toISOString(),
      members,
    };
  });
};

export const demoCampaignRows = () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  return DEMO_CAMPAIGN_SEED.map((campaign) => {
    const pending = Math.max(
      0,
      campaign.assignedLeads -
        campaign.answeredLeads -
        campaign.totalCallNotAnswered -
        campaign.totalDnc,
    );
    const startDate = new Date(now - campaign.daysAgoStarted * DAY_MS);
    const endDate = new Date(startDate.getTime() + campaign.daySpan * DAY_MS);
    const createdAt = new Date(startDate.getTime() - DAY_MS);

    return {
      _id: campaign.uuid,
      uuid: campaign.uuid,
      name: campaign.name,
      campaign_name: campaign.name,
      campaignStatus: campaign.campaignStatus,
      status: campaign.campaignStatus,
      dialMethod: campaign.dialMethod,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      createdAt: createdAt.toISOString(),
      campaignAnalytics: {
        assignedLeads: campaign.assignedLeads,
        dialedLeads: campaign.answeredLeads + campaign.totalCallNotAnswered + campaign.totalDnc,
        answeredLeads: campaign.answeredLeads,
        totalCallNotAnswered: campaign.totalCallNotAnswered,
        totalDnc: campaign.totalDnc,
        pendingLeads: pending,
      },
      members: JSON.stringify(
        campaign.memberExtensions.map((extension) => {
          const member = DEMO_AGENTS.find((row) => row.extension === extension) as DemoAgent;
          return {
            user_uuid: member.uuid,
            extension: member.extension,
            first_name: member.first_name,
            last_name: member.last_name,
            name: `${member.first_name} ${member.last_name}`,
          };
        }),
      ),
    };
  });
};

/* ---------------------------------------------------------------------------
   The live half — presence and in-progress calls.

   These arrive over the socket rather than over HTTP, so demo mode cannot
   answer them the way it answers a request; they seed the socket context's
   initial state instead. That is also why they are built relative to "now":
   the Longest wait timer has to have something to count up from.
--------------------------------------------------------------------------- */

const OFFLINE_EXTENSIONS = ['1003'];
const DND_EXTENSIONS = ['1002'];
const ON_CALL_EXTENSIONS = ['1004', '1006', '1007'];

export const demoUsersOnlineStatus = () =>
  DEMO_AGENTS.map((row) => ({
    userId: row.extension,
    user_uuid: row.uuid,
    extension: row.extension,
    online: !OFFLINE_EXTENSIONS.includes(row.extension),
    status: DND_EXTENSIONS.includes(row.extension) ? 'dnd' : 'available',
    onCall: ON_CALL_EXTENSIONS.includes(row.extension),
  }));

/** In-progress calls: three agents talking, two callers still waiting. */
export const demoLiveCalls = () => {
  const now = Date.now();
  /* The monitoring helpers read epoch seconds as readily as milliseconds. */
  const startedSecondsAgo = (value: number) => Math.round(now / 1000) - value;

  const talking = [
    { extension: '1004', queue: 'demo-queue-support', since: 214, caller: fakeCaller(101) },
    { extension: '1006', queue: 'demo-queue-sales', since: 96, caller: fakeCaller(102) },
    { extension: '1007', queue: 'demo-queue-billing', since: 431, caller: fakeCaller(103) },
  ];

  const waiting = [
    { queue: 'demo-queue-retention', since: 148, caller: fakeCaller(104) },
    { queue: 'demo-queue-support', since: 37, caller: fakeCaller(105) },
  ];

  return [
    ...talking.map((call, index) => ({
      uuid: `demo-live-answered-${index + 1}`,
      call_id: `demo-live-answered-${index + 1}`,
      status: 'answered',
      direction: 'inbound',
      forward_type: 'QUEUE',
      forward_value: call.queue,
      queue_uuid: call.queue,
      agent_extension: call.extension,
      called_number: call.extension,
      caller_number: call.caller,
      caller_id_number: call.caller,
      contact_name: CONTACT_NAMES[index],
      did_number: DIDS[index % DIDS.length],
      start_time: startedSecondsAgo(call.since),
      answered_time: startedSecondsAgo(call.since),
    })),
    ...waiting.map((call, index) => ({
      uuid: `demo-live-waiting-${index + 1}`,
      call_id: `demo-live-waiting-${index + 1}`,
      status: 'waiting',
      direction: 'inbound',
      forward_type: 'QUEUE',
      forward_value: call.queue,
      queue_uuid: call.queue,
      caller_number: call.caller,
      caller_id_number: call.caller,
      contact_name: CONTACT_NAMES[index + 5],
      did_number: DIDS[index % DIDS.length],
      start_time: startedSecondsAgo(call.since),
    })),
  ];
};

/** The per-queue live snapshot: SLA, today's volume and who is free. */
export const demoLiveQueueCalls = () => {
  const report = demoQueueReportRows();
  const presence = demoUsersOnlineStatus();

  return DEMO_QUEUES.map((queue) => {
    const stats = report.find((row) => row.uuid === queue.uuid)?.queue_stats;
    const available = queue.memberExtensions.filter((extension) =>
      presence.some((row) => row.userId === extension && row.online && !row.onCall),
    ).length;
    return {
      uuid: queue.uuid,
      name: queue.name,
      sla_within_20_sec_percent: queue.sla,
      total_calls: stats?.total_calls ?? 0,
      avg_wait_time_sec: stats?.avg_waiting_time ?? 0,
      available_count: available,
    };
  });
};

/* ---------------------------------------------------------------------------
   AI receptionist / sentiment — Performance ▸ Speech & Text and the Boards
   "AI Containment" tile.

   Both arrive over a socket round-trip (`MAIN_AI_LIVE_WALLBOARD` /
   `DASH_CAMPAIGN_AI_LIVE_CALL_RESPONSE`) that demo mode's socket has no
   server behind, so these seed the socket context's initial state instead —
   same reasoning as the live-call data above.
--------------------------------------------------------------------------- */

export const demoCampaignAiLiveCallData = () => ({
  data: {
    result: {
      avg_sentiment: 18.4,
      total_ai_calls: 46,
      ai_containment_percent: 64,
      total_ai_chats: 58,
      transferred_calls: 17,
      ai_receptionist_performance: {
        handled_ai_only: 29,
        avg_duration_sec: 96,
        lead_captured_counts: 14,
      },
      voice_vs_text_interactions: { voice_percent: 62, text_percent: 38 },
      sentiment_buckets: [
        { label: 'Positive', count: 31, percent: 55 },
        { label: 'Neutral', count: 18, percent: 32 },
        { label: 'Negative', count: 7, percent: 13 },
      ],
      intent_count: {
        billing: 19,
        support: 24,
        sales: 13,
        onboarding: 8,
        retention: 5,
      },
    },
  },
});

export const demoAiLiveWallboardData = () => ({
  data: {
    result: {
      agents: [
        {
          agent_name: 'Priya Sharma',
          today_sentiment_calls: 14,
          avg_sentiment: 22.5,
          sentiment_counts: { negative_percent: 7 },
        },
        {
          agent_name: 'Karan Malhotra',
          today_sentiment_calls: 11,
          avg_sentiment: 9.2,
          sentiment_counts: { negative_percent: 18 },
        },
        {
          agent_name: 'Ananya Iyer',
          today_sentiment_calls: 9,
          avg_sentiment: -4.5,
          sentiment_counts: { negative_percent: 31 },
        },
        {
          agent_name: 'Vikram Reddy',
          today_sentiment_calls: 12,
          avg_sentiment: 15.8,
          sentiment_counts: { negative_percent: 12 },
        },
      ],
    },
  },
});

/** `/api/v1/sms/logs` — Performance ▸ Reports ▸ "Media type". */
export const demoSmsLogRows = () => {
  const now = Date.now();
  const MINUTE_MS = 60 * 1000;
  const seed = [
    { minutesAgo: 40, direction: 'inbound', body: 'What are your support hours today?' },
    { minutesAgo: 65, direction: 'outbound', body: 'We are open 9 AM to 9 PM IST, Mon-Sat.' },
    { minutesAgo: 130, direction: 'inbound', body: 'Please share the invoice for this month.' },
    { minutesAgo: 150, direction: 'outbound', body: 'Invoice sent to your registered email.' },
    { minutesAgo: 260, direction: 'inbound', body: 'Can I reschedule tomorrow’s callback?' },
    { minutesAgo: 300, direction: 'outbound', body: 'Sure, moved to 4 PM IST. Confirmed?' },
    { minutesAgo: 420, direction: 'inbound', body: 'Yes that works, thank you.' },
    { minutesAgo: 600, direction: 'outbound', body: 'Reminder: your renewal is due in 5 days.' },
    { minutesAgo: 720, direction: 'inbound', body: 'Is there a discount for annual billing?' },
    { minutesAgo: 740, direction: 'outbound', body: '10% off on annual plans, applied at checkout.' },
  ];
  return seed.map((row, index) => {
    const sentAt = new Date(now - row.minutesAgo * MINUTE_MS).toISOString();
    return {
      uuid: `demo-sms-${index + 1}`,
      direction: row.direction,
      from: row.direction === 'inbound' ? fakeCaller(200 + index) : DIDS[index % DIDS.length],
      to: row.direction === 'inbound' ? DIDS[index % DIDS.length] : fakeCaller(200 + index),
      message: row.body,
      messageCost: 0.045,
      created_at: sentAt,
      start_stamp: sentAt,
    };
  });
};

/** `/api/contact/group/list` — Performance ▸ Reports ▸ "Contact lists". */
export const demoContactGroupRows = () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  return [
    {
      uuid: 'demo-group-diwali',
      groupName: 'Diwali Offer Leads',
      leadCount: 420,
      generatedBy: 'Arjun Mehta',
      createdAt: new Date(now - 18 * DAY_MS).toISOString(),
    },
    {
      uuid: 'demo-group-renewal',
      groupName: 'Mumbai Renewal List',
      leadCount: 230,
      generatedBy: 'Meera Nair',
      createdAt: new Date(now - 9 * DAY_MS).toISOString(),
    },
    {
      uuid: 'demo-group-webinar',
      groupName: 'Webinar Signups - Aug',
      leadCount: 96,
      generatedBy: 'Priya Sharma',
      createdAt: new Date(now - 4 * DAY_MS).toISOString(),
    },
    {
      uuid: 'demo-group-bangalore',
      groupName: 'Bengaluru Enterprise Leads',
      leadCount: 158,
      generatedBy: 'Sanjay Kapoor',
      createdAt: new Date(now - 26 * DAY_MS).toISOString(),
    },
  ];
};

/** `/api/calendar/event-task/list` — Performance ▸ Callbacks ▸ "Scheduled tasks". */
export const demoCalendarTaskRows = () => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const seed = [
    { name: 'Callback - Rahul Deshmukh (Sales)', dueInHours: -3, source: 'Queue', status: 'PENDING' },
    { name: 'Follow up - Sneha Joshi (Billing)', dueInHours: 4, source: 'Manual', status: 'PENDING' },
    { name: 'Renewal call - Aditya Kumar', dueInHours: -18, source: 'Campaign', status: 'PENDING' },
    { name: 'Callback - Pooja Bansal (Support)', dueInHours: 9, source: 'Queue', status: 'PENDING' },
    { name: 'Demo follow-up - Rohan Chatterjee', dueInHours: 26, source: 'Manual', status: 'PENDING' },
    { name: 'Callback - Kavya Pillai (Onboarding)', dueInHours: 48, source: 'Queue', status: 'PENDING' },
  ];
  return seed.map((task, index) => ({
    uuid: `demo-task-${index + 1}`,
    name: task.name,
    source: task.source,
    status: task.status,
    createdAt: new Date(now - (Math.abs(task.dueInHours) + 20) * HOUR_MS).toISOString(),
    startTime: new Date(now + task.dueInHours * HOUR_MS).toISOString(),
  }));
};

/** `/api/tenant/report/call-list` with `type: 'voicemail'` — Callbacks ▸ "Queue voicemail". */
export const demoVoicemailRows = () => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const seed = [
    { hoursAgo: 1.5, lengthSec: 38 },
    { hoursAgo: 5, lengthSec: 52 },
    { hoursAgo: 22, lengthSec: 21 },
    { hoursAgo: 30, lengthSec: 67 },
  ];
  return seed.map((row, index) => ({
    uuid: `demo-vm-${index + 1}`,
    start_stamp: new Date(now - row.hoursAgo * HOUR_MS).toISOString(),
    caller_id_number: fakeCaller(300 + index),
    via_did: DIDS[index % DIDS.length],
    billsectotal: row.lengthSec,
    billsec: row.lengthSec,
    is_voicemail: 1,
    recording_file: `demo-voicemail-${index + 1}.mp3`,
  }));
};
