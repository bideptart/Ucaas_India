/* A glance at the Call Handling Templates list — how many are actually in
 * use, which routing type shows up most, and (demo-only) recent activity
 * and queue call volume. Two of these four cards are real, computed from
 * the same template/number data the table itself reads:
 *
 *   Template Status Distribution — Applied vs Not applied, from the same
 *   usageCounts index.tsx already computes off numbers' `_templateSource`.
 *   Frequent Fields Usage — how often each business-hours routing type
 *   (Ring My Device, Send to Voicemail, ...) appears across templates.
 *
 * The other two are demo-only, same reasoning as
 * dummy-call-handling-meta.ts — there is no audit log and no per-queue
 * call-volume series wired to templates in this app.
 */

import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import Loader from '@/components/custom/loader';
import { FORWARD_TYPES_LABEL } from '@/pages/admin-settings/numbers/set-number-forwarding/constants';
import { asObject } from '@/lib/bulk-user-settings';
import { buildDummyQueueTrends, getRecentSystemEvents } from './dummy-call-handling-meta';

const ACCENT = 'var(--color-primary, #ea6b42)';

/* A section within the insights card, not a card of its own — the whole
   panel is one card (rounded-[20px], border, shadow, below); stacking a
   smaller rounded/bordered box for every metric inside that would nest
   rounded containers into each other for no reason. A bottom divider does
   the same job of separating sections without another border box. */
const PanelCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-b border-[#f5e6d3] pb-4 last:border-0 last:pb-0">
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#b5502f]">{title}</p>
    {children}
  </div>
);

const STATUS_COLOURS = { Applied: '#0d9488', 'Not applied': '#8a6f57' };
const INSIGHTS_CARD_SHADOW = { boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(20,20,20,0.06))' };

const CallHandlingInsightsPanel = ({
  templates,
  usageCounts,
  loading,
}: {
  templates: any[];
  usageCounts: Record<string, number>;
  loading?: boolean;
}) => {
  if (loading) {
    return (
      <div
        className="w-[240px] shrink-0 h-full overflow-y-auto rounded-[20px] border border-[#efe2cf] bg-white p-5"
        style={INSIGHTS_CARD_SHADOW}
      >
        <Loader />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div
        className="w-[240px] shrink-0 h-full overflow-y-auto rounded-[20px] border border-[#efe2cf] bg-white p-5 text-xs text-gray-500"
        style={INSIGHTS_CARD_SHADOW}
      >
        Insights show up once there is at least one template.
      </div>
    );
  }

  const statusCounts = templates.reduce(
    (acc, template) => {
      if ((usageCounts[template?.uuid] || 0) > 0) acc.applied += 1;
      else acc.notApplied += 1;
      return acc;
    },
    { applied: 0, notApplied: 0 },
  );
  const statusData = [
    { name: 'Applied', value: statusCounts.applied, colour: STATUS_COLOURS.Applied },
    { name: 'Not applied', value: statusCounts.notApplied, colour: STATUS_COLOURS['Not applied'] },
  ].filter((slice) => slice.value > 0);

  const fieldCounts = templates.reduce((acc: Record<string, number>, template) => {
    const type = asObject(template?.forward_call_actions)?.call_handling?.business_hours?.type;
    const label = (type && FORWARD_TYPES_LABEL[type as keyof typeof FORWARD_TYPES_LABEL]) || 'Not set';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const frequentFields = Object.entries(fieldCounts)
    .map(([label, count]) => ({ label, count: count as number }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxFieldCount = Math.max(...frequentFields.map((field) => field.count), 1);

  const queueTrends = buildDummyQueueTrends();
  const recentEvents = getRecentSystemEvents(templates);

  return (
    <div
      className="templates-insights-panel w-[240px] shrink-0 h-full overflow-y-auto rounded-[20px] border border-[#efe2cf] bg-white flex flex-col gap-4 p-5"
      style={INSIGHTS_CARD_SHADOW}
    >
      <PanelCard title="Template Status Distribution">
        <div className="flex items-center gap-3">
          <div className="h-[90px] w-[90px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" innerRadius={26} outerRadius={40} paddingAngle={2}>
                  {statusData.map((slice) => (
                    <Cell key={slice.name} fill={slice.colour} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1">
            {statusData.map((slice) => (
              <div key={slice.name} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.colour }} />
                {slice.name} ({slice.value})
              </div>
            ))}
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Frequent Fields Usage">
        <div className="flex flex-col gap-2">
          {frequentFields.map((field) => (
            <div key={field.label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[11px] text-gray-600">{field.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full border border-[#f0d6b4] bg-[#fdeee0]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(8, (field.count / maxFieldCount) * 100)}%`,
                    backgroundColor: ACCENT,
                  }}
                />
              </div>
              <span className="w-4 shrink-0 text-right text-[11px] text-gray-500">{field.count}</span>
            </div>
          ))}
        </div>
      </PanelCard>

      <p className="text-[11px] font-semibold text-gray-400">
        Demo numbers below — not counted from real queue or activity data yet.
      </p>

      <PanelCard title="Call Queue Trends">
        <div className="h-[90px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={queueTrends} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="queueTrendsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
                formatter={(value) => [`${value} calls`, 'Queue volume']}
              />
              <Area type="monotone" dataKey="calls" stroke={ACCENT} strokeWidth={2} fill="url(#queueTrendsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>

      <PanelCard title="Recent System Events">
        <div className="flex flex-col gap-2">
          {recentEvents.map((event, index) => (
            <div key={index} className="text-[11px] text-gray-600">
              <span className="font-semibold text-gray-800">{event.templateName}</span> — {event.actor}{' '}
              {event.text}
              <span className="text-gray-400"> · {event.hoursAgo}h ago</span>
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  );
};

export default CallHandlingInsightsPanel;
