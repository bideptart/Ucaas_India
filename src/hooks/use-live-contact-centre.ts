import { useCallback, useMemo } from 'react';
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

/* How often the live numbers are re-read.
 *
 * This was 2s for every query below, which meant four report POSTs per tab per
 * two seconds — plus the directory's roster on the same clock. On Performance,
 * Home and Directory together that was enough to trip the API's rate limiter,
 * so the screens ended up showing *less* live data than a slower poll would:
 * a 429 returns nothing at all. */
export const KPI_REFRESH_MS = 10000;

/* Queues and the user roster are configuration, not live state — they change
 * when somebody edits them, not every few seconds. They are still refetched so
 * a newly added queue or user appears without a reload, just on a clock that
 * matches how often they actually change. Live call and agent presence arrive
 * over the socket, so nothing here gates how fast the board reacts to a call. */
export const CONFIG_REFRESH_MS = 5 * 60 * 1000;

const INTERACTING_STATUSES = ['answered', 'bridged', 'on_hold'];

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

export const PERF_QUERY_KEYS = {
  queueList: 'performanceQueueList',
  userRoster: 'performanceUserRoster',
  agentReport: 'performanceAgentReportList',
  queueStats: 'performanceQueueStatsList',
} as const;

export const useLiveContactCentre = (
  selectedRange: any,
  /* `enabled: false` parks every feed. Performance passes it for tabs that show
     no live figures, so those tabs stop polling five endpoints on a timer. */
  options?: { enabled?: boolean },
) => {
  const enabled = options?.enabled ?? true;
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { liveCalls, eventLiveCallsData, usersOnlineStatus, liveQueueCalls, campaignLiveCallsData } =
    useSocketEvents();
  const liveSummary = campaignLiveCallsData?.data?.summary;

  const activeQueueCalls = useMemo(
    () => getMonitoringLiveCalls(liveCalls, eventLiveCallsData).filter(isActiveMonitoringCall),
    [liveCalls, eventLiveCallsData],
  );

  const queueListQuery = useQuery({
    queryKey: ['performanceQueueList'],
    queryFn: () => callQueueList({ page: 1, limit: 200, filters: [], search: '' }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    refetchInterval: CONFIG_REFRESH_MS,
    enabled,
  });
  const queueRows = queueListQuery.data ?? [];
  const isQueuesLoading = queueListQuery.isPending;

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
    queryKey: ['performanceUserRoster'],
    queryFn: () => getUserList({ page: 1, limit: 200 }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    refetchInterval: CONFIG_REFRESH_MS,
    enabled,
  });
  const roster = rosterQuery.data ?? [];
  const isRosterLoading = rosterQuery.isPending;

  const agentStatsQuery = useQuery({
    queryKey: ['performanceAgentReportList', selectedRange],
    queryFn: () =>
      callReportAgentList({
        page: 1,
        limit: 200,
        timezone: browserTimezone,
        filter_date: selectedRange,
        filter: [],
      }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    refetchInterval: KPI_REFRESH_MS,
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
  const isAgentsLoading = isRosterLoading;

  const queueStatsQuery = useQuery({
    queryKey: ['performanceQueueStatsList', selectedRange],
    queryFn: () =>
      callLogQueueList({
        page: 1,
        limit: 200,
        timezone: browserTimezone,
        filter_date: selectedRange,
      }),
    select: (res: any) => res?.data?.rows || res?.data?.data?.result?.rows || [],
    refetchInterval: KPI_REFRESH_MS,
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

  /* The five feeds this hook stands on, so a failure can be named rather than
     shown as a page full of zeroes. Performance renders "N of 5 sources failed
     (…)" from this and retries just the ones that broke. */
  const sources = useMemo(
    () => [
      { name: 'queues', query: queueListQuery },
      { name: 'people', query: rosterQuery },
      { name: 'agent stats', query: agentStatsQuery },
      { name: 'queue stats', query: queueStatsQuery },
      { name: 'call log', query: callStats },
    ],
    [queueListQuery, rosterQuery, agentStatsQuery, queueStatsQuery, callStats],
  );

  const failedSources = useMemo(
    () => sources.filter((source) => source.query?.isError).map((source) => source.name),
    [sources],
  );
  const hasSourceError = failedSources.length > 0;

  /* The newest successful fetch across the feeds -- what "updated 12s ago" on
     the page means. A feed that has never loaded reports 0 and is ignored. */
  const lastUpdatedAt = useMemo(() => {
    const stamps = sources
      .map((source) => Number(source.query?.dataUpdatedAt ?? 0))
      .filter((stamp) => stamp > 0);
    return stamps.length ? Math.max(...stamps) : 0;
  }, [sources]);

  const retryFailedSources = useCallback(() => {
    sources.forEach((source) => {
      if (source.query?.isError) void source.query.refetch?.();
    });
  }, [sources]);

  return {
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
    isQueuesLoading,
    isAgentsLoading,
    // source health
    failedSources,
    hasSourceError,
    lastUpdatedAt,
    retryFailedSources,
  };
};
