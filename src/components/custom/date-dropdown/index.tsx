import { forwardRef, useRef, useState } from 'react';
import ReactDatePicker from 'react-datepicker';
import moment from 'moment';
import { Icon } from '@/assets/icons/icon';
import { handleDate } from './constant';
import CustomSelect from '../custom-select';
import { Button } from '@/components/ui/button';
import './date-picker-theme.css';

/** The label lives inside the same bordered box as the value — one card
 *  reading "FROM / Sep 2, 2026" — rather than a label floating above a
 *  separate input, which is what `react-datepicker`'s own `customInput`
 *  slot is for. A plain div rather than a `<button>`: the browser's own
 *  button reset (transparent background, no border) was landing after this
 *  component's own CSS in the bundle and winning, so the card's background
 *  and border were being silently stripped back to nothing. */
const DateFieldInput = forwardRef<
  HTMLDivElement,
  { label: string; value?: string; onClick?: () => void; placeholder?: string }
>(({ label, value, onClick, placeholder }, ref) => (
  <div
    ref={ref}
    onClick={onClick}
    role="button"
    tabIndex={0}
    aria-label={label}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') onClick?.();
    }}
    className="mcm-date-input"
  >
    <span className={`mcm-date-field-value${value ? '' : ' is-placeholder'}`}>
      {value || placeholder || 'Select date'}
    </span>
  </div>
));
DateFieldInput.displayName = 'DateFieldInput';

/* The closed pill shows this instead of the full option label — "Last 30
   Days" becomes "30 Days" — for callers tight on horizontal space (the
   phone console's calls-tabs-row). The open menu is unaffected: it always
   lists the full label. */
const shortenDateLabel = (label: string) => String(label || '').replace(/^Last\s+/i, '');

