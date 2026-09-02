import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import CustomAvatar from '@/components/custom/custom-avatar';
import CustomTooltip from '@/components/custom/custom-tooltip';
import { Search } from 'lucide-react';

/**
 * The Live Call Console.
 *
 * A monitoring wall rather than a records table: a strip of counts across the
 * top, then one row per live call carrying who is calling, how long it has
 * run, the path it took and who is on it.
 *
 * Every figure here is derived from the live-calls feed the page already
 * receives. Call quality is the exception and is deliberately rendered as
 * unavailable — the feed carries no MOS or quality score, and a monitoring
 * screen inventing one would be worse than a screen admitting it has none.
 * The same goes for the trend sparklines in the reference design: they need
 * history this page does not receive, so they are absent rather than faked.
 */

type CallRowState = 'connected' | 'ringing' | 'hold' | 'waiting' | 'critical';

const STATE_EDGE: Record<CallRowState, string> = {
  connected: 'var(--live)',
  ringing: 'var(--accent)',
  hold: 'var(--hold)',
  waiting: 'var(--warn)',
  critical: 'var(--crit)',
};

const STATE_LABEL: Record<CallRowState, string> = {
  connected: 'Connected',
  ringing: 'Ringing',
  hold: 'On hold',
  waiting: 'Waiting',
  critical: 'Waiting',
};

/** The line under the status chip: what the call is doing, in two words. */
const STATE_NOTE: Record<CallRowState, string> = {
  connected: 'Live',
  ringing: 'Ringing',
  hold: 'Held',
  waiting: 'In queue',
  critical: 'In queue',
};

const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

