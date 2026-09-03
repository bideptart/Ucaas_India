/* Tags, status, author and usage numbers for the User Settings Templates
 * list — none of these exist on the real template record (see
 * src/lib/user-settings-template-form.ts: a template is only ever
 * name/settings/greetings/uuid). Demo-only, gated by isDemoMode() the same
 * way the notification drawer's sample data is, so this never shows up
 * anywhere but a preview host — see src/lib/demo-mode.ts.
 *
 * Deterministic, not random: the same template always gets the same tags,
 * status and author, derived from its own uuid/name rather than
 * Math.random(). A demo screen that reshuffles itself on every re-render
 * reads as broken, not as a feature.
 */

export interface DummyAuthor {
  name: string;
  initials: string;
  colour: string;
}

export type DummyTemplateStatus = 'Active' | 'Archived' | 'Pending' | 'Draft';

const DEMO_TAGS = ['Sales Team', 'Onboarding', 'Support', 'Admin'] as const;

/** Who a template is visible to. Same demo-only status as tags/status/author
 *  below — nothing in the real record has an audience. */
export const DEMO_ACCESS = ['Admin Only', 'Team View', 'Company Wide'] as const;

/* Colours drawn from the app's own shared theme tokens (mcm-page.css's
   --live/--live-wash, --accent-ink/--accent-wash, --warn), the same ones
   Directory ▸ People's own badges use — not a separate palette invented
   for this page, which is what made these badges look off-theme next to
   the rest of the admin UI. */
const ACCESS_COLOURS: Record<string, { bg: string; text: string }> = {
  'Admin Only': { bg: '#fff1e0', text: '#c96f1f' },
  'Team View': { bg: '#dcf5f1', text: '#0d9488' },
  'Company Wide': { bg: 'rgba(150, 100, 50, 0.1)', text: '#8a6f57' },
};

export const getAccessColours = (access: string) =>
  ACCESS_COLOURS[access] || { bg: '#fff1e0', text: '#c96f1f' };

const STATUS_COLOURS: Record<DummyTemplateStatus, { bg: string; text: string }> = {
  Active: { bg: '#dcf5f1', text: '#0d9488' },
  Archived: { bg: 'rgba(150, 100, 50, 0.1)', text: '#8a6f57' },
  Pending: { bg: '#fff1e0', text: '#c2670a' },
  Draft: { bg: 'rgba(150, 100, 50, 0.06)', text: '#8a6f57' },
};

export const getStatusColours = (status: DummyTemplateStatus) => STATUS_COLOURS[status];

const DEMO_AUTHORS: DummyAuthor[] = [
  { name: 'Amy Fernandes', initials: 'AF', colour: '#ea6b42' },
  { name: 'Andra Kulkarni', initials: 'AK', colour: '#b5502f' },
  { name: 'Joshan Mehta', initials: 'JM', colour: '#e8965f' },
  { name: 'Janna Rao', initials: 'JR', colour: '#c97a4a' },
];

const TAG_COLOURS: Record<string, { bg: string; text: string }> = {
  'Sales Team': { bg: '#fff1e0', text: '#c96f1f' },
  Onboarding: { bg: '#dcf5f1', text: '#0d9488' },
  Support: { bg: '#ffd9ad', text: '#c96f1f' },
  Admin: { bg: 'rgba(150, 100, 50, 0.1)', text: '#8a6f57' },
};

export const getTagColours = (tag: string) => TAG_COLOURS[tag] || { bg: '#fff1e0', text: '#c96f1f' };

/** Turns a string into a small positive int, stable across renders and reloads. */
const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

/* Status is the one piece of this an admin can actually change in the demo,
 * so — same reasoning as the notification drawer's read/unread store — it
 * lives at module scope rather than component state, to survive this
 * drawer closing and reopening. Not persisted past a page reload; there is
 * nowhere real to persist it to. Keyed by uuid, one explicit status per
 * override — picking a status from the row's own dropdown replaces
 * whichever one was set before, rather than layering flags the way a
 * binary archive/unarchive toggle used to. */
let dummyStatusOverrides = new Map<string, DummyTemplateStatus>();

/** The status a row actually shows, once a manual change from its own
 *  dropdown is layered on top of its base roll. */
export const getDummyTemplateStatus = (
  uuid: string,
  baseStatus: DummyTemplateStatus,
): DummyTemplateStatus => dummyStatusOverrides.get(uuid) ?? baseStatus;

export const setDummyTemplateStatus = (uuid: string, status: DummyTemplateStatus) => {
  const next = new Map(dummyStatusOverrides);
  next.set(uuid, status);
  dummyStatusOverrides = next;
};

export interface DummyTemplateMeta {
  tags: string[];
  baseStatus: DummyTemplateStatus;
  access: (typeof DEMO_ACCESS)[number];
  author: DummyAuthor;
  /** How many people this template is shown as applied to, for the usage chart. */
  profileCount: number;
}

/** The template's own uuid/name decide everything below — same input, same output. */
export const getDummyTemplateMeta = (template: any): DummyTemplateMeta => {
  const seed = hashString(String(template?.uuid || template?.name || ''));

  const tagCount = 1 + (seed % 2);
  const tags = Array.from(
    new Set(
      Array.from({ length: tagCount }, (_, i) => DEMO_TAGS[(seed + i * 7) % DEMO_TAGS.length]),
    ),
  );

  /* Out of 15 rolls: 3 Archived, 2 Pending, 1 Draft, 9 Active — Draft is
     rarest since it stands for a template nobody finished setting up. */
  const statusRoll = seed % 15;
  const baseStatus: DummyTemplateStatus =
    statusRoll < 3 ? 'Archived' : statusRoll < 5 ? 'Pending' : statusRoll < 6 ? 'Draft' : 'Active';

  return {
    tags,
    baseStatus,
    access: DEMO_ACCESS[seed % DEMO_ACCESS.length],
    author: DEMO_AUTHORS[seed % DEMO_AUTHORS.length],
    profileCount: 2 + (seed % 14),
  };
};

export const DUMMY_FILTER_TAGS = DEMO_TAGS;
export const DUMMY_FILTER_AUTHORS = DEMO_AUTHORS.map((author) => author.name);
export const DUMMY_FILTER_STATUSES: DummyTemplateStatus[] = ['Active', 'Archived', 'Pending', 'Draft'];
export const DUMMY_FILTER_ACCESS = DEMO_ACCESS;

/** Six months of made-up "profiles updated via a template" counts, for the usage chart. */
export const buildDummyUsageSeries = (templates: any[]): { label: string; count: number }[] => {
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const total = templates.reduce(
    (sum, template) => sum + getDummyTemplateMeta(template).profileCount,
    0,
  );
  return months.map((label, index) => {
    const wave = Math.sin((index + 1) * 1.1) * 0.5 + 0.5;
    return { label, count: Math.max(1, Math.round((total / months.length) * (0.6 + wave))) };
  });
};

/** How often each settings area shows up switched on, across all templates. */
export const buildDummyFrequentFields = (
  templates: any[],
): { label: string; count: number }[] => {
  const fields = ['Business Hours', 'Recording', 'Caller ID', 'Regional', 'Greetings'];
  return fields
    .map((label, index) => ({
      label,
      count: templates.reduce((sum, template) => {
        const seed = hashString(String(template?.uuid || template?.name || '') + label);
        return sum + (seed % 3 === index % 3 ? 1 : 0) + 1;
      }, 0),
    }))
    .sort((a, b) => b.count - a.count);
};
