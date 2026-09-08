import { Hourglass, MoveDownLeft, MoveUpRight } from 'lucide-react';
import ReportsPageLayout from '../reports-content-layout';
import { NotificationLine } from '@/assets/icons';
import { Switch } from '@/components/ui/switch';
import { Pie, PieChart, PieProps, Tooltip } from 'recharts';
import { CartesianGrid, LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import DateDropdown from '@/components/custom/date-dropdown';
import { dropdownCallInitialValForCustom } from '@/components/custom/date-dropdown/constant';
import { useQuery } from '@tanstack/react-query';
import { callLogAnalyticsData } from '@/services/api';
import { useAnimatedNumber } from '@/pages/performance/use-animated-number';
import './analytics-theme.css';

/* One triad for the three series, defined once and read by both the lines
   and the legend beside them — a legend whose swatch doesn't match its
   line is worse than no legend. Orange is the brand's own accent
   (incoming, the primary volume), teal reads as clearly distinct against
   a warm palette without fighting it, and missed keeps a red because
   that's the one series where the colour is carrying meaning. */
const SERIES = [
  { key: 'Incoming', color: '#e4741b' },
  { key: 'Outgoing', color: '#2a9d8f' },
  { key: 'Missed', color: '#d64545' },
];

const GAP = 120;
/* The arc's centre has to be the centre of the SVG box, because the
   "91% / ANSWERED" label is centred on that box by CSS (`.ca-dial-value`,
   top/left 50%). They were 15px apart — the box was 170 tall (centre 85)
   while the arc was drawn at cy 100 — which read as the text sitting high
   inside the ring. Deriving both from the same two numbers is what keeps
   them from drifting apart again. */
const DIAL_WIDTH = 200;
const DIAL_HEIGHT = 170;
const DIAL_CX = DIAL_WIDTH / 2;
const DIAL_CY = DIAL_HEIGHT / 2;

const HalfPie = (props: PieProps & { percentage: number }) => {
  const chartData = [
    /* Was `#000000` — a pure-black arc on a cream card, the one element
       on this screen that belonged to no palette at all. */
    { value: props?.percentage, fill: '#e4741b' },
    { value: 100 - props?.percentage, fill: '#f5e6d3' },
  ];
  return (
    <Pie
      {...props}
      stroke="none"
      dataKey="value"
      data={chartData}
      cx={DIAL_CX}
      cy={DIAL_CY}
      cornerRadius={3} // rounded arc
      paddingAngle={0}
      innerRadius={58}
      outerRadius={74}
      startAngle={180 + GAP / 2} // 240
      endAngle={0 - GAP / 2} // -60
    />
  );
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="ca-tooltip">
      <div className="ca-tooltip-label">{label}</div>
      {payload.map((entry: any) => (
        <div className="ca-tooltip-row" key={entry.dataKey}>
          <span className="ca-legend-dot" style={{ background: entry.color }} />
          {entry.dataKey}
          <b>{entry.value}</b>
        </div>
      ))}
    </div>
  );
};

const MetricTile = ({
  icon,
  label,
  value,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  max: string;
}) => (
  <div className="ca-card ca-tile">
    <div className="ca-tile-left">
      <span className="ca-tile-icon">{icon}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="ca-tile-label">{label}</span>
        <span className="ca-tile-value">{value}</span>
      </div>
    </div>
    <span className="ca-tile-max">
      <b>Max</b>
      {max}
    </span>
  </div>
);