/** `demo-queue-support` → `Support`; anything unrecognisable is left alone. */
const prettyQueue = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^demo-/, '')
    .replace(/^queue[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\buuid\b/gi, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export type LiveCallListProps = {
  calls: any[];
  columns: ColumnDef<any>[];
  getState: (call: any) => CallRowState;
  /** Resolves an agent's display name from their extension. */
  getAgentName: (extension?: string) => string;
  isAgentOnline: (extension?: string) => boolean;
  startedAt: (call: any) => number | null;
};

const LiveCallList = ({
  calls,
  columns,
  getState,
  getAgentName,
  isAgentOnline,
  startedAt,
}: LiveCallListProps) => {
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState('all');

  /* TanStack cell renderers here only read `row.original`, so a shim with
     that one field is enough to reuse them outside their table. The action
     buttons carry monitor locks, dialpad checks and socket hangups — none of
     that is restated in this file. */
  const cell = (header: string, call: any): ReactNode => {
    const column: any = columns.find((candidate: any) => candidate?.header === header);
    if (!column?.cell) return null;
    return column.cell({ row: { original: call } });
  };

  const routes = useMemo(() => {
    const names = new Set<string>();
    calls.forEach((call) => {
      const name = prettyQueue(call?.forward_value || call?.queue_uuid);
      if (name) names.add(name);
    });
    return [...names].sort();
  }, [calls]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return calls.filter((call) => {
      const queue = prettyQueue(call?.forward_value || call?.queue_uuid);
      if (route !== 'all' && queue !== route) return false;
      if (!needle) return true;

      return [
        call?.contact_name,
        call?.caller_number,
        call?.caller_id_number,
        call?.did_number,
        queue,
        getAgentName(call?.agent_extension),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [calls, query, route, getAgentName]);

  /* The counts across the top, all of them read off the same feed as the
     rows beneath — so the strip can never disagree with the list. */
  const stats = useMemo(() => {
    const now = Date.now();
    const waiting = calls.filter((call) => String(call?.status || '').toLowerCase() === 'waiting');
    const active = calls.filter((call) => String(call?.status || '').toLowerCase() !== 'waiting');

    const durations = active.map((call) => {
      const began = startedAt(call);
      return began ? now - began : 0;
    });
    const meanMs = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;

    const waits = waiting.map((call) => {
      const began = startedAt(call);
      return began ? now - began : 0;
    });
    const longestWaitMs = waits.length ? Math.max(...waits) : 0;

    return {
      active: active.length,
      waiting: waiting.length,
      meanDuration: formatElapsed(meanMs),
      longestWait: waits.length ? formatElapsed(longestWaitMs) : '--:--',
    };
  }, [calls, startedAt]);

  return (
    <div className="mcm-console">
      <div className="mcm-console-stats">
        <StatCard tone="live" label="Active calls" value={String(stats.active)} note="In progress" />
        <StatCard tone="warn" label="Waiting calls" value={String(stats.waiting)} note="In queue" />
        <StatCard
          tone="hold"
          label="Average duration"
          value={stats.meanDuration}
          note="Connected calls"
        />
        <StatCard
          tone="muted"
          label="Call quality"
          value="—"
          note="Not available"
          unavailable
          explain="The live-calls feed carries no MOS or quality score, so there is nothing to show here yet."
        />
      </div>

      <div className="mcm-console-panel">
        <div className="mcm-console-head">
          <div className="mcm-console-heading">
            <span className="mcm-console-dot" aria-hidden="true" />
            <div>
              <h3 className="mcm-console-title">Live Call Console</h3>
              <p className="mcm-console-subtitle">Real-time call monitoring</p>
            </div>
          </div>

          <div className="mcm-console-tools">
            <select
              className="mcm-console-select"
              value={route}
              onChange={(event) => setRoute(event.target.value)}
              aria-label="Filter by route"
            >
              <option value="all">All routes</option>
              {routes.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <div className="mcm-console-search">
              <Search className="h-4 w-4 shrink-0 text-mcm-ink-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search calls..."
                aria-label="Search calls"
              />
            </div>
          </div>
        </div>

        <table className="mcm-console-table">
          {/* Actions is 214px, not 190: its five controls measure 206px and
              cannot compress, so at 190 the last button was clipped and the
              whole table overflowed by exactly the 16px shortfall — a
              horizontal scrollbar for one hidden button. The percentages
              below give back the difference. */}
          <colgroup>
            <col style={{ width: '23%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '214px' }} />
          </colgroup>

          <thead>
            <tr>
              <th>Caller</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Route</th>
              <th>Agent</th>
              <th>Quality</th>
              <th className="is-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {visible.map((call: any) => {
              const state = getState(call);
              const began = startedAt(call);
              const caller = call?.contact_name || 'Unknown caller';
              const number = call?.caller_number || call?.caller_id_number || '';
              const queue = prettyQueue(call?.forward_value || call?.queue_uuid);
              const extension = call?.agent_extension;
              const agent = extension ? getAgentName(extension) : '';

              return (
                <tr
                  key={call?._id}
                  className={`is-${state}`}
                  style={{ ['--row-edge' as any]: STATE_EDGE[state] }}
                >
                  <td>
                    <div className="mcm-console-caller">
                      <CustomAvatar name={caller} size="36" />
                      <div className="min-w-0">
                        <p className="mcm-console-caller-name">{caller}</p>
                        <p className="mcm-console-caller-number">{number}</p>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className={`mcm-console-chip is-${state}`}>{STATE_LABEL[state]}</span>
                    <span className="mcm-console-note">{STATE_NOTE[state]}</span>
                  </td>

                  <td>
                    <span className="mcm-console-timer">
                      {began ? formatElapsed(Date.now() - began) : '--:--'}
                    </span>
                    <span className="mcm-console-note">MM:SS</span>
                  </td>

                  <td>
                    <div className="mcm-console-route">
                      <span className="mcm-console-hop">
                        {String(call?.direction || 'inbound').toLowerCase() === 'inbound'
                          ? 'Inbound'
                          : 'Outbound'}
                      </span>
                      {queue ? (
                        <>
                          <span className="mcm-console-arrow">→</span>
                          <span className="mcm-console-hop">{queue}</span>
                        </>
                      ) : null}
                      <span className="mcm-console-arrow">→</span>
                      <span className={`mcm-console-hop ${agent ? 'is-end' : 'is-pending'}`}>
                        {agent || 'Unassigned'}
                      </span>
                    </div>
                  </td>

                  <td>
                    {agent ? (
                      <>
                        <p className="mcm-console-agent">{agent}</p>
                        <p className="mcm-console-note">
                          Ext. {extension}
                          {isAgentOnline(extension) ? ' · Online' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="mcm-console-note">Waiting for agent</p>
                    )}
                  </td>

                  <td>
                    {/* Deliberately empty of a value. See the file header:
                        there is no quality figure in the feed, and a
                        monitoring screen must not invent one. */}
                    <CustomTooltip text="Call quality is not reported by the calling platform yet">
                      <span className="mcm-console-quality">—</span>
                    </CustomTooltip>
                  </td>

                  <td className="is-right">{cell('Actions', call)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="mcm-console-empty">
            <p className="mcm-console-empty-title">
              {calls.length === 0 ? 'No active calls at the moment' : 'No calls match this filter'}
            </p>
            <p className="mcm-console-empty-note">
              {calls.length === 0
                ? 'Only ringing or answered calls are displayed here.'
                : 'Try a different route or clear the search.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({
  tone,
  label,
  value,
  note,
  unavailable = false,
  explain,
}: {
  tone: 'live' | 'warn' | 'hold' | 'muted';
  label: string;
  value: string;
  note: string;
  unavailable?: boolean;
  explain?: string;
}) => {
  const card = (
    <div className={`mcm-stat is-${tone}${unavailable ? ' is-unavailable' : ''}`}>
      <div className="mcm-stat-body">
        <p className="mcm-stat-label">{label}</p>
        <p className="mcm-stat-value">{value}</p>
        <p className="mcm-stat-note">{note}</p>
      </div>
    </div>
  );

  return explain ? <CustomTooltip text={explain}>{card}</CustomTooltip> : card;
};

export default LiveCallList;
