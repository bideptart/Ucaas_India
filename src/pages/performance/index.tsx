import { useEffect, useMemo, useRef, useState } from 'react';
import { PhoneIncoming, AlarmClock, Info, TriangleAlert, RotateCw } from 'lucide-react';
import moment from 'moment';
import './live-theme.css';
import { useSearchParamManager } from '@/hooks/use-search-params';
import DateDropdown, { type DateDropdownHandle } from '@/components/custom/date-dropdown';
import { DateFilterTypes, handleDate } from '@/components/custom/date-dropdown/constant';
import Timer from '@/components/timer';
import { useLiveContactCentre } from '@/hooks/use-live-contact-centre';
import { useCompanyFeatures } from '@/hooks/rbac';
import { isViewAllowedByPlan } from '@/components/custom/nav-areas';
import QueuesActivityTab from './queues-activity-tab';
import CampaignActivityTab from './campaign-activity-tab';
import AgentsTab from './agents-tab';
import FlowsTab from './flows-tab';
import InteractionsTab from './interactions-tab';
import DashboardsTab from './dashboards-tab';
import LiveInteractionsTab from './live-interactions-tab';
import CallbacksTab from './callbacks-tab';
import SpeechTextTab from './speech-text-tab';
import ReportsTab from './reports-tab';
import { formatSecsToClock } from './format';
import { useTrend } from './use-trend';
import HeroStatCard from './hero-stat-card';
import AnimatedValue from './animated-value';
import DataFreshness from './data-freshness';
import GroupedStatCard from './grouped-stat-card';
import '@/components/mcm/mcm-page.css';

import LiveDashboard from '@/pages/dashboard/live-dashboard';
import AiWallboard from '@/pages/dashboard/ai-wallboard';
import VideoDashboard from '@/pages/dashboard/video-dashboard';
import CallQueueContent from '@/pages/dashboard/call-dashboard/Call-queue-content';

/**
 * Wallboards used to hang off Home as a second tab strip, which put a "Home"
 * tab inside Home. They are performance surfaces, so they live here.
 *
 * The `feature` below is the plan entitlement each one needs. It used to be
 * declared here and read by nothing — the comment claimed each wallboard was
 * "still gated on the plan feature that gated it before", but the only
 * enforcement was in the rail, which hides the link. `?view=ai-wallboard`
 * typed, pasted or bookmarked rendered the AI wallboard on any plan.
 *
 * `isViewAllowedByPlan` is the same function the rail asks, so the link and
 * the view can no longer disagree. The labels live in `nav-areas.ts` with the
 * rest of the rail, so they are not repeated here.
 */
const WALLBOARD_TABS = [
  { key: 'live-wallboard', feature: undefined },
  { key: 'ai-wallboard', feature: 'ai' },
  { key: 'call-queue', feature: 'queue' },
  { key: 'video-dashboard', feature: 'video' },
] as const;

const TABS = [
  { key: 'queues-activity', label: 'Queues Activity' },
  { key: 'campaign-activity', label: 'Campaign Activity' },
  { key: 'agents', label: 'Agents' },
  { key: 'interactions', label: 'Interactions' },
  { key: 'flows', label: 'Flows' },
  { key: 'dashboards', label: 'Dashboards' },
  { key: 'live-interactions', label: 'Live Interactions' },
  { key: 'callbacks', label: 'Callbacks' },
  { key: 'speech-text', label: 'Speech & Text' },
  { key: 'reports', label: 'Reports' },
];

const SHOW_KPI_HEADER_TABS = new Set(['queues-activity', 'campaign-activity', 'dashboards']);

/**
 * The views that actually read `useLiveContactCentre`.
 *
 * The hook polls queue configuration, the user roster and two REST reports. It
 * used to run on all fourteen views because it is called at page level — so
 * Reports, Speech & Text, Flows, Callbacks and every wallboard were polling
 * queue and roster data none of them display. These four are the views that
 * either show the KPI band or render queue/agent collections.
 */
const LIVE_DATA_TABS = new Set([
  'queues-activity',
  'campaign-activity',
  'dashboards',
  'agents',
]);

const slaTone = (sla: number | null): 'default' | 'success' | 'warning' | 'danger' => {
  if (sla === null) return 'default';
  if (sla >= 80) return 'success';
  if (sla >= 60) return 'warning';
  return 'danger';
};

