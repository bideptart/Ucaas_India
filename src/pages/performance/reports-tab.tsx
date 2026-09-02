import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronDown, Download, Info, LayoutGrid, Lock } from 'lucide-react';
import { useContext, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Loader from '@/components/custom/loader';
import { SocketEvents } from '@/context/socket-events-context';
import { useUser } from '@/hooks/use-user';
import { useCallStats } from '@/hooks/use-call-stats';
import { callReportAgentList, campaignList, getGroupList, getSmsLogList } from '@/services/api';
import PerfStatCard from './stat-card';
import {
  REPORT_CATALOG,
  AVAILABLE_REPORT_COUNT,
  TOTAL_REPORT_COUNT,
  findReport,
} from './reports/catalog';
import type { ReportTable } from './reports/builders';
import './reports-theme.css';

type LinkedReport = {
  title: string;
  Component: React.LazyExoticComponent<React.ComponentType<any>>;
};

const LINKED_REPORTS: { group: string; reports: LinkedReport[] }[] = [
  {
    group: 'Interactions',
    reports: [
      {
        title: 'Call History',
        Component: lazy(() => import('@/pages/reports/call-logs/call-history')),
      },
      {
        title: 'Local Call List',
        Component: lazy(() => import('@/pages/reports/call-logs/local-call-list')),
      },
      { title: 'Inbound', Component: lazy(() => import('@/pages/reports/call-logs/inbound')) },
      { title: 'Outbound', Component: lazy(() => import('@/pages/reports/call-logs/outbound')) },
      { title: 'Voicemail', Component: lazy(() => import('@/pages/reports/call-logs/voicemail')) },
      { title: 'SMS Log', Component: lazy(() => import('@/pages/reports/sms-logs')) },
    ],
  },
  {
    group: 'Agents',
    reports: [
      { title: 'Activity', Component: lazy(() => import('@/pages/reports/call-logs/activity')) },
    ],
  },
  {
    group: 'Analytics',
    reports: [
      {
        title: 'Call Volume',
        Component: lazy(() => import('@/pages/reports/call-logs/call-volumn')),
      },
      { title: 'Call Analytics', Component: lazy(() => import('@/pages/reports/analytics')) },
    ],
  },
];

const toCsvValue = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const ReportsTab = ({ selectedRange }: { selectedRange: { from: string; to: string } }) => {
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedId, setSelectedId] = useState('queue-summary');
  const [openReport, setOpenReport] = useState<LinkedReport | null>(null);
  // The dropdown is the primary picker; the full catalog opens on demand,
  // matching the console.
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  const selected = findReport(selectedId);
  const callStats = useCallStats(selectedRange);

  /**
   * `perf-warm-backdrop` flags the document so reports-theme.css can paint
   * the full-page ambient gradient on `.perf-reports`, the same pattern
   * Callbacks/Campaigns/Speech & Text use.
   */
  useEffect(() => {
    document.body.classList.add('perf-warm-backdrop');
    return () => document.body.classList.remove('perf-warm-backdrop');
  }, []);

  const { campaignAiLiveCallData, getAiLiveWallboardData, isSocketConnected } =
    useContext(SocketEvents);
  const { user } = useUser();

  // Agent and campaign figures only load for the reports that actually need
  // them, so switching between queue reports doesn't fire extra requests.
  const needsAgents = selectedId === 'agent-summary';
  const needsCampaigns = selectedId === 'campaign-performance';
  const needsAi = selectedId === 'sentiment-topics';
  const needsSms = selectedId === 'media-type';
  const needsLists = selectedId === 'contact-list-status';

  const { data: agentStatsRows = [], isPending: isAgentPending } = useQuery({
    queryKey: ['performanceReportAgentSummary', selectedRange],
    queryFn: () =>
      callReportAgentList({
        page: 1,
        limit: 200,
        timezone: browserTimezone,
        filter_date: selectedRange,
        filter: [],
      }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    enabled: needsAgents,
  });

  const { data: campaigns = [], isPending: isCampaignPending } = useQuery({
    queryKey: ['performanceReportCampaigns'],
    queryFn: () => campaignList({ page: 1, limit: 100, filters: [] }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    enabled: needsCampaigns,
  });

  const { data: smsRows = [], isPending: isSmsPending } = useQuery({
    queryKey: ['performanceReportSmsLog', selectedRange],
    queryFn: () =>
      getSmsLogList({
        page: 1,
        limit: 1000,
        filter_date: { from: selectedRange.from, to: selectedRange.to },
      }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    enabled: needsSms,
  });

  const { data: contactLists = [], isPending: isListsPending } = useQuery({
    queryKey: ['performanceReportContactLists'],
    queryFn: () => getGroupList({ page: 1, limit: 200 }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
    enabled: needsLists,
  });

  useEffect(() => {
    if (!needsAi) return;
    const canRefresh = Boolean(
      user?.sip_credentials?.domain &&
      user?.company_info?.uuid &&
      user?.user_info?.uuid &&
      isSocketConnected,
    );
    if (!canRefresh) return;
    getAiLiveWallboardData({
      domain: user?.sip_credentials?.domain,
      company_uuid: user?.company_info?.uuid,
      user_uuid: user?.user_info?.uuid,
    });
  }, [needsAi, isSocketConnected]);

  const report: ReportTable | null = useMemo(() => {
    if (!selected?.build) return null;
    try {
      return selected.build({
        rows: callStats.rows,
        isSampled: callStats.isQueueBreakdownSampled,
        agentStatsRows,
        campaigns,
        aiResult: campaignAiLiveCallData?.data?.result,
        smsRows,
        contactLists,
      });
    } catch {
      return null;
    }
  }, [
    selected,
    callStats.rows,
    agentStatsRows,
    campaigns,
    campaignAiLiveCallData,
    smsRows,
    contactLists,
  ]);

  const isLoading =
    callStats.isPending ||
    (needsAgents && isAgentPending) ||
    (needsCampaigns && isCampaignPending) ||
    (needsSms && isSmsPending) ||
    (needsLists && isListsPending);

  const exportCsv = () => {
    if (!report || !selected) return;
    const lines = [report.head.map(toCsvValue).join(',')];
    report.rows.forEach((row) => lines.push(row.map(toCsvValue).join(',')));
    if (report.total) lines.push(report.total.map(toCsvValue).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selected.id}_${selectedRange.from}_${selectedRange.to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="perf-reports"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '16px 22px 96px',
      }}
    >
      {/* ---- headline totals for the range ---- */}
      <div className="grid4">
        <PerfStatCard label="Total offered" value={String(callStats.totalCalls)} />
        <PerfStatCard label="Total handled" value={String(callStats.answeredCalls)} />
        <PerfStatCard
          label="Total abandoned"
          value={String(callStats.missedCalls)}
          tone={callStats.missedCalls > 0 ? 'warning' : 'default'}
        />
        <PerfStatCard
          label="Abandon rate"
          value={callStats.abandonRate === null ? '—' : `${Math.round(callStats.abandonRate)}%`}
          tone={callStats.abandonRate !== null && callStats.abandonRate > 5 ? 'danger' : 'default'}
        />
      </div>

      {/* ---- toolbar: pick a report, browse the catalog, export ---- */}
      <div
        className="rp-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '10px 12px',
        }}
      >
        <div className="rp-toolbar-group">
          <button
            type="button"
            className={`btn ${isCatalogOpen ? 'primary' : 'ghost'} sm`}
            onClick={() => setIsCatalogOpen((open) => !open)}
          >
            <LayoutGrid style={{ width: 14, height: 14 }} />
            All reports ({AVAILABLE_REPORT_COUNT} of {TOTAL_REPORT_COUNT})
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rp-select-trigger">
                <span className="rp-select-value">{selected?.title || 'Select a report'}</span>
                <ChevronDown className="rp-select-chevron" style={{ width: 14, height: 14 }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="rp-report-menu" align="start">
              {REPORT_CATALOG.map((group) => (
                <DropdownMenuGroup key={group.group} className="rp-report-menu-group">
                  <DropdownMenuLabel className="rp-report-menu-label">
                    {group.group}
                  </DropdownMenuLabel>
                  {group.reports.map((definition) => {
                    const isAvailable = Boolean(definition.build);
                    const isSelected = definition.id === selectedId;
                    return (
                      <DropdownMenuItem
                        key={definition.id}
                        disabled={!isAvailable}
                        title={definition.unavailableReason}
                        data-selected={isSelected ? '' : undefined}
                        onSelect={() => {
                          if (!isAvailable) return;
                          setSelectedId(definition.id);
                        }}
                        className="rp-report-menu-item"
                      >
                        {!isAvailable && (
                          <Lock className="rp-report-menu-lock" style={{ width: 11, height: 11 }} />
                        )}
                        <span>{definition.title}</span>
                        {!isAvailable && (
                          <span className="rp-report-menu-hint">no data source</span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="rp-toolbar-divider" />

        <div className="rp-range">
          <Calendar style={{ width: 12.5, height: 12.5 }} />
          <span>
            {selectedRange.from} <span className="rp-range-arrow">→</span> {selectedRange.to}
          </span>
          <span className="rp-range-hint">(set by the date filter above)</span>
        </div>

        <span style={{ flex: 1 }} />

        <button
          type="button"
          className="btn ghost sm"
          onClick={exportCsv}
          disabled={!report || !report.rows.length}
          style={{ opacity: !report || !report.rows.length ? 0.5 : 1 }}
        >
          <Download style={{ width: 14, height: 14 }} />
          Export CSV
        </button>
      </div>

      {/* ---- catalog (collapsed by default, like the console) ---- */}
      {isCatalogOpen && (
        <div className="panel-card">
          <div className="pc-head">
            <h3>Report catalog</h3>
            <span className="pc-right" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              click a report to run it over the selected date range
            </span>
          </div>
          <div className="pc-body">
            {REPORT_CATALOG.map((group) => (
              <div key={group.group}>
                <div className="sect-title" style={{ margin: '14px 0 8px' }}>
                  {group.group}
                </div>
                <div className="rp-catalog-grid">
                  {group.reports.map((definition) => {
                    const isSelected = definition.id === selectedId;
                    const isAvailable = Boolean(definition.build);
                    return (
                      <button
                        type="button"
                        key={definition.id}
                        // Native `disabled` makes Chromium paint its own
                        // form-control background under the locked card,
                        // ignoring this file's CSS regardless of specificity
                        // or `!important` — `aria-disabled` plus the guard
                        // below keeps it un-clickable without that native
                        // rendering taking over.
                        aria-disabled={!isAvailable}
                        title={definition.unavailableReason}
                        onClick={() => {
                          if (!isAvailable) return;
                          setSelectedId(definition.id);
                          setIsCatalogOpen(false);
                        }}
                        className={`rp-catalog-card${isSelected ? ' is-selected' : ''}${
                          !isAvailable ? ' is-locked' : ''
                        }`}
                      >
                        <span className="rp-catalog-title">
                          {!isAvailable && <Lock className="rp-catalog-lock" />}
                          {definition.title}
                        </span>
                        <span className="rp-catalog-desc">
                          {isAvailable ? definition.description : definition.unavailableReason}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- selected report ---- */}
      <div className="panel-card">
        <div className="pc-head">
          <h3>{selected?.title}</h3>
          <span className="pc-right" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            {selectedRange.from} – {selectedRange.to}
            {report ? ` · ${report.rows.length} row${report.rows.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        <div className="pc-body tight">
          {report?.note && (
            <div
              className="rp-notice"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                margin: '10px 0',
                padding: '9px 12px',
                borderRadius: 'var(--r)',
                fontSize: 11.5,
                lineHeight: 1.5,
              }}
            >
              <Info style={{ width: 14, height: 14, flex: 'none', marginTop: 1 }} />
              <span>{report.note}</span>
            </div>
          )}
          {callStats.isQueueBreakdownSampled && report && (
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--ink-4)' }}>
              Counted from the most recent {callStats.sampledRowCount} of {callStats.totalCount}{' '}
              calls in this range.
            </p>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader variant="blue" size="md" />
            </div>
          ) : (
            <div className="rp-table-wrap" style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  minWidth: 'max-content',
                  borderCollapse: 'collapse',
                  fontSize: 12.5,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {report?.head.map((heading) => (
                      <th
                        key={heading}
                        style={{
                          whiteSpace: 'nowrap',
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '.09em',
                          textTransform: 'uppercase',
                          color: 'var(--rp-muted)',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report?.rows.length ? (
                    report.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} style={{ borderBottom: '1px solid var(--line-2)' }}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={cellIndex === 0 ? undefined : 'num'}
                            style={{
                              whiteSpace: 'nowrap',
                              padding: '8px 12px',
                              fontWeight: cellIndex === 0 ? 700 : 500,
                              color: cellIndex === 0 ? 'var(--rp-ink)' : '#334155',
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={report?.head.length || 1}
                        style={{
                          padding: '28px 12px',
                          textAlign: 'center',
                          color: 'var(--ink-4)',
                        }}
                      >
                        No data in this range
                      </td>
                    </tr>
                  )}
                  {report?.total && report.rows.length ? (
                    <tr className="rp-total-row" style={{ fontWeight: 800 }}>
                      {report.total.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={cellIndex === 0 ? undefined : 'num'}
                          style={{
                            whiteSpace: 'nowrap',
                            padding: '8px 12px',
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---- existing full report pages ---- */}
      <div className="panel-card">
        <div className="pc-head">
          <h3>Open a full report page</h3>
        </div>
        <div className="pc-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {LINKED_REPORTS.map((group) => (
            <div key={group.group}>
              <div className="sect-title" style={{ marginBottom: 7 }}>
                {group.group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {group.reports.map((linked) => (
                  <button
                    type="button"
                    key={linked.title}
                    className="btn ghost sm"
                    onClick={() => setOpenReport(linked)}
                  >
                    {linked.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(openReport)} onOpenChange={(open) => !open && setOpenReport(null)}>
        <DialogContent className="flex h-[85vh] max-w-6xl flex-col overflow-hidden p-0">
          <DialogHeader className="px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <DialogTitle>{openReport?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {openReport && (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Loader variant="blue" size="md" />
                  </div>
                }
              >
                <openReport.Component />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReportsTab;