const CallAnalytics = () => {
  const [dropdownVal, setDropdownVal] = useState(dropdownCallInitialValForCustom);

  const getPayload = () => {
    const type = dropdownVal?.date_type;
    if (type === 'Yesterday' || type === 'Today') {
      return { type: 'day', date: dropdownVal?.value?.from };
    } else if (type === 'Last 7 Days') {
      return { type: 'week' };
    } else if (type === 'Last 30 Days' || type === 'This Month' || type === 'Last Month') {
      return { type: 'month' };
    } else {
      return { type: 'custom', from: dropdownVal?.value?.from, to: dropdownVal?.value?.to };
    }
  };

  const { data } = useQuery({
    queryKey: [
      'callLogAnalyticsData',
      dropdownVal?.date_type,
      dropdownVal?.value?.from,
      dropdownVal?.value?.to,
    ],
    queryFn: () => callLogAnalyticsData(getPayload()),
    select: (data) => data?.data?.data?.result || {},
  });

  const summary = data?.summary || {};
  const chartData = data?.chartData || [];
  /* Counts the dial's figure up to its value on load and on every range
     change. 1500ms to match Recharts' own default arc animation beside
     it, so the number and the arc land together instead of one finishing
     visibly first. The hook already snaps instead of animating under
     reduced-motion or in a hidden tab. */
  const animatedServiceLevel = useAnimatedNumber(Number(summary?.serviceLevel) || 0, 1500);
  const hasChartData = chartData.some((row: any) =>
    SERIES.some(({ key }) => Number(row?.[key]) > 0),
  );

  const Filters = (
    // `rp-date-standalone` (date-picker-theme.css) — `.mcm-date-preset`'s
    // default look (round-left/square-right, transparent background) is
    // built for sitting as the first segment of Performance's own fused
    // Today+Division+Media pill; used bare like this, with nothing beside
    // it, that read as a half-rounded, half-square, near-invisible
    // control instead of one clean shape.
    <div className="flex gap-2 rp-date-standalone">
      <DateDropdown
        {...{
          dropdownVal,
          setDropdownVal,
        }}
      />
    </div>
  );

  return (
    <ReportsPageLayout filters={Filters}>
      <div className="ca-report">
        <div className="ca-top">
          <div className="ca-card ca-dial">
            <span className="ca-card-title">Service level</span>
            <div className="ca-dial-chart">
              <PieChart width={DIAL_WIDTH} height={DIAL_HEIGHT}>
                <HalfPie isAnimationActive={true} percentage={summary?.serviceLevel || 0} />
                <Tooltip defaultIndex={0} content={() => null} active />
              </PieChart>
              <div className="ca-dial-value">
                <span className="ca-dial-number">{Math.round(animatedServiceLevel)}%</span>
                <span className="ca-dial-caption">answered</span>
              </div>
            </div>
            <div className="ca-dial-foot">
              <span>Processed calls</span>
              <Switch defaultChecked />
            </div>
          </div>

          <div className="ca-tiles">
            <MetricTile
              icon={<MoveDownLeft />}
              label="Incoming ACD"
              value={summary?.incomingACD || '0 s'}
              max={summary?.maxIncomingACD || '—'}
            />
            <MetricTile
              icon={<MoveUpRight />}
              label="Outgoing ACD"
              value={summary?.outgoingACD || '0 s'}
              max={summary?.maxOutgoingACD || '—'}
            />
            <MetricTile
              icon={<Hourglass />}
              label="Wait time"
              value={summary?.waitTime || '0 s'}
              max={summary?.maxWaitTime || '—'}
            />
            <MetricTile
              icon={<NotificationLine />}
              label="Avg. processing time"
              value={summary?.avgProcessingTime || '0 s'}
              max={summary?.maxProcessingTime || '—'}
            />
          </div>
        </div>

        <div className="ca-card ca-chart">
          <div className="ca-chart-head">
            <span className="ca-card-title">Call volume trend</span>
            <div className="ca-legend">
              {SERIES.map(({ key, color }) => (
                <span className="ca-legend-item" key={key}>
                  <span className="ca-legend-dot" style={{ background: color }} />
                  {key}
                </span>
              ))}
            </div>
          </div>
          <div className="ca-chart-body">
            {hasChartData ? (
              <ResponsiveContainer width="100%" height={240}>
                {/* `left: -18` used to pull the plot area outward to reclaim
                    the Y axis's empty gutter, but it dragged the Y ticks
                    into the X ticks — the "0" and the first date label
                    collided in the origin corner. The axis keeps its own
                    width instead, and both sets of ticks get a little
                    margin off their line. */}
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                    tickMargin={10}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={38}
                    tickMargin={8}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(242,153,74,0.35)' }} />
                  {SERIES.map(({ key, color }) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 2.5, strokeWidth: 0, fill: color }}
                      activeDot={{ r: 4.5, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="ca-empty">No calls in this range</div>
            )}
          </div>
        </div>
      </div>
    </ReportsPageLayout>
  );
};

export default CallAnalytics;
