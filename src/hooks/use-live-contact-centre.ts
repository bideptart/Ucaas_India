import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSocketEvents } from '@/hooks/use-socket-events';
import { useCallStats } from '@/hooks/use-call-stats';
import { callLogQueueList, callQueueList, callReportAgentList, getUserList } from '@/services/api';
import {
  getMonitoringCallTimestamp,
  getMonitoringLiveCalls,
  isActiveMonitoringCall,
} from '@/pages/monitoring/live-call-helpers';

/**
 * The live contact-centre picture — queues, agents and the headline KPIs.
 *
 * Lifted verbatim out of `pages/performance/index.tsx` so Home and Performance
 * read the same numbers from the same sources. They used to be the same eight
 * KPIs computed in one place; putting Home on a private copy would have let the
 * two drift, and "Home says 86%, Performance says 84%" is the kind of bug
 * nobody reports and everybody stops trusting the product over.
 *
 * The commentary below is the original's and still applies — it records which
 * feeds turned out trustworthy and which did not.
 */

/**
 * Refresh tiers.
 *
 * These four REST feeds used to share one 2s interval, which meant ~120
 * requests a minute per open tab whatever the page was showing. The tiers
 * below are set by how fast each feed actually changes.
 *
 * The important thing this does NOT do is slow the live figures down. Waiting,
 * longest wait, service level, on-queue agents and occupancy are all derived
 * from the socket feed further down — they arrive on push and are untouched by
 * anything here. What these intervals govern is the supporting REST data: the
 * queue roster and configuration, and the per-agent report.
 */
/** Queue and user configuration — names, members, extensions. Rarely changes. */
export const CONFIG_REFRESH_MS = 60000;
/** Date-ranged REST reports. Matches `useCallStats`, which reads the same CDR. */
export const STATS_REFRESH_MS = 15000;
/** Kept for callers that still import it. */
export const KPI_REFRESH_MS = 2000;

const INTERACTING_STATUSES = ['answered', 'bridged', 'on_hold'];

/**
 * Query keys shared with the tabs that read the same endpoints.
 *
 * These were written as bare strings at each call site, and two of them drifted
 * apart: the Reports tab asked for the agent report under
 * `performanceReportAgentSummary` while this hook asked for the identical
 * request under `performanceAgentReportList`, so React Query treated one
 * resource as two and fetched it twice. Naming them once removes the class,
 * not just the instance.
 */
export const PERF_QUERY_KEYS = {
  queueList: 'performanceQueueList',
  userRoster: 'performanceUserRoster',
  agentReport: 'performanceAgentReportList',
  queueStats: 'performanceQueueStatsList',
} as const;

