import { useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSocketEvents } from '@/hooks/use-socket-events';
import { SocketEvents } from '@/context/socket-events-context';
import { useUser } from '@/hooks/use-user';
import { handleDate } from '@/components/custom/date-dropdown/constant';
import { callQueueList, campaignList } from '@/services/api';
import { useAnimatedNumber } from './use-animated-number';
import { useCallStats } from '@/hooks/use-call-stats';
import { formatSecsToClock } from './format';
import KpiStrip from './kpi-strip';

const TODAY_RANGE = handleDate('Today');

const DashboardsTab = () => {
  const { usersOnlineStatus } = useSocketEvents();
  const { campaignAiLiveCallData, getAiLiveWallboardData, isSocketConnected } =
    useContext(SocketEvents);
  const { user } = useUser();

  const canRefreshAi = Boolean(
    user?.sip_credentials?.domain &&
    user?.company_info?.uuid &&
    user?.user_info?.uuid &&
    isSocketConnected,
  );

  useEffect(() => {
    if (!canRefreshAi) return;
    getAiLiveWallboardData({
      domain: user?.sip_credentials?.domain,
      company_uuid: user?.company_info?.uuid,
      user_uuid: user?.user_info?.uuid,
    });
  }, [canRefreshAi]);

  const aiContainment = campaignAiLiveCallData?.data?.result?.ai_containment_percent;

  const { data: queues = [] } = useQuery({
    queryKey: ['performanceQueueList'],
    queryFn: () => callQueueList({ page: 1, limit: 200, filters: [], search: '' }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['performanceDashboardCampaignList'],
    queryFn: () => campaignList({ page: 1, limit: 100, filters: [] }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
  });

  // "Answered Today" / AHT previously summed callLogQueueList across all time
  // and labelled it "today". The call log is the real per-day source.
  const callStats = useCallStats(TODAY_RANGE);

  const activeCampaignsCount = campaigns.filter((c: any) =>
    ['ACTIVE', 'PROCESSING', 'RUNNING'].includes(String(c?.campaignStatus || '').toUpperCase()),
  ).length;
  const onlineAgentsCount = (usersOnlineStatus || []).filter((u: any) => u?.online).length;
  const avgHandleTime = callStats.avgHandleSec ?? 0;

  const queuesAnimated = useAnimatedNumber(queues.length);
  const campaignsAnimated = useAnimatedNumber(activeCampaignsCount);
  const agentsAnimated = useAnimatedNumber(onlineAgentsCount);
  const answeredAnimated = useAnimatedNumber(callStats.answeredCalls);
  const ahtAnimated = useAnimatedNumber(avgHandleTime);

  return (
    <div className="w-full px-[22px] py-4">
      <style>{`
        .mcm-page .kpi-strip {
          display:flex; align-items:stretch;
          background:var(--surface); border-radius:16px; overflow:hidden;
          border:1px solid var(--line);
          box-shadow: 0 1px 2px rgba(46,45,53,0.05);
          margin-bottom: 4px;
        }
        .mcm-page .kpi-strip-cell {
          flex:1; min-width:0; padding:14px 16px;
          display:flex; flex-direction:column; gap:4px;
          border-left:1px solid var(--line);
        }
        .mcm-page .kpi-strip-cell:first-child { border-left:none; }
        .mcm-page .kpi-strip-cell-breach { background:var(--crit-wash); }
        .mcm-page .kpi-strip-label {
          font-size:10.5px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase;
          color:var(--ink-3, #9A948F); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .mcm-page .kpi-strip-value {
          font-size:26px; font-weight:800; letter-spacing:-0.02em; line-height:1.15;
          color:var(--ink, #2E2D35); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .mcm-page .kpi-strip-value-success { color:var(--live); }
        .mcm-page .kpi-strip-value-danger { color:var(--crit); }
        .mcm-page .kpi-strip-sub {
          font-size:11.5px; color:var(--ink-3, #9A948F);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        @media (max-width: 1180px) {
          .mcm-page .kpi-strip { flex-wrap:wrap; }
          .mcm-page .kpi-strip-cell { flex:1 1 33.33%; min-width:150px; border-bottom:1px solid var(--line); }
        }
        @media (max-width: 620px) {
          .mcm-page .kpi-strip-cell { flex:1 1 50%; }
        }
      `}</style>
      <p className="page-note" style={{ marginBottom: 12 }}>
        A quick-glance overview across queues, campaigns and agents.
      </p>
      <KpiStrip
        items={[
          {
            key: 'active-queues',
            label: 'Active Queues',
            value: Math.round(queuesAnimated),
          },
          {
            key: 'active-campaigns',
            label: 'Active Campaigns',
            value: Math.round(campaignsAnimated),
            sub: `of ${campaigns.length} total`,
          },
          {
            key: 'agents-online',
            label: 'Agents Online',
            value: Math.round(agentsAnimated),
          },
          {
            key: 'answered-today',
            label: 'Answered Today',
            value: Math.round(answeredAnimated),
          },
          {
            key: 'avg-handle-time',
            label: 'Avg Handle Time',
            value: callStats.avgHandleSec === null ? '—' : formatSecsToClock(ahtAnimated),
          },
          {
            key: 'ai-containment',
            label: 'AI Containment',
            value: typeof aiContainment === 'number' ? `${Math.round(aiContainment)}%` : '—',
            sub: 'resolved without a human',
          },
        ]}
      />
    </div>
  );
};

export default DashboardsTab;