const DateDropdown = ({
  dropdownVal,
  setDropdownVal = () => {},
  customPickerPlacement = 'inline',
  shortenSelectedLabel = false,
}: any) => {
  const showCustomPickerBelow = customPickerPlacement === 'bottom';
  const toDatePickerRef = useRef<any>(null);
  const [dateRange, setDateRange] = useState<any>({
    from: moment().format('YYYY-MM-DD'),
    to: moment().format('YYYY-MM-DD'),
  });

  const [timeRange, setTimeRange] = useState({
    from: '',
    to: '',
  });

  const { dateOptions = [], date_type = '' } = dropdownVal;

  const updateDateState = (value: any) => {
    setDropdownVal((prev: any) => ({
      ...prev,
      date_type: value,
      value: ['Custom', 'Custom Date/Time'].includes(value) ? prev.value : handleDate(value),
    }));
    if (value === 'Custom Date/Time') {
      setDateRange((prev: any) => ({
        ...prev,
        from: moment().format('YYYY-MM-DD'),
        to: moment().format('YYYY-MM-DD'),
      }));
      setTimeRange((prev) => ({ ...prev, from: '', to: '' }));
    }
  };

  const isValidTime = (time: any) => {
    return moment(time, 'HH:mm', true).isValid();
  };

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <div className="w-full min-w-0 sm:w-40 lg:w-44">
        <CustomSelect
          options={dateOptions.map(({ label, value }: any) => ({ label, value }))}
          value={dateOptions?.find((opt: any) => opt.value === date_type) || null}
          handleChange={(selectedOption) => {
            updateDateState(selectedOption?.value);
          }}
          // A fixed, short preset list (Today, Last 7 Days, Date Range…) —
          // click-to-pick reads as a real dropdown; a text cursor inside it
          // invited typing that this list was never built to search.
          isSearchable={false}
          FormatOptionLabel={
            shortenSelectedLabel
              ? ({ option, context }: any) => (
                  <span>
                    {context === 'value' ? shortenDateLabel(option?.label) : option?.label}
                  </span>
                )
              : null
          }
        />
      </div>
      {date_type && date_type === 'Custom' ? (
        <div
          className={
            showCustomPickerBelow
              ? 'absolute right-0 top-full z-50 mt-2 w-[21rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.92)] backdrop-blur-[12px] p-3 shadow-lg'
              : 'flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap'
          }
        >
          {/* Two independent single-month pickers rather than one connected
              two-month range calendar — "From" only ever opens its own
              calendar, "To" its own, so picking a start date never leaves a
              second month sitting open beside it. */}
          <div
            className={
              showCustomPickerBelow
                ? 'flex items-center gap-2'
                : 'flex min-w-0 flex-1 items-center gap-2 sm:flex-none'
            }
          >
            <div className="mcm-date-field">
              <ReactDatePicker
                placeholderText="Select date"
                selected={dateRange.from ? new Date(dateRange.from) : null}
                onChange={(date) => {
                  setDateRange((prev: any) => ({
                    ...prev,
                    from: date,
                    to: prev.to && date && new Date(prev.to) < date ? date : prev.to,
                  }));
                  // Picking a start date is step one of two — open the "To"
                  // calendar right away instead of making the user reach for
                  // it themselves. The timeout lets this picker's own popper
                  // finish closing first.
                  window.setTimeout(() => toDatePickerRef.current?.setOpen(true), 0);
                }}
                maxDate={moment().toDate()}
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                dateFormat="MMM d, yyyy"
                calendarClassName="mcm-datepicker"
                className="mcm-date-input"
                customInput={<DateFieldInput label="From" />}
                popperPlacement={showCustomPickerBelow ? 'bottom-start' : undefined}
                portalId="mcm-datepicker-portal"
              />
            </div>
            <div className="mcm-date-field">
              <ReactDatePicker
                ref={toDatePickerRef}
                placeholderText="Select date"
                selected={dateRange.to ? new Date(dateRange.to) : null}
                onChange={(date) => setDateRange((prev: any) => ({ ...prev, to: date }))}
                minDate={dateRange.from ? new Date(dateRange.from) : undefined}
                maxDate={moment().toDate()}
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                dateFormat="MMM d, yyyy"
                calendarClassName="mcm-datepicker"
                className="mcm-date-input"
                customInput={<DateFieldInput label="To" />}
                popperPlacement={showCustomPickerBelow ? 'bottom-end' : undefined}
                portalId="mcm-datepicker-portal"
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              title="Clear"
              className="mcm-date-clear-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[rgba(225,200,165,0.9)] bg-white text-[#9A948F] transition-colors hover:border-primary hover:text-primary"
              onClick={() => setDateRange((prev: any) => ({ ...prev, from: '', to: '' }))}
            >
              <Icon name="CloseIcon" className="h-3.5 w-3.5" />
            </button>
            <Button
              variant={'primary'}
              disabled={!dateRange?.to}
              className="mcm-date-apply-btn h-9 min-h-9 max-h-9 shrink-0 rounded-lg px-2.5 py-0"
              onClick={() =>
                setDropdownVal((prev: any) => ({
                  ...prev,
                  value: handleDate(date_type, dateRange),
                }))
              }
            >
              Apply
            </Button>
          </div>
        </div>
      ) : date_type && date_type === 'Custom Date/Time' ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
            <ReactDatePicker
              placeholderText="Select time"
              selected={dateRange.from ? new Date(dateRange.from) : undefined}
              onChange={(date) => {
                setDateRange((prev: any) => ({
                  ...prev,
                  from: date,
                  to: date,
                }));
              }}
              className="h-9 w-full min-w-0 rounded-lg border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] px-3 text-sm shadow-none hover:border-primary focus:border-primary focus:outline-none"
              showMonthDropdown
              showYearDropdown
              peekNextMonth
              dropdownMode="select"
              dateFormat="yyyy-MM-dd"
              maxDate={moment().toDate()}
            />
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-none">
            <ReactDatePicker
              placeholderText="Start"
              selected={
                isValidTime(timeRange.from) ? moment(timeRange.from, 'HH:mm').toDate() : null
              }
              onChange={(time) => {
                const formattedStartTime = moment(time).format('HH:mm');
                const newEndTime = moment(time).add(15, 'minutes').format('HH:mm');
                setTimeRange((prev) => ({
                  ...prev,
                  from: formattedStartTime,
                  to: newEndTime,
                }));
              }}
              className="h-9 w-full min-w-0 rounded-lg border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] px-3 text-sm shadow-none hover:border-primary focus:border-primary focus:outline-none"
              showTimeSelect
              showTimeSelectOnly
              timeFormat="HH:mm"
              timeIntervals={15}
              timeCaption="Start Time"
              dateFormat="HH:mm"
            />
            <ReactDatePicker
              placeholderText="End"
              selected={isValidTime(timeRange.to) ? moment(timeRange.to, 'HH:mm').toDate() : null}
              onChange={(time) => {
                setTimeRange((prev) => ({
                  ...prev,
                  to: moment(time).format('HH:mm'),
                }));
              }}
              className="h-9 w-full min-w-0 rounded-lg border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] px-3 text-sm shadow-none hover:border-primary focus:border-primary focus:outline-none"
              showTimeSelect
              showTimeSelectOnly
              timeFormat="HH:mm"
              timeIntervals={15}
              timeCaption="End Time"
              minTime={
                timeRange.from
                  ? moment(timeRange.from, 'HH:mm').add(1, 'minute').toDate()
                  : undefined
              }
              maxTime={
                timeRange.from
                  ? moment(timeRange.from, 'HH:mm').hours(23).minutes(59).toDate()
                  : undefined
              }
              dateFormat="HH:mm"
              disabled={!timeRange.from}
            />
          </div>

          <Button
            variant={'outline'}
            className="h-9 min-h-9 max-h-9 shrink-0 rounded-lg px-3 py-0"
            disabled={
              !dateRange.from ||
              !timeRange.from ||
              !timeRange.to ||
              [timeRange.from, timeRange.to].includes('Invalid date')
            }
            onClick={() =>
              setDropdownVal((prev: any) => ({
                ...prev,
                value: handleDate(date_type, dateRange, timeRange),
              }))
            }
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default DateDropdown;
