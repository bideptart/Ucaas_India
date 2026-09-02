import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import TuiCalendar, { TZDate } from 'tui-calendar';
import moment from 'moment';
import './styles.css';
import { Button } from '@/components/ui/button';
import { CalendarProps, CalendarRef, SYNC_BUTTON_LABELS } from './constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disconnectWithGoogleAndOutlook,
  getCalendarAccessToken,
  syncWithGoogleAndOutlook,
} from '@/services/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from 'react-router-dom';
import { Icon } from '@/assets/icons/icon';
import AlertConfirm from '../alert-confirm';
import { capitalizeFirstLetter } from '@/lib/utils';
import { calendarFilterType } from '@/pages/video-meetings/Calender/constants';
import { useUser } from '@/hooks/use-user';

const CustomTuiCalendar = forwardRef<CalendarRef, CalendarProps>(
  (
    {
      // height = '760px',
      calendars = [],
      schedules = [],
      suppressNextCreationRef,
      showFilters = false,
      showMenu = false,
      onBeforeCreateSchedule = () => false,
      onBeforeUpdateSchedule = () => false,
      onBeforeDeleteSchedule = () => false,
      handleCategoryFilter = () => false,
      category,
      onRangeChange,
      onCurrentDateChange,
      useInternalDetailsPopup = true,
      onScheduleClick,
      ...rest
    },
    ref,
  ) => {
    const objectRef = ref as React.RefObject<CalendarRef>;
    const calendarInstRef = useRef<any | null>(null);
    const tuiRef = useRef<HTMLDivElement | any>(null);
    const wrapperRef = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const [renderRange, setRenderRange] = useState('');
    const [workweek, setWorkweek] = useState(true);
    const [type, setType] = useState('Monthly');
    const [filterSchedules, setFilterSchedules] = useState(schedules);
    const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
    const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
    const [copiedLink, setCopiedLink] = useState(false);
    const [syncButtonClicked, setSyncButtonClicked] = useState<string | null>(null);
    const [openConfirmModal, setOpenConfirmModal] = useState(false);
    const { user } = useUser();
    const userId = user?.user_info?.uuid || '';

    const queryClient: any = useQueryClient();
    const handleCopy = () => {
      if (selectedSchedule?.body) {
        navigator.clipboard.writeText(selectedSchedule?.body);
        setCopiedLink(true);

        setTimeout(() => {
          setCopiedLink(false);
        }, 3000);
      }
    };
    const handleScheduleClick = (schedule: any, mouseEvent: MouseEvent) => {
      setSelectedSchedule(schedule);
      setPopoverPosition({ x: mouseEvent.pageX, y: mouseEvent.pageY });
    };
    const getScheduleDate = (value: any) => {
      if (!value) return null;
      if (typeof value?.toDate === 'function') return value.toDate();
      return value instanceof Date ? value : new Date(value);
    };
    const openScheduleDetails = (schedule: any) => {
      if (!schedule) return;
      const instance = calendarInstRef.current;
      const normalizedSchedule =
        instance?.getSchedule?.(schedule.id, schedule.calendarId) || schedule;
      const container = tuiRef.current as HTMLDivElement | null;
      const rect = container?.getBoundingClientRect();
      const x = rect ? rect.left + window.scrollX + rect.width * 0.6 : window.scrollX + 300;
      const y = rect ? rect.top + window.scrollY + 160 : window.scrollY + 200;

      setSelectedSchedule(normalizedSchedule);
      setPopoverPosition({ x, y });
    };
    const { data: accessToken = {}, isLoading } = useQuery({
      queryKey: ['getCalendarAccessToken'],
      queryFn: () => getCalendarAccessToken(),
      select: (data) => data?.data?.data?.result || {},
    });
    const { google: googleAccessToken = false, outlook: outlookAccessToken = false } =
      accessToken || {};

    const { mutate: mutateDisconnect, isPending } = useMutation({
      mutationKey: ['disconnectWithGoogleAndOutlook'],
      mutationFn: disconnectWithGoogleAndOutlook,
      onSuccess: () => {
        setSyncButtonClicked(null);
        setOpenConfirmModal(false);
        queryClient.invalidateQueries(['getCalendarAccessToken'], { exact: true });
      },
    });
    const { mutateAsync: syncWith } = useMutation({
      mutationKey: ['syncWithGoogleAndOutlook'],
      mutationFn: syncWithGoogleAndOutlook,
      onSettled: () => setSyncButtonClicked(null),
    });

    useImperativeHandle(ref, () => ({
      getAlert() {
        alert('getAlert from Child');
      },
      suppressNextCreation() {
        suppressNextCreationRef.current = true;
      },
      createSchedule,
      updateSchedule,
      deleteSchedule,
      openScheduleDetails,
      setCurrentDate,
      refreshCalendar,
    }));

    /**
     * How many events and tasks fall on each day, keyed 'YYYY-MM-DD'.
     *
     * A ref rather than state because the calendar's templates are handed to
     * the library once at construction; a closure over state would keep
     * reading the first render's value forever. The ref is refreshed
     * whenever the schedules change, just before asking for a re-render.
     */
    const dayCountsRef = useRef<Map<string, { event: number; task: number }>>(new Map());

    useEffect(() => {
      const counts = new Map<string, { event: number; task: number }>();

      (schedules || []).forEach((schedule: any) => {
        const start = moment(
          schedule?.start?.toDate ? schedule.start.toDate() : schedule?.start,
        ).startOf('day');
        if (!start.isValid()) return;

        const rawEnd = moment(schedule?.end?.toDate ? schedule.end.toDate() : schedule?.end).startOf(
          'day',
        );
        /* Anything spanning midnight counts on every day it covers. The
           guard stops a corrupted end date spinning here. */
        const end = rawEnd.isValid() && rawEnd.isAfter(start) ? rawEnd : start;
        const kind =
          String(schedule?.raw?.category || '').toUpperCase() === 'TASK' ? 'task' : 'event';

        const cursor = start.clone();
        let guard = 0;
        while (cursor.isSameOrBefore(end, 'day') && guard < 366) {
          const key = cursor.format('YYYY-MM-DD');
          const entry = counts.get(key) || { event: 0, task: 0 };
          entry[kind] += 1;
          counts.set(key, entry);
          cursor.add(1, 'day');
          guard += 1;
        }
      });

      dayCountsRef.current = counts;
      calendarInstRef.current?.render?.();
    }, [schedules]);

    useEffect(() => {
      const container = tuiRef.current;
      if (!container) return;

      if (!calendarInstRef.current) {
        const instance = new TuiCalendar(container, {
          useDetailPopup: false,
          useCreationPopup: false,
          defaultView: 'month',
          taskView: false,
          scheduleView: ['time'],
          calendars,
          /* One preview per day. Enough to say what the day holds without a
             busy cell stacking four clipped titles; anything beyond it is
             reached through the day itself. */
          month: { visibleScheduleCount: 1 },
          template: {
            /* A dot, the title, and the time beneath it. */
            time: (schedule) => {
              const title = schedule?.title || '';
              const startDate = (schedule?.start as TZDate)?.toDate();
              const startTime = startDate ? moment(startDate).format('hh:mm A') : '';
              const category = String(schedule?.raw?.category || '').toUpperCase();
              const kind =
                category === 'TASK' ? 'task' : category === 'MEETING' ? 'meeting' : 'event';

              return `<span class="mcm-evt is-${kind}">
                  <span class="mcm-evt-line">
                    <i class="mcm-evt-dot"></i>
                    <span class="mcm-evt-title">${title}</span>
                  </span>
                  ${startTime ? `<span class="mcm-evt-time">${startTime}</span>` : ''}
                </span>`;
            },
            /* The date number on its own. The count pill that used to sit
               here is gone — the cell now previews the day's first entry
               instead, which says more than a tally did. */
            monthGridHeader: (model: any) => {
              /* `model.ymd` is `YYYYMMDD` in this version, not `YYYY-MM-DD`.
                 Parsing it against both shapes and re-formatting is what
                 makes the lookup hit — keyed on the raw value the map never
                 matched, so every day came back empty and no pill rendered.
                 The day number looked right throughout, because moment
                 parses the compact form leniently. */
              const raw =
                model?.ymd || (model?.date?.toDate ? model.date.toDate() : model?.date);
              const parsed = moment(raw, ['YYYY-MM-DD', 'YYYYMMDD', moment.ISO_8601]);
              const ymd = parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
              const dayNumber = parsed.isValid() ? parsed.date() : '';
              const isToday = Boolean(model?.isToday);

              const numberClass = `tui-full-calendar-weekday-grid-date${
                isToday ? ' tui-full-calendar-weekday-grid-date-decorator' : ''
              }`;

              return `<div class="mcm-dayhead" data-ymd="${ymd}">
                  <span class="${numberClass}">${dayNumber}</span>
                </div>`;
            },
            popupDetailDate: (isAllDay, start, end) => {
              const startDate = (start as TZDate).toDate();
              const endDate = (end as TZDate).toDate();
              const isSameDate = moment(startDate).isSame(endDate);
              const endFormat = (isSameDate ? '' : 'YYYY/MM/DD ') + 'HH:mm';
              return isAllDay
                ? `${moment(startDate).format('YYYY/MM/DD')}${isSameDate ? '' : ' - ' + moment(endDate).format('YYYY/MM/DD')}`
                : `${moment(startDate).format('YYYY/MM/DD HH:mm')} - ${moment(endDate).format(endFormat)}`;
            },
            popupDetailBody: (schedule) => {
              const link = schedule.body ?? '#';
              return `Join: <a href="${link}" target="_blank" rel="noopener noreferrer" style="color: blue; font-size:11px;">${link}</a>`;
            },
          },
          ...rest,
        });

        calendarInstRef.current = instance;

        instance.on('beforeCreateSchedule', onBeforeCreateSchedule);
        instance.on('beforeUpdateSchedule', onBeforeUpdateSchedule);
        instance.on('beforeDeleteSchedule', onBeforeDeleteSchedule);
        instance.on('clickSchedule', (event: any) => {
          const { schedule, event: mouseEvent } = event;
          if (useInternalDetailsPopup) {
            handleScheduleClick(schedule, mouseEvent);
          }
          if (typeof onScheduleClick === 'function') {
            onScheduleClick({ schedule, mouseEvent });
          }
        });
        instance.on('clickDayname', (event: any) => {
          if (instance.getViewName() === 'week') {
            instance.setDate(new Date(event.date));
            instance.changeView('day', true);
          }
        });
      }
    }, []);
    useEffect(() => {
      const instance = calendarInstRef.current;
      if (!instance) return;

      instance.clear();
      instance.createSchedules(schedules, true);
      instance.render();
      setRenderRangeText();
    }, [schedules]);
    useEffect(() => {
      return () => {
        if (calendarInstRef.current) {
          calendarInstRef.current.destroy();
          calendarInstRef.current = null;
        }
      };
    }, []);
    useEffect(() => {
      document.addEventListener('click', handleClick, false);
      return () => {
        document.removeEventListener('click', handleClick, false);
      };
    });

    const handleClick = (e: any) => {
      if (wrapperRef.current?.contains(e.target)) {
        return;
      }
      setOpen(false);
    };

    function currentCalendarDate(format: string) {
      const currentDate = moment([
        calendarInstRef.current.getDate().getFullYear(),
        calendarInstRef.current.getDate().getMonth(),
        calendarInstRef.current.getDate().getDate(),
      ]);

      return currentDate.format(format);
    }

    const setRenderRangeText = () => {
      const instance = calendarInstRef.current;
      if (!instance) return;
      const options = calendarInstRef.current.getOptions();
      const viewName = calendarInstRef.current.getViewName();
      let from = '';
      let to = '';
      const html = [];
      /* This string is the page's heading, so it reads as a date rather than
         as a machine format: "12 September 2026" and "September 2026" instead
         of "2026-09-12" and "2026-09". `from`/`to` keep the ISO format — they
         are what the API is queried with. */
      if (viewName === 'day') {
        const date = currentCalendarDate('YYYY-MM-DD');
        html.push(moment(date, 'YYYY-MM-DD').format('D MMMM YYYY'));
        from = to = date;
      } else if (
        viewName === 'month' &&
        (!options.month.visibleWeeksCount || options.month.visibleWeeksCount > 4)
      ) {
        const date = currentCalendarDate('YYYY-MM');
        html.push(moment(date, 'YYYY-MM').format('MMMM YYYY'));
        const start = instance.getDateRangeStart();
        const end = instance.getDateRangeEnd();
        from = moment(start.getTime()).format('YYYY-MM-DD');
        to = moment(end.getTime()).format('YYYY-MM-DD');
      } else {
        const start = instance.getDateRangeStart();
        const end = instance.getDateRangeEnd();
        from = moment(start.getTime()).format('YYYY-MM-DD');
        to = moment(end.getTime()).format('YYYY-MM-DD');
        const startLabel = moment(start.getTime());
        const endLabel = moment(end.getTime());
        /* Within one month the month name only needs saying once:
           "6 – 12 September 2026", not "6 September 2026 – 12 September". */
        html.push(
          startLabel.isSame(endLabel, 'month')
            ? `${startLabel.format('D')} – ${endLabel.format('D MMMM YYYY')}`
            : `${startLabel.format('D MMM')} – ${endLabel.format('D MMM YYYY')}`,
        );
      }
      setRenderRange(html.join(''));
      if (typeof onRangeChange === 'function') {
        onRangeChange({ from, to });
      }
      if (typeof onCurrentDateChange === 'function') {
        onCurrentDateChange(currentCalendarDate('YYYY-MM-DD'));
      }
    };

    function createSchedule(schedule: any) {
      calendarInstRef.current.createSchedules([schedule]);
      const cloneFilterSchedules = [...filterSchedules];
      setFilterSchedules(() => [...cloneFilterSchedules, schedule]);
    }

    function updateSchedule(schedule: any, changes: any) {
      calendarInstRef.current.updateSchedule(schedule.id, schedule.calendarId, changes);
      const cloneFilterSchedules = [...filterSchedules];
      setFilterSchedules(() =>
        cloneFilterSchedules.map((item) => {
          if (item.id === schedule.id) {
            return { ...item, ...changes };
          }
          return item;
        }),
      );
    }

    function deleteSchedule(schedule: any) {
      calendarInstRef.current.deleteSchedule(schedule.id, schedule.calendarId);
      const cloneFilterSchedules = [...filterSchedules];
      setFilterSchedules(() => cloneFilterSchedules.filter((item) => item.id !== schedule.id));
    }
    function setCurrentDate(date: Date) {
      if (!calendarInstRef.current) return;
      calendarInstRef.current.setDate(date);
      setRenderRangeText();
    }
    function refreshCalendar() {
      if (!calendarInstRef.current) return;
      calendarInstRef.current.render();
      setRenderRangeText();
    }

    const handleOutlookOAuthPopup = async (type: string) => {
      setSyncButtonClicked(type);
      if (type === SYNC_BUTTON_LABELS.GOOGLE.google && googleAccessToken) {
        setOpenConfirmModal(true);
        return;
      }
      if (type === SYNC_BUTTON_LABELS.OUTLOOK.outlook && outlookAccessToken) {
        setOpenConfirmModal(true);
        return;
      }
      const response = await syncWith({ type: type });
      const url = response?.data?.data?.result?.[0]?.result;
      if (url) {
        window.location.href = url;
      }
    };
    const validAttendees = Array.isArray(selectedSchedule?.attendees)
      ? selectedSchedule?.attendees?.filter(
          (email: string): email is string => typeof email === 'string' && email.trim() !== '',
        )
      : [];

    const selectedScheduleEndDate = getScheduleDate(selectedSchedule?.end);
    const selectedScheduleStartDate = getScheduleDate(selectedSchedule?.start);
    const isExpired =
      selectedScheduleEndDate !== null ? moment(selectedScheduleEndDate).isBefore(moment()) : false;

    return (
      <div className="w-full">
        <div className="flex flex-col gap-2 px-4 py-3.5">
          {/* Two zones with a wide gap between them, rather than one run of
              items at an even gap. Everything sat in a single line at gap-4 —
              heading, view control, Today, arrows, legend, sync — so nothing
              grouped and the row read as clutter. Now: what you are looking at
              and how you move through it on the left; what you can filter and
              connect on the right. */}
          <div className="mcm-calbar flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-x-8">
            <div className="flex items-center gap-3 flex-wrap">
              {/* The date leads, at heading weight. It used to sit fourth in
                  the row — after the view dropdown, Today and the arrows —
                  styled like a label, so the header had no anchor and read as
                  a strip of controls with a stray date in it. */}
              <h2 className="order-first mr-1 text-xl font-bold tracking-tight text-mcm-ink whitespace-nowrap">
                {renderRange}
              </h2>
              {showMenu && (
                <div className="flex items-center gap-3">
                  {/* Three views, three buttons. As a dropdown you had to open
                      it to find out which view you were in and what the others
                      were; laid out flat, the current one is visible and any
                      other is one click away. */}
                  <div className="mcm-viewswitch" role="group" aria-label="Calendar view">
                    {[
                      { label: 'Day', value: 'Daily', view: 'day' },
                      { label: 'Week', value: 'Weekly', view: 'week' },
                      { label: 'Month', value: 'Month', view: 'month' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={type === option.value}
                        className={`mcm-viewswitch-btn ${type === option.value ? 'is-on' : ''}`}
                        onClick={() => {
                          if (option.view === 'month') {
                            /* The month view needs its week count restored;
                               the other views do not carry the option. */
                            calendarInstRef.current.setOptions(
                              { month: { visibleWeeksCount: 6 } },
                              true,
                            );
                          }
                          calendarInstRef.current.changeView(option.view, true);
                          setType(option.value);
                          setRenderRangeText();
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {/* Weekends is a setting, not a view, so it stays a toggle
                      rather than joining the switch above. */}
                  <button
                    type="button"
                    aria-pressed={workweek}
                    className={`mcm-weekendtoggle ${workweek ? 'is-on' : ''}`}
                    onClick={() => {
                      calendarInstRef.current.setOptions({ month: { workweek } }, true);
                      calendarInstRef.current.setOptions({ week: { workweek } }, true);
                      calendarInstRef.current.changeView(
                        calendarInstRef.current.getViewName(),
                        true,
                      );
                      setWorkweek(!workweek);
                    }}
                  >
                    Weekends
                  </button>

                  <span
                    ref={wrapperRef}
                    style={{ display: 'none' }}
                    /* The old dropdown markup is kept mounted but hidden: the
                       outside-click handler still references this ref. */
                    className={`dropdown ${open ? 'open' : ''}`}
                  >
                    <button
                      id="dropdownMenu-calendarType"
                      className="btn btn-default btn-sm dropdown-toggle"
                      type="button"
                      data-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded={open}
                      onClick={() => setOpen(!open)}
                    >
                      <i
                        id="calendarTypeIcon"
                        className="calendar-icon ic_view_week"
                        style={{ marginRight: '4px' }}
                      />
                      <span id="calendarTypeName">{type}</span>&nbsp;
                      <i className="calendar-icon tui-full-calendar-dropdown-arrow" />
                    </button>
                    <ul
                      className="dropdown-menu !rounded-xl !border-primary"
                      role="menu"
                      aria-labelledby="dropdownMenu-calendarType"
                    >
                      <li role="presentation">
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            calendarInstRef.current.changeView('day', true);
                            setType('Daily');
                            setOpen(false);
                            setRenderRangeText();
                          }}
                          className="dropdown-menu-title"
                          role="menuitem"
                          data-action="toggle-daily"
                        >
                          <i className="calendar-icon ic_view_day" />
                          Daily
                        </div>
                      </li>
                      <li role="presentation">
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            calendarInstRef.current.changeView('week', true);
                            setType('Weekly');
                            setOpen(false);
                            setRenderRangeText();
                          }}
                          className="dropdown-menu-title"
                          role="menuitem"
                          data-action="toggle-weekly"
                        >
                          <i className="calendar-icon ic_view_week" />
                          Weekly
                        </div>
                      </li>
                      <li role="presentation">
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            calendarInstRef.current.setOptions(
                              { month: { visibleWeeksCount: 6 } },
                              true,
                            ); // or null
                            calendarInstRef.current.changeView('month', true);
                            setType('Month');
                            setOpen(false);
                            setRenderRangeText();
                          }}
                          className="dropdown-menu-title"
                          role="menuitem"
                          data-action="toggle-monthly"
                        >
                          <i className="calendar-icon ic_view_month" />
                          Month
                        </div>
                      </li>

                      <li role="presentation" className="dropdown-divider" />
                      <li role="presentation">
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            calendarInstRef.current.setOptions({ month: { workweek } }, true);
                            calendarInstRef.current.setOptions({ week: { workweek } }, true);
                            calendarInstRef.current.changeView(
                              calendarInstRef.current.getViewName(),
                              true,
                            );
                            setWorkweek(!workweek);
                            setOpen(false);
                          }}
                          role="menuitem"
                          data-action="toggle-workweek"
                        >
                          <input
                            type="checkbox"
                            className="tui-full-calendar-checkbox-square"
                            checked={workweek}
                            onChange={() => {}}
                          />
                          <span className="checkbox-title" />
                          Show weekends
                        </div>
                      </li>
                    </ul>
                  </span>

                  {/* The prev/next arrows and the "Today" button both used to
                      sit here and have been removed by request. Stepping
                      through months is now the mini calendar's job — its own
                      arrows drive this view through `setCurrentDate`. Nothing
                      here returns to today in one step any more. */}
                </div>
              )}
            </div>

            {/* Right zone: filter legend, then the connect actions. */}
            <div className="flex items-center justify-end gap-4 flex-wrap">
              {showFilters && (
                <div className="lnb-calendars-d1">
                  {calendars?.map((element) => {
                    const name = element?.name;
                    const isChecked = category === name;
                    return (
                      <div key={element?.id} className="lnb-calendars-item">
                        <label>
                          <input
                            type="checkbox"
                            name="meetingFilter"
                            className="tui-full-calendar-checkbox-round"
                            value={name}
                            checked={isChecked}
                            onChange={() => handleCategoryFilter(name as calendarFilterType)}
                          />
                          <span
                            style={{
                              borderColor: element?.bgColor,
                              backgroundColor: isChecked ? element?.bgColor : 'transparent',
                            }}
                          />
                          <span>{capitalizeFirstLetter(element?.name)}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Separates filtering from connecting — two different kinds of
                  action that were previously only a gap apart. */}
              {showFilters && (
                <span
                  className="hidden h-6 w-px shrink-0 bg-mcm-line sm:block"
                  aria-hidden="true"
                />
              )}
              <div className="flex justify-end gap-2 items-center">
                <Button
                  size={'sm'}
                  variant={'outline'}
                  className="rounded-xl border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all font-semibold px-4 shadow-sm"
                  disabled={isLoading || syncButtonClicked === SYNC_BUTTON_LABELS?.GOOGLE?.google}
                  onClick={() => handleOutlookOAuthPopup(SYNC_BUTTON_LABELS?.GOOGLE?.google)}
                >
                  <Icon name="GoogleIcon" className="w-4 h-4" />
                  {isLoading || syncButtonClicked === SYNC_BUTTON_LABELS.GOOGLE.google
                    ? SYNC_BUTTON_LABELS?.GOOGLE?.loading
                    : googleAccessToken
                      ? SYNC_BUTTON_LABELS?.GOOGLE?.disconnect
                      : SYNC_BUTTON_LABELS?.GOOGLE?.syncWithGoogle}
                </Button>
                <Button
                  size={'sm'}
                  variant={'outline'}
                  className="rounded-xl border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all font-semibold px-4 shadow-sm"
                  disabled={isLoading || syncButtonClicked === SYNC_BUTTON_LABELS?.OUTLOOK?.outlook}
                  onClick={() => handleOutlookOAuthPopup(SYNC_BUTTON_LABELS?.OUTLOOK?.outlook)}
                >
                  <Icon name="OutlookIcon" className="w-5 h-5" />
                  {isLoading || syncButtonClicked === SYNC_BUTTON_LABELS?.OUTLOOK?.outlook
                    ? SYNC_BUTTON_LABELS?.OUTLOOK?.loading
                    : outlookAccessToken
                      ? SYNC_BUTTON_LABELS?.OUTLOOK?.disconnect
                      : SYNC_BUTTON_LABELS?.OUTLOOK?.syncWithOutlook}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div
          ref={tuiRef}
          className="mcm-calshell min-h-[calc(100vh-240px)] overflow-visible md:min-h-[calc(100vh-220px)] lg:min-h-[calc(100vh-190px)] lg:max-h-[calc(100vh-244px)] lg:overflow-auto"
        />
        {useInternalDetailsPopup && selectedSchedule && popoverPosition && (
          <Popover
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                objectRef?.current?.suppressNextCreation();
                setSelectedSchedule(null);
              }
            }}
          >
            <PopoverTrigger asChild>
              <span
                style={{ position: 'absolute', left: popoverPosition.x, top: popoverPosition.y }}
              />
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="center"
              className="w-[350px] p-0 border-t-4 rounded-lg shadow-md z-[1010]"
              style={{ borderTopColor: selectedSchedule?.borderColor }}
            >
              <div className="flex flex-col gap-2 p-3">
                <h4 className="font-semibold">{selectedSchedule?.title}</h4>
                <div className="flex items-center gap-1">
                  <div className="w-5">
                    <Icon name="TimerIcon" className="w-5 h-5" />
                  </div>
                  <p className="text-sm">
                    {selectedScheduleStartDate
                      ? moment(selectedScheduleStartDate).format('YYYY/MM/DD HH:mm')
                      : '-'}
                    {selectedSchedule?.raw?.category === 'EVENT' &&
                      selectedScheduleEndDate &&
                      ` - ${moment(selectedScheduleEndDate).format('YYYY/MM/DD HH:mm')}`}
                  </p>
                </div>

                {validAttendees?.length > 0 && (
                  <div className="flex items-start gap-1">
                    <div className="w-5">
                      <Icon name="UsersGroup" className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex flex-wrap gap-1 text-xs">
                      {validAttendees?.map((email: string, index: number) => (
                        <span
                          key={index}
                          className="bg-gray-200 px-1.5 py-1 rounded text-foreground"
                        >
                          {email.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <Icon name="CategoryIcon" className="w-5" />
                  <p
                    style={{ backgroundColor: selectedSchedule?.bgColor }}
                    className="text-xs text-white p-1 rounded-sm "
                  >
                    {capitalizeFirstLetter(selectedSchedule?.raw?.category || '')}
                  </p>
                </div>
                {selectedSchedule?.body && selectedSchedule?.calendarId === '2' && !isExpired && (
                  <div className="flex items-center gap-1">
                    <div className="w-5 flex justify-center">
                      <Icon name="VideocameraAdd" className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between w-full">
                      <Link to={selectedSchedule?.body} target="_blank">
                        <Button variant={'outline'} size={'sm'} className="w-fit  rounded-full">
                          Join Meet
                        </Button>
                      </Link>
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        className="hover:text-black cursor-pointer"
                        onClick={handleCopy}
                      >
                        {copiedLink ? (
                          <>
                            Copied{' '}
                            <Icon name="CheckMarkIcon" className="w-4 h-4 text-emerald-600" />
                          </>
                        ) : (
                          <>Copy</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                {selectedSchedule?.raw?.reminderMode?.length > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-5">
                      <Icon name="Bell" className="w-4 h-4" />
                    </div>
                    <span className="text-xs">
                      {Array.isArray(selectedSchedule?.raw?.reminderMode)
                        ? selectedSchedule?.raw?.reminderMode
                            .map((item: string) => capitalizeFirstLetter(item || ''))
                            .join(', ')
                        : capitalizeFirstLetter(selectedSchedule?.raw?.reminderMode || '')}
                    </span>
                  </div>
                )}

                {selectedSchedule?.raw?.description && (
                  <div className="flex items-start gap-1">
                    <div className="w-5">
                      <Icon name="DescriptionIcon" className="w-4 h-4" />
                    </div>
                    <div className="text-xs">{selectedSchedule?.raw?.description}</div>
                  </div>
                )}
                {selectedSchedule?.raw?.createdById === userId && (
                  <div className="flex justify-between pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-sm hover:text-black cursor-pointer"
                      onClick={() => {
                        onBeforeUpdateSchedule({ schedule: selectedSchedule });
                        setSelectedSchedule(null);
                      }}
                      disabled={isExpired}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-sm"
                      onClick={() => {
                        onBeforeDeleteSchedule({ schedule: selectedSchedule });
                        setSelectedSchedule(null);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <AlertConfirm
          {...{
            apiLoading: isPending,
            open: openConfirmModal,
            setOpen: setOpenConfirmModal,
            onCancel: () => setSyncButtonClicked(null),
            onConfirm: () => mutateDisconnect({ type: syncButtonClicked }),
            descriptionTextComp: `Are you sure, you want to disconnect with ${syncButtonClicked ?? ''}?`,
          }}
        />
      </div>
    );
  },
);

export default CustomTuiCalendar;