const parseQueueMembers = (members: any) => {
  try {
    const parsed = typeof members === 'string' ? JSON.parse(members || '[]') : members;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export type LiveQueue = {
  uuid: string;
  name: string;
  membersCount: number;
  memberKeys: string[];
  members: any[];
};

/**
 * @param options.enabled  Whether the caller is actually showing this data.
 *   Defaults to true so existing callers (Home) are unchanged. Performance
 *   passes false on the ten views that read none of it, which is what stops
 *   Reports and the wallboards polling queue and roster data they never show.
 */
export const useLiveContactCentre = (
  selectedRange: any,
  options: { enabled?: boolean } = {},
) => {
  const { enabled = true } = options;
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { liveCalls, eventLiveCallsData, usersOnlineStatus, liveQueueCalls, campaignLiveCallsData } =
    useSocketEvents();
  const liveSummary = campaignLiveCallsData?.data?.summary;

  const activeQueueCalls = useMemo(
    () => getMonitoringLiveCalls(liveCalls, eventLiveCallsData).filter(isActiveMonitoringCall),
    [liveCalls, eventLiveCallsData],
  );

  const queueQuery = useQuery({
    queryKey: [PERF_QUERY_KEYS.queueList],
    queryFn: () => callQueueList({ page: 1, limit: 200, filters: [], search: '' }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    refetchInterval: CONFIG_REFRESH_MS,
    enabled,
  });
  const queueRows = queueQuery.data ?? [];

  const queues: LiveQueue[] = useMemo(
    () =>
      queueRows.map((row: any) => {
        const members = parseQueueMembers(row?.members);
        const memberKeys = members
          .map((member: any) => String(member?.user_uuid || member?.uuid || member?.extension || ''))
          .filter(Boolean);
        return {
          uuid: row?.uuid,
          name: row?.name || 'Untitled queue',
          membersCount: members.length,
          memberKeys,
          members,
        };
      }),
    [queueRows],
  );

  const rosterQuery = useQuery({
    queryKey: [PERF_QUERY_KEYS.userRoster],
    queryFn: () => getUserList({ page: 1, limit: 200 }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    refetchInterval: CONFIG_REFRESH_MS,
    enabled,
  });
  const roster = rosterQuery.data ?? [];

  const agentStatsQuery = useQuery({
    queryKey: [PERF_QUERY_KEYS.agentReport, selectedRange],
    queryFn: () =>
      callReportAgentList({
        page: 1,
        limit: 200,
        timezone: browserTimezone,
        filter_date: selectedRange,
        filter: [],
      }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    refetchInterval: STATS_REFRESH_MS,
    enabled,
  });
  const agentStatsRows = agentStatsQuery.data ?? [];

  const agentStatsByName = useMemo(() => {
    const map: Record<string, any> = {};
    agentStatsRows.forEach((row: any) => {
      const key = `${row?.first_name || ''} ${row?.last_name || ''}`.trim().toLowerCase();
      if (key) map[key] = row?.stats || {};
    });
    return map;
  }, [agentStatsRows]);

  const agentRows = useMemo(
    () =>
      roster.map((user: any) => {
        const key = `${user?.first_name || ''} ${user?.last_name || ''}`.trim().toLowerCase();
        return { ...user, stats: agentStatsByName[key] || {} };
      }),
    [roster, agentStatsByName],
  );
  const isAgentsLoading = enabled && rosterQuery.isPending;

  const queueStatsQuery = useQuery({
    queryKey: [PERF_QUERY_KEYS.queueStats, selectedRange],
    queryFn: () =>
      callLogQueueList({
        page: 1,
        limit: 200,
        timezone: browserTimezone,
        filter_date: selectedRange,
      }),
    select: (res: any) => res?.data?.rows || res?.data?.data?.result?.rows || [],
    refetchInterval: STATS_REFRESH_MS,
    enabled,
  });
  const queueStatsRows = queueStatsQuery.data ?? [];

  const queueStatsByUuid = useMemo(() => {
    const map: Record<string, any> = {};
    queueStatsRows.forEach((row: any) => {
      if (row?.uuid) map[row.uuid] = row?.queue_stats || {};
    });
    return map;
  }, [queueStatsRows]);

  const liveSlaByName = useMemo(() => {
    const map: Record<string, number> = {};
    (liveQueueCalls || []).forEach((queue: any) => {
      if (queue?.name && typeof queue?.sla_within_20_sec_percent === 'number') {
        map[String(queue.name).toLowerCase()] = queue.sla_within_20_sec_percent;
      }
    });
    return map;
  }, [liveQueueCalls]);

  // callLogQueueList (queueStatsByUuid) turned out unreliable for today's
  // handled/ASA counts — the live socket feed (same source already proven
  // correct for SLA above) reports real total_calls/avg_wait_time_sec per
  // queue, so use that instead.
  const liveQueueStatsByName = useMemo(() => {
    const map: Record<string, { totalCalls: number; avgWaitSec: number; availableCount: number }> =
      {};
    (liveQueueCalls || []).forEach((queue: any) => {
      if (!queue?.name) return;
      map[String(queue.name).toLowerCase()] = {
        totalCalls: typeof queue?.total_calls === 'number' ? queue.total_calls : 0,
        avgWaitSec: typeof queue?.avg_wait_time_sec === 'number' ? queue.avg_wait_time_sec : 0,
        availableCount: typeof queue?.available_count === 'number' ? queue.available_count : 0,
      };
    });
    return map;
  }, [liveQueueCalls]);

  const waitingCalls = useMemo(
    () => activeQueueCalls.filter((call: any) => call?.status === 'waiting'),
    [activeQueueCalls],
  );
  const interactingCalls = useMemo(
    () =>
      activeQueueCalls.filter((call: any) =>
        INTERACTING_STATUSES.includes(String(call?.status || '')),
      ),
    [activeQueueCalls],
  );
  const longestWaitingCall = useMemo(
    () =>
      waitingCalls.reduce((longest: any, call: any) => {
        if (!longest) return call;
        const callTimestamp = getMonitoringCallTimestamp(call) ?? Infinity;
        const longestTimestamp = getMonitoringCallTimestamp(longest) ?? Infinity;
        return callTimestamp < longestTimestamp ? call : longest;
      }, null),
    [waitingCalls],
  );

  // Volume figures (answered / abandoned / AHT) come from the call log for the
  // selected range. The live queue feed only carries a right-now snapshot and
  // the per-queue REST report reads near-zero for today, so neither matched
  // the call volume actually visible in Call History.
  const callStats = useCallStats(selectedRange, { enabled });

  const totals = useMemo(
    () => ({ answered: callStats.answeredCalls, total: callStats.totalCalls }),
    [callStats.answeredCalls, callStats.totalCalls],
  );

  const onlineAgentsCount = (usersOnlineStatus || []).filter((user: any) => user?.online).length;
  const slaValues = Object.values(liveSlaByName);
  const avgSla = slaValues.length
    ? slaValues.reduce((sum, value) => sum + value, 0) / slaValues.length
    : null;
  const avgHandleTime =
    callStats.avgHandleSec ??
    (typeof liveSummary?.avg_handle_time === 'number' ? liveSummary.avg_handle_time : null);
  const abandonRate = callStats.abandonRate;
  const occupancy = onlineAgentsCount ? (interactingCalls.length / onlineAgentsCount) * 100 : null;

  const longestWaitTimestamp = longestWaitingCall
    ? getMonitoringCallTimestamp(longestWaitingCall)
    : null;
  const longestWaitSecs = longestWaitTimestamp
    ? Math.max(0, Math.round((Date.now() - longestWaitTimestamp) / 1000))
    : 0;

  /**
   * What is actually known, and how old it is.
   *
   * Nothing here was reported before: every query defaulted to `[]` and the
   * only thing that reached a caller was two loading flags. A failed fetch
   * therefore rendered as zeros — the same picture as a genuinely quiet
   * contact centre, which is the one thing a supervisor must not confuse.
   *
   * `sources` names each feed so a screen can degrade the cards that feed
   * touches instead of blanking the whole page, and `lastUpdatedAt` is what a
   * freshness indicator reads: a stalled feed shows its age rather than
   * quietly holding the last number it happened to have.
   */
  const sources = {
    queues: {
      isError: queueQuery.isError,
      isLoading: enabled && queueQuery.isPending,
      updatedAt: queueQuery.dataUpdatedAt || null,
      refetch: queueQuery.refetch,
    },
    roster: {
      isError: rosterQuery.isError,
      isLoading: enabled && rosterQuery.isPending,
      updatedAt: rosterQuery.dataUpdatedAt || null,
      refetch: rosterQuery.refetch,
    },
    agentStats: {
      isError: agentStatsQuery.isError,
      isLoading: enabled && agentStatsQuery.isPending,
      updatedAt: agentStatsQuery.dataUpdatedAt || null,
      refetch: agentStatsQuery.refetch,
    },
    queueStats: {
      isError: queueStatsQuery.isError,
      isLoading: enabled && queueStatsQuery.isPending,
      updatedAt: queueStatsQuery.dataUpdatedAt || null,
      refetch: queueStatsQuery.refetch,
    },
    callLog: {
      isError: callStats.isError,
      isLoading: callStats.isPending,
      updatedAt: callStats.updatedAt,
      refetch: callStats.refetch,
    },
  };

  const failedSources = Object.entries(sources)
    .filter(([, source]) => source.isError)
    .map(([name]) => name);

  /* The newest successful fetch across every feed. `Math.max` of an empty list
     is -Infinity, so an all-failed page reports null rather than a nonsense
     date. */
  const updatedTimes = Object.values(sources)
    .map((source) => source.updatedAt)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const lastUpdatedAt = updatedTimes.length ? Math.max(...updatedTimes) : null;

  const retryFailedSources = () => {
    Object.values(sources).forEach((source) => {
      if (source.isError) void source.refetch?.();
    });
  };

  return {
    // status
    sources,
    failedSources,
    hasSourceError: failedSources.length > 0,
    lastUpdatedAt,
    retryFailedSources,
    // raw feeds
    activeQueueCalls,
    usersOnlineStatus: usersOnlineStatus || [],
    liveQueueCalls: liveQueueCalls || [],
    // collections
    queues,
    agentRows,
    queueStatsByUuid,
    liveSlaByName,
    liveQueueStatsByName,
    // slices
    waitingCalls,
    interactingCalls,
    longestWaitingCall,
    longestWaitTimestamp,
    longestWaitSecs,
    // headline figures
    totals,
    onlineAgentsCount,
    avgSla,
    avgHandleTime,
    abandonRate: abandonRate as number | null,
    occupancy,
    // call-log derived (date-ranged)
    callStats,
    cdrByQueueUuid: callStats.byQueueUuid,
    isCdrSampled: callStats.isQueueBreakdownSampled,
    // loading
    isQueuesLoading: sources.queues.isLoading,
    isAgentsLoading,
  };
};
