import React, { useMemo } from 'react';
import moment from 'moment';
import { PhoneIncoming, PhoneOutgoing, Wifi, WifiOff, Radio } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { USER_ACTIVITY_CONST, RangeDate, Activity } from './constant';

interface ActivityTimeStripsProps {
  activityDetails: RangeDate;
  timings: string[];
  activities: Array<{ activity: Activity[] }>;
  activityType: { value: string };
  expandedItem: string | null;
  setExpandedItem: (value: string | null) => void;
}

type FeedKind = 'call_in' | 'call_out' | 'online' | 'offline' | 'other';

type FeedItem = {
  id: string;
  kind: FeedKind;
  label: string;
  startedAt: moment.Moment;
  durationMin?: number;
  device?: { device_type?: string; ip_address?: string; browser_version?: string; os_version?: string };
};

const TONE: Record<FeedKind, { ring: string; text: string; chip: string }> = {
  call_in: { ring: 'ring-amber-200', text: 'text-amber-500', chip: 'bg-amber-50 text-amber-600' },
  call_out: { ring: 'ring-emerald-200', text: 'text-emerald-500', chip: 'bg-emerald-50 text-emerald-600' },
  online: { ring: 'ring-cyan-200', text: 'text-cyan-500', chip: 'bg-cyan-50 text-cyan-600' },
  offline: { ring: 'ring-rose-200', text: 'text-rose-500', chip: 'bg-rose-50 text-rose-500' },
  other: { ring: 'ring-gray-200', text: 'text-gray-400', chip: 'bg-gray-50 text-gray-500' },
};

const FEED_ICON: Record<FeedKind, React.ComponentType<{ className?: string }>> = {
  call_in: PhoneIncoming,
  call_out: PhoneOutgoing,
  online: Wifi,
  offline: WifiOff,
  other: Radio,
};

const FeedRow = ({ item }: { item: FeedItem }) => {
  const tone = TONE[item.kind];
  const Icon = FEED_ICON[item.kind];

  return (
    <div className="relative flex items-start gap-3.5 group">
      <div
        className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white ring-[3px] ${tone.ring} shadow-[0_2px_8px_rgba(15,23,42,0.08)] shrink-0 transition-transform group-hover:scale-105`}
      >
        <Icon className={`w-4.5 h-4.5 ${tone.text}`} />
      </div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all duration-150 group-hover:border-orange-100 group-hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)] group-hover:-translate-y-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{item.label}</span>
            {typeof item.durationMin === 'number' && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tone.chip}`}>
                {item.durationMin} min
              </span>
            )}
          </div>
          {item.device?.device_type && (
            <div className="text-[11px] text-gray-400 mt-0.5 truncate">
              {item.device.device_type}
              {item.device.browser_version ? ` · ${item.device.browser_version}` : ''}
              {item.device.ip_address ? ` · ${item.device.ip_address}` : ''}
            </div>
          )}
        </div>
        <div className="text-xs font-semibold text-gray-400 whitespace-nowrap shrink-0">
          {item.startedAt.format('hh:mm A')}
        </div>
      </div>
    </div>
  );
};