const Performance = () => {
  // The open view lives in the URL, the same `?view=` convention the calendar
  // uses. That makes a Performance view shareable and survive a refresh, and it
  // is what lets the area rail highlight the view you are actually on.
  /* `setParam` came back after upstream dropped it with the "My dashboards"
     button: it is what corrects an unresolvable `?view=` below. */
  const { setParam, getParam } = useSearchParamManager();
  const { companyPlanFeatures } = useCompanyFeatures();

  /* Wallboards the plan does not include are removed from the set of valid
     views, so an unentitled `?view=` resolves to the default the same way a
     misspelled one does. This is the page half of the gate the rail already
     applies to its links. */
  const allowedWallboardKeys = useMemo(
    () =>
      WALLBOARD_TABS.filter((tab) =>
        isViewAllowedByPlan({ feature: tab.feature }, companyPlanFeatures),
      ).map((tab) => tab.key as string),
    [companyPlanFeatures],
  );
  const allTabKeys = useMemo(
    () => [...TABS.map((tab) => tab.key), ...allowedWallboardKeys],
    [allowedWallboardKeys],
  );
  const viewParam = getParam('view');
  const activeTab =
    viewParam && allTabKeys.includes(viewParam as string) ? (viewParam as string) : TABS[0].key;
  /* A `?view=` that does not resolve — misspelled, or a wallboard this plan
     does not include — used to leave the bad value in the URL while the page
     showed something else. The address bar then disagreed with the screen and
     the rail could not highlight anything. `setParam` navigates with
     `replace: true`, so correcting it costs no history entry. */
  useEffect(() => {
    if (viewParam && viewParam !== activeTab) setParam({ view: activeTab });
  }, [viewParam, activeTab]);
  const [selectedQueueUuid, setSelectedQueueUuid] = useState<string | null>(null);
  const [dropdownVal, setDropdownVal] = useState(() => ({
    value: handleDate('Today'),
    date_type: 'Today',
    dateOptions: DateFilterTypes,
  }));
  const dateDropdownRef = useRef<DateDropdownHandle>(null);
  const selectedRange = dropdownVal.value;
  /* "Today" or "Last 7 Days" says which preset is picked, not which dates
     that resolves to — this spells the actual range out next to it, the
     same way a calendar app shows both the label and the date underneath. */
  const resolvedRangeLabel = useMemo(() => {
    const from = selectedRange?.from ? moment(selectedRange.from) : null;
    const to = selectedRange?.to ? moment(selectedRange.to) : null;
    if (!from?.isValid() || !to?.isValid()) return '';
    return from.isSame(to, 'day')
      ? from.format('MMM D')
      : `${from.format('MMM D')} – ${to.format('MMM D')}`;
  }, [selectedRange?.from, selectedRange?.to]);

  /**
   * The toolbar (filters, live status pill, Wallboard/My dashboards) is
   * rendered once here, unconditionally, above every tab's own content — so
   * `perf-warm-toolbar` (live-theme.css) belongs on this parent rather than
   * duplicated in each tab component. It flags the toolbar bar itself with
   * the flat light tint the left rail uses for its own panel; approved
   * after review, it now applies across every Performance tab, not just
   * Live/Callbacks/Campaigns, which is what previously had it individually.
   */
  useEffect(() => {
    document.body.classList.add('perf-warm-toolbar');
    return () => document.body.classList.remove('perf-warm-toolbar');
  }, []);

  // Queues, agents and the headline figures come from the shared live hook so
  // Home and Performance can never disagree about them. Everything below is
  // this page's own presentation of them.
  const {
    activeQueueCalls,
    usersOnlineStatus,
    queues,
    agentRows,
    queueStatsByUuid,
    liveSlaByName,
    liveQueueStatsByName,
    waitingCalls,
    longestWaitTimestamp,
    longestWaitSecs,
    totals,
    onlineAgentsCount,
    avgSla,
    avgHandleTime,
    abandonRate,
    occupancy,
    callStats,
    cdrByQueueUuid,
    isCdrSampled,
    isQueuesLoading,
    isAgentsLoading,
    failedSources,
    hasSourceError,
    lastUpdatedAt,
    retryFailedSources,
  } = useLiveContactCentre(selectedRange, { enabled: LIVE_DATA_TABS.has(activeTab) });

  /* The seven `useAnimatedNumber` calls that used to sit here have moved into
     `AnimatedValue`, which each card renders. They ran at page level, so every
     animation frame re-rendered the whole page to repaint one tile. */

  // Trends read off the real polled value, not the animated display value —
  // the animated one is mid-flight for ~1.8s after every tick, which would
  // flip the arrow on every render instead of only when the number actually
  // moves between polls.
  const waitingTrend = useTrend(waitingCalls.length);
  const ahtTrend = useTrend(avgHandleTime);
  const abandonTrend = useTrend(abandonRate);

  const isBreachingWait = longestWaitSecs > 120;

  return (
    // `mcm-page` scopes the shared console design system (stat tiles, panels,
    // buttons). PerfStatCard renders `.stat`, which is defined only inside
    // this scope, so without the wrapper every card on every tab loses its
    // styling entirely.
    //
    // Its base rule also swaps in its own typeface, which would leave this
    // page reading differently from the rest of the app — so the font is
    // handed back to the app's own while everything else is kept.
    <section
      className="mcm-page"
      style={
        {
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          // `--sans` and `--mono` are what the design system's own rules read
          // (`.num` puts every stat value in a monospace face, which turned
          // text values like a queue name into typewriter text). Pointing both
          // at the app's own stack keeps the layout while restoring the
          // typography; `.num` still gets its tabular figures.
          '--sans': 'inherit',
          '--mono': 'inherit',
          // The design system pins the page and scrolls one inner pane, which
          // left the tab content scrolling inside a short box. The whole page
          // scrolls as one instead.
          overflowY: 'auto',
        } as React.CSSProperties
      }
    >
      {/* The header row draws from three sources — the app's own date dropdown,
          the design system's chips and its buttons — each with a different
          control height and border colour, which is what made the row look
          unsettled. This puts them on one baseline. */}

      <div className="page-bar">
        {/* The views moved into the area rail, the way the console navigates
            Performance — a strip here as well would be a second row of the
            same navigation. The rail links through `?view=`, which is what
            `activeTab` reads. */}
        {/* This row is the whole page header now, so it carries the filters on
            the left and status plus actions on the right. The controls come
            from three places (the app's date dropdown, the design system's
            chips, its buttons) at three different heights — `perf-tbar` below
            settles them onto one baseline. */}
        <div className="tbar perf-tbar">
          <div className="perf-tbar-group">
            <div className="perf-filter-pill">
              <DateDropdown
                ref={dateDropdownRef}
                dropdownVal={dropdownVal}
                setDropdownVal={setDropdownVal}
                // The default 'inline' placement rendered the From/To
                // date cards, clear button and Apply button in the same
                // row as the Division/Media segments the moment "Date
                // Range" was picked — a lot to fit on one line before it
                // even got to those segments. 'bottom' expands that group
                // into its own floating card under the toolbar instead,
                // leaving the pill itself untouched.
                customPickerPlacement="bottom"
              />
              {resolvedRangeLabel &&
                (dropdownVal.date_type === 'Custom' ? (
                  // A custom range has a panel to go back and edit — the
                  // preset select beside it still works too, but re-picking
                  // "Date Range" from an already-"Date Range" select takes
                  // an extra click a supervisor glancing at "Sep 2 – Sep 3"
                  // shouldn't need.
                  <span
                    className="pf-seg pf-range pf-range-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => dateDropdownRef.current?.openRangePanel()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        dateDropdownRef.current?.openRangePanel();
                      }
                    }}
                  >
                    {resolvedRangeLabel}
                  </span>
                ) : (
                  <span className="pf-seg pf-range">{resolvedRangeLabel}</span>
                ))}
              {/* "Division: All" and "Media: All" sat here as two plain spans
                  styled exactly like the working date control beside them.
                  They had no handler and no state — they were filter-shaped
                  text. Removed rather than left to be clicked; they belong
                  back here as real controls when the filtering exists. */}
            </div>
          </div>

          <div className="perf-tbar-group perf-tbar-end">
            {/* The hardcoded "updates every 2s" badge is replaced by a real
                freshness reading. The "My dashboards" button that sat beside it
                is gone — upstream removed it as non-functional, and the rail
                already carries a Boards item pointing at the same view. */}
            <DataFreshness updatedAt={lastUpdatedAt} />
          </div>
        </div>
      </div>

      {SHOW_KPI_HEADER_TABS.has(activeTab) &&
        !(activeTab === 'queues-activity' && selectedQueueUuid) && (
          <div className="page-band">
            {/* A feed that failed used to be invisible: every query defaults to
                an empty list, so an unreachable API produced Waiting 0,
                Answered 0 — the same screen a genuinely quiet contact centre
                produces. Naming what could not be read, and offering to try
                again, is the difference between "nobody is waiting" and "we
                cannot tell you". */}
            {hasSourceError && (
              <div className="hero-error" role="alert">
                <TriangleAlert className="hero-error-icon" />
                <div className="hero-error-body">
                  <p className="hero-error-t">Some figures below could not be read</p>
                  <p className="hero-error-d">
                    {failedSources.length} of 5 sources failed ({failedSources.join(', ')}). The
                    cards they feed are showing the last value received, which may be out of date.
                  </p>
                </div>
                <button type="button" className="btn sm hero-error-retry" onClick={retryFailedSources}>
                  <RotateCw className="hero-error-retry-icon" />
                  Try again
                </button>
              </div>
            )}
            <div className="hero-notice">
              <Info className="hero-notice-icon" />
              <p className="page-note">
                Waiting, Longest wait, Service level, On queue agents and Occupancy are live right
                now. Answered, Abandon rate and Avg handle time cover the selected date range.
              </p>
            </div>
            <div className="hero-row">
              <HeroStatCard
                label="Waiting"
                value={<AnimatedValue value={waitingCalls.length} format={(n) => String(Math.round(n))} />}
                sub={`across ${queues.length} ${queues.length === 1 ? 'queue' : 'queues'}`}
                breaching={waitingCalls.length > 5}
                trend={waitingTrend}
                trendBadWhenUp
                icon={PhoneIncoming}
              />
              <HeroStatCard
                label="Longest wait"
                value={longestWaitTimestamp ? <Timer startTime={longestWaitTimestamp} /> : '00:00'}
                sub={
                  isBreachingWait ? (
                    <span style={{ color: 'var(--crit)' }}>breaching</span>
                  ) : (
                    'within target'
                  )
                }
                breaching={isBreachingWait}
                icon={AlarmClock}
              />
            </div>
            <div className="grouped-row">
              <GroupedStatCard
                title="Service"
                primary={{
                  label: 'Service level · target 80% in 20s',
                  value: <AnimatedValue value={avgSla} format={(n) => `${Math.round(n)}%`} />,
                  tone: slaTone(avgSla),
                }}
                secondary={{
                  label: 'Avg handle time',
                  value: <AnimatedValue value={avgHandleTime} format={formatSecsToClock} />,
                  trend: ahtTrend,
                  trendBadWhenUp: true,
                }}
              />
              <GroupedStatCard
                title="Volume"
                primary={{
                  label: `Answered · of ${callStats.totalCalls} calls`,
                  value: <AnimatedValue value={totals.answered} format={(n) => String(Math.round(n))} />,
                }}
                secondary={{
                  label: abandonRate === null ? 'Abandon rate' : `Abandon · ${callStats.missedCalls} missed`,
                  value: <AnimatedValue value={abandonRate} format={(n) => `${Math.round(n)}%`} />,
                  tone: abandonRate !== null && abandonRate > 5 ? 'danger' : 'default',
                  trend: abandonTrend,
                  trendBadWhenUp: true,
                }}
              />
              <GroupedStatCard
                title="Coverage"
                primary={{
                  label: `On queue · of ${agentRows.length} active`,
                  value: <AnimatedValue value={onlineAgentsCount} format={(n) => String(Math.round(n))} />,
                }}
                secondary={{
                  label: 'Occupancy · target 75–85%',
                  value: <AnimatedValue value={occupancy} format={(n) => `${Math.round(n)}%`} />,
                }}
              />
            </div>
          </div>
        )}

      {/* Flows in the page's own scroll rather than being a separate scroll pane. */}
      <div style={{ flex: 'none' }}>
        {activeTab === 'queues-activity' && (
          <QueuesActivityTab
            queues={queues}
            activeQueueCalls={activeQueueCalls}
            queueStatsByUuid={queueStatsByUuid}
            liveSlaByName={liveSlaByName}
            liveQueueStatsByName={liveQueueStatsByName}
            cdrByQueueUuid={cdrByQueueUuid}
            isCdrSampled={isCdrSampled}
            usersOnlineStatus={usersOnlineStatus || []}
            isLoading={isQueuesLoading}
            selectedQueueUuid={selectedQueueUuid}
            setSelectedQueueUuid={setSelectedQueueUuid}
          />
        )}
        {activeTab === 'campaign-activity' && <CampaignActivityTab />}
        {activeTab === 'agents' && (
          <AgentsTab
            agentRows={agentRows}
            usersOnlineStatus={usersOnlineStatus || []}
            activeQueueCalls={activeQueueCalls}
            queues={queues}
            isLoading={isAgentsLoading}
          />
        )}
        {activeTab === 'interactions' && <InteractionsTab selectedRange={selectedRange} />}
        {activeTab === 'flows' && <FlowsTab />}
        {activeTab === 'dashboards' && <DashboardsTab />}
        {activeTab === 'live-interactions' && <LiveInteractionsTab />}
        {activeTab === 'callbacks' && <CallbacksTab />}
        {activeTab === 'speech-text' && <SpeechTextTab />}
        {activeTab === 'reports' && <ReportsTab selectedRange={selectedRange} />}

        {/* The wallboards predate the console language and bring their own
            layout, so they get a plain scroll container. */}
        {activeTab === 'live-wallboard' && (
          <div className="dash-legacy">
            <LiveDashboard selectedRange={selectedRange} />
          </div>
        )}
        {activeTab === 'ai-wallboard' && (
          <div className="dash-legacy">
            <AiWallboard />
          </div>
        )}
        {activeTab === 'call-queue' && (
          <div className="dash-legacy">
            <div className="p-3">
              <CallQueueContent />
            </div>
          </div>
        )}
        {activeTab === 'video-dashboard' && (
          <div className="dash-legacy">
            <VideoDashboard />
          </div>
        )}
      </div>
    </section>
  );
};

export default Performance;
