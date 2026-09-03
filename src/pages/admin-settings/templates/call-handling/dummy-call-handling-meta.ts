/* Demo-only dressing for the Call Handling Templates page's expandable-row
 * preview and its insights panel — an activity timeline per template, and a
 * "Call Queue Trends" series for the sidebar. Neither is backed by anything
 * real: this app has no audit log (no table anywhere records who changed
 * what on a template) and no per-queue call-volume time series wired to
 * Call Handling at all. Everything else this page shows (the Status column,
 * the Applied To count, Frequent Fields Usage) is computed from real
 * template/number data — only this file's two exports are invented, and
 * only ever rendered from index.tsx when isDemoMode() is true, same as
 * every other demo-only file in this app.
 *
 * Deterministic, not random, for the same reason as every other demo
 * generator here: hash the template's own uuid/name so the same template
 * always shows the same timeline rather than reshuffling on every render.
 */

const DEMO_ACTORS = ['Amy Fernandes', 'Andra Kulkarni', 'Joshan Mehta', 'Janna Rao'];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export interface ActivityEvent {
  actor: string;
  text: string;
  hoursAgo: number;
}

/** A short, plausible-looking change history for one template. Always
 *  starts with "created" and ends with the most recent edit, so the two
 *  bookends line up with the template's own created_at/updated_at rather
 *  than contradicting them. */
export const getTemplateActivityTimeline = (template: any): ActivityEvent[] => {
  const seed = hashString(String(template?.uuid || template?.name || ''));
  const actor = DEMO_ACTORS[seed % DEMO_ACTORS.length];
  const secondActor = DEMO_ACTORS[(seed + 1) % DEMO_ACTORS.length];

  const FIELD_CHANGES = [
    'changed Business Hours from 9:00 to 9:30',
    'updated the closed-hours voicemail greeting',
    'turned on call recording',
    'changed the hold music track',
    'updated the welcome greeting',
  ];
  const fieldChange = FIELD_CHANGES[seed % FIELD_CHANGES.length];

  return [
    { actor, text: 'created this template', hoursAgo: 96 + (seed % 48) },
    { actor: secondActor, text: fieldChange, hoursAgo: 24 + (seed % 24) },
    { actor, text: 'updated this template', hoursAgo: 1 + (seed % 12) },
  ];
};

/** Every template's timeline, flattened and sorted, for the "Recent System
 *  Events" card on the insights panel — the same events the expandable row
 *  already shows, just pooled across all templates in one feed. */
export const getRecentSystemEvents = (
  templates: any[],
): (ActivityEvent & { templateName: string })[] =>
  templates
    .flatMap((template) =>
      getTemplateActivityTimeline(template).map((event) => ({
        ...event,
        templateName: template?.name || 'Untitled',
      })),
    )
    .sort((a, b) => a.hoursAgo - b.hoursAgo)
    .slice(0, 6);

/** Six weeks of made-up per-queue call volume, for the "Call Queue Trends"
 *  chart — there is no real per-queue time series wired to Call Handling
 *  templates at all, so this is invented outright rather than derived. */
export const buildDummyQueueTrends = (): { label: string; calls: number }[] => {
  const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
  return weeks.map((label, index) => {
    const wave = Math.sin((index + 1) * 0.9) * 0.5 + 0.5;
    return { label, calls: Math.max(8, Math.round(40 + wave * 60)) };
  });
};