const ActivityTimeStrips = ({
  activityDetails,
  timings,
  activities,
  activityType,
  expandedItem,
  setExpandedItem,
}: ActivityTimeStripsProps) => {
  const targetDate = useMemo(
    () => moment.parseZone(activityDetails?.date)?.format('DD-MM-YYYY'),
    [activityDetails?.date],
  );

  /* `timings` is the hour-label list the start/end time pickers above
     narrowed the day down to (e.g. 12:00AM–8:00AM) — the old hour-by-hour
     grid only ever rendered rows for those hours, so this feed has to
     apply the same cutoff itself now that it isn't going hour-by-hour. */
  const allowedHours = useMemo(
    () => new Set((timings || []).map((t) => moment(t, 'hh:mm A')?.format('HH'))),
    [timings],
  );

  const filteredActivities = useMemo(() => {
    const filterByType = (activity: Activity) => {
      if (activityType?.value === USER_ACTIVITY_CONST?.CALL) {
        return [USER_ACTIVITY_CONST?.CALL_STARTS, USER_ACTIVITY_CONST?.CALL_END]?.includes(
          activity?.activity,
        );
      }
      if (activityType?.value === USER_ACTIVITY_CONST?.SESSION) {
        return [USER_ACTIVITY_CONST?.ONLINE, USER_ACTIVITY_CONST?.OFFLINE]?.includes(
          activity?.activity,
        );
      }
      return activityType?.value === USER_ACTIVITY_CONST?.ALL;
    };

    return (
      activities
        ?.flatMap((data) =>
          data?.activity?.filter((val: Activity) => {
            const activityMoment = moment.parseZone(val?.timestamp);
            const activityDate = activityMoment?.format('DD-MM-YYYY');
            return (
              targetDate === activityDate &&
              (!allowedHours.size || allowedHours.has(activityMoment?.format('HH'))) &&
              filterByType(val)
            );
          }),
        )
        ?.sort(
          (a, b) => moment.parseZone(a?.timestamp).valueOf() - moment.parseZone(b?.timestamp).valueOf(),
        ) ?? []
    );
  }, [activities, targetDate, activityType?.value, allowedHours]);

  /* A raw call_start/call_end pair reads as two disconnected events on a
     feed — merging each start with the call_end right after it into one
     "Inbound/Outbound call · N min" row is what actually makes a vertical
     feed readable instead of doubling every call. An end with no start (or
     a start with no end, e.g. a call still running) still gets its own row
     rather than being silently dropped. */
  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];
    let openCall: Activity | null = null;

    filteredActivities.forEach((activity) => {
      if (activity?.activity === USER_ACTIVITY_CONST?.CALL_STARTS) {
        openCall = activity;
        return;
      }

      if (activity?.activity === USER_ACTIVITY_CONST?.CALL_END) {
        const start = openCall as Activity | null;
        openCall = null;
        const isOutbound = start?.data?.Direction === 'initiator';
        items.push({
          id: start?.id || activity?.id,
          kind: isOutbound ? 'call_out' : 'call_in',
          label: isOutbound ? 'Outbound call' : 'Inbound call',
          startedAt: moment.parseZone(start?.timestamp || activity?.timestamp),
          durationMin: start
            ? Math.max(1, moment.parseZone(activity?.timestamp).diff(moment.parseZone(start.timestamp), 'minutes'))
            : undefined,
        });
        return;
      }

      if (activity?.activity === USER_ACTIVITY_CONST?.ONLINE) {
        items.push({
          id: activity?.id,
          kind: 'online',
          label: 'Came online',
          startedAt: moment.parseZone(activity?.timestamp),
          device: activity?.data?.[0],
        });
        return;
      }

      if (activity?.activity === USER_ACTIVITY_CONST?.OFFLINE) {
        items.push({
          id: activity?.id,
          kind: 'offline',
          label: 'Went offline',
          startedAt: moment.parseZone(activity?.timestamp),
          device: activity?.data?.[0],
        });
        return;
      }

      items.push({
        id: activity?.id,
        kind: 'other',
        label: activity?.data?.forward_type || activity?.activity,
        startedAt: moment.parseZone(activity?.timestamp),
      });
    });

    if (openCall) {
      const start = openCall as Activity;
      const isOutbound = start?.data?.Direction === 'initiator';
      items.push({
        id: start?.id,
        kind: isOutbound ? 'call_out' : 'call_in',
        label: isOutbound ? 'Outbound call' : 'Inbound call',
        startedAt: moment.parseZone(start?.timestamp),
      });
    }

    return items;
  }, [filteredActivities]);

  const handleAccordionChange = (value: string) => {
    setExpandedItem(value === activityDetails?.id ? value : null);
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={expandedItem === activityDetails?.id ? activityDetails?.id : ''}
      onValueChange={handleAccordionChange}
    >
      <AccordionItem
        value={activityDetails?.id}
        className="border-0 rounded-2xl bg-white mb-4 shadow-[0_6px_24px_rgba(15,23,42,0.07)] ring-1 ring-gray-100 overflow-hidden"
      >
        <AccordionTrigger className="flex items-center p-0 hover:no-underline">
          <div className="flex items-center justify-between w-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-400 px-4 py-3.5">
            <span className="inline-flex items-center bg-white/95 text-gray-900 text-xs font-bold px-3 py-1 rounded-full shadow-sm tracking-wide">
              {activityDetails?.label}
            </span>
            <span className="text-[11px] font-semibold text-white bg-white/20 px-2.5 py-1 rounded-full">
              {feedItems.length} {feedItems.length === 1 ? 'event' : 'events'}
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-4 sm:p-5">
          {feedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-300">
              <Radio className="w-7 h-7" />
              <span className="text-xs font-medium">No activity recorded</span>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-orange-200 via-gray-200 to-transparent" />
              <div className="space-y-3">
                {feedItems.map((item) => (
                  <FeedRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default React.memo(ActivityTimeStrips);
