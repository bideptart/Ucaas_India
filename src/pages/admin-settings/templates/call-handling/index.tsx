import { Plus } from '@/assets/icons';
import { AdminPage } from '@/pages/admin-settings/page-shell';
import '../templates-table.css';
import SideDrawer from '@/components/custom/side-drawer';
import TableManager from '@/components/custom/table-manager';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { asObject } from '@/lib/bulk-user-settings';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { escapeCell } from '@/lib/user-roster-export';
import { simulateCallHandling, type SimulationResult } from '@/lib/simulate-call-handling';
import { capitalizeFirstLetter, formatDate, handleAlert } from '@/lib/utils';
import {
  allNumbersList,
  deleteCallHandlingTemplate,
  getCallHandlingList,
  upsertCallHandlingTemplate,
} from '@/services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import UpsertCallForwarding from '../../numbers/set-number-forwarding';
import ApplyCallHandlingTemplate from './apply-template';
import AlertConfirm from '@/components/custom/alert-confirm';
import CustomTooltip from '@/components/custom/custom-tooltip';
import { Icon, IconName } from '@/assets/icons/icon';
import useDebounce from '@/hooks/use-debounce';
import { Input } from '@/components/ui/input';
import { FilterIcon } from '@/assets/icons';
import { getTemplateActivityTimeline } from './dummy-call-handling-meta';
import CallHandlingInsightsPanel from './call-handling-insights-panel';

// const breadcrumbData = [{ label: 'Templates' }, { label: 'Call Handling' }];

interface IUserSettingsState {
  isAddEdit: boolean;
  tempDetails: any;
  isDeleteAlert: boolean;
  isApply: boolean;
}

type StatusFilter = 'all' | 'applied' | 'not_applied';
type SortKey = 'name' | 'created_at' | 'updated_at';

interface DateFilters {
  createdFrom: string;
  createdTo: string;
  lastModifiedDays: number | null;
}

const EMPTY_DATE_FILTERS: DateFilters = { createdFrom: '', createdTo: '', lastModifiedDays: null };

const toDateTimeLocalValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/** "Test this routing" — a small popover that walks a hypothetical call
 *  through this template's rules for a moment the admin picks, using
 *  simulate-call-handling.ts. No call is placed and nothing is saved. */
const RouteSimulatorPopover = ({ template }: { template: any }) => {
  const [testAt, setTestAt] = useState(() => toDateTimeLocalValue(new Date()));
  const [result, setResult] = useState<SimulationResult | null>(null);

  const run = () => {
    const parsed = testAt ? new Date(testAt) : new Date();
    const forwardActions = asObject(template?.forward_call_actions);
    setResult(
      simulateCallHandling(forwardActions, Number.isNaN(parsed.getTime()) ? new Date() : parsed),
    );
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) run();
      }}
    >
      <PopoverTrigger asChild>
        <div>
          <CustomTooltip text="Test this routing" side="top">
            <div className="cursor-pointer flex items-center justify-center rounded-full w-7 h-7 bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white">
              <Icon name="PlayCircle" className="w-4 h-4" />
            </div>
          </CustomTooltip>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-[#2E2D35]">Test this routing</p>
          <p className="text-[11px] text-[#9A948F]">
            Walks a hypothetical call through this template's rules for a moment you pick — no call is
            placed.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={testAt}
              onChange={(event) => setTestAt(event.target.value)}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={run}>
              Run
            </Button>
          </div>
          {result && (
            <div className="flex flex-col gap-2 rounded-lg border border-[#EEE7DD] p-2">
              {result.steps.map((step, index) => (
                <div key={index} className="text-xs">
                  <span className="font-semibold text-[#2E2D35]">{step.label}: </span>
                  <span className="text-gray-600">{step.detail}</span>
                </div>
              ))}
              <div
                className={`text-xs font-semibold ${
                  result.isOpen ? 'text-green-600' : 'text-amber-600'
                }`}
              >
                {result.isOpen ? 'Open at this moment' : 'Closed at this moment'}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** The expandable row's content — a real configuration summary (read
 *  straight off the template's own forward_call_actions) plus a demo-only
 *  Activity Timeline (see dummy-call-handling-meta.ts for why that part is
 *  invented: this app has no audit log). */
const TemplateRowPreview = ({ template }: { template: any }) => {
  const actions = asObject(template?.forward_call_actions);
  const businessHours = actions?.call_handling?.business_hours;
  const closedAction = actions?.condition?.operational_hours?.closed_hour_action;
  const recordingOn = Boolean(
    actions?.condition?.recording?.automatic?.enabled || actions?.condition?.recording?.on_demand?.enabled,
  );
  const events = getTemplateActivityTimeline(template);

  return (
    <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-700">Configuration</p>
        <p className="text-xs text-gray-600">Routes to: {businessHours?.label || 'Not set'}</p>
        <p className="text-xs text-gray-600">
          When closed: {closedAction?.value_label || closedAction?.type_label || 'Not set'}
        </p>
        <p className="text-xs text-gray-600">Recording: {recordingOn ? 'On' : 'Off'}</p>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          Activity Timeline
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500">
            Demo
          </span>
        </p>
        {events.map((event, index) => (
          <p key={index} className="text-[11px] text-gray-500">
            {event.actor} {event.text} · {event.hoursAgo}h ago
          </p>
        ))}
      </div>
    </div>
  );
};

const SortHeader = ({
  label,
  sortKey,
  sortState,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sortState: { key: SortKey; direction: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
}) => {
  const isActive = sortState.key === sortKey;
  const ArrowIcon = isActive ? (sortState.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 ${isActive ? 'text-primary' : ''}`}
    >
      {label}
      <ArrowIcon className="h-3 w-3" />
    </button>
  );
};

const CallHandling = () => {
  const [drawerState, setDrawerState] = useState<IUserSettingsState>({
    isAddEdit: false,
    tempDetails: null,
    isDeleteAlert: false,
    isApply: false,
  });
  const queryClient: any = useQueryClient();
  const [searchedText, setSearchedText] = useState('');
  const debouncedSearch = useDebounce(searchedText || '', 1000);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilters, setDateFilters] = useState<DateFilters>(EMPTY_DATE_FILTERS);
  const [sortState, setSortState] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'updated_at',
    direction: 'desc',
  });
  const { data: allTemplates = [], isPending: loadingTemplates } = useQuery({
    queryKey: ['getCallHandlingTemplate', 'full'],
    queryFn: () => fetchAllPages(getCallHandlingList),
  });

  /* "Applied to N numbers" is real, not demo dressing — Apply writes a
     `_templateSource` tag onto a number's own forward_call_actions (see
     apply-template.tsx), and this counts numbers currently carrying that
     tag for each template. There is no dedicated "usage" endpoint, so the
     only honest way to answer "how many" is to read it back off the
     numbers themselves. */
  const { data: numberRows = [] } = useQuery({
    queryKey: ['fetchNumbersList', 'callHandlingUsageCounts'],
    queryFn: () => fetchAllPages(allNumbersList),
  });

  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (numberRows as any[]).forEach((row) => {
      const uuid = asObject(row?.forward_call_actions)?._templateSource?.uuid;
      if (uuid) counts[uuid] = (counts[uuid] || 0) + 1;
    });
    return counts;
  }, [numberRows]);

  const filteredTemplates = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    let rows = (allTemplates as any[]).filter((template) => {
      if (needle && !String(template?.name || '').toLowerCase().includes(needle)) return false;
      if (statusFilter !== 'all') {
        const applied = (usageCounts[template?.uuid] || 0) > 0;
        if (statusFilter === 'applied' && !applied) return false;
        if (statusFilter === 'not_applied' && applied) return false;
      }
      if (dateFilters.createdFrom) {
        const createdAt = new Date(template?.created_at).getTime();
        if (Number.isNaN(createdAt) || createdAt < new Date(dateFilters.createdFrom).getTime()) {
          return false;
        }
      }
      if (dateFilters.createdTo) {
        const createdAt = new Date(template?.created_at).getTime();
        const to = new Date(dateFilters.createdTo).getTime() + DAY_MS - 1;
        if (Number.isNaN(createdAt) || createdAt > to) return false;
      }
      if (dateFilters.lastModifiedDays) {
        const updatedAt = new Date(template?.updated_at).getTime();
        if (
          Number.isNaN(updatedAt) ||
          now - updatedAt > dateFilters.lastModifiedDays * DAY_MS
        ) {
          return false;
        }
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortState.key === 'name') {
        cmp = String(a?.name || '').localeCompare(String(b?.name || ''));
      } else {
        cmp = new Date(a?.[sortState.key]).getTime() - new Date(b?.[sortState.key]).getTime();
      }
      return sortState.direction === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [allTemplates, debouncedSearch, statusFilter, dateFilters, sortState, usageCounts]);

  const handleSort = (key: SortKey) =>
    setSortState((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );

  /* Undo — scoped to Delete only. Edit already runs through
     UpsertCallForwarding, a big form shared with the real per-number
     forwarding screen; wiring an undo callback through it would mean
     changing that shared component's save path, which is more risk than
     this feature is worth. Delete is fully owned by this file, so undoing
     it is just re-creating the same record — safe to do here alone. */
  const runUndoDelete = async (deletedTemplate: any) => {
    try {
      await upsertCallHandlingTemplate({
        name: deletedTemplate?.name,
        forward_call_actions: deletedTemplate?.forward_call_actions,
      });
      queryClient.invalidateQueries({ queryKey: ['getCallHandlingTemplate'] });
      handleAlert({ text: 'Restored.', type: 'success' });
    } catch {
      handleAlert({ text: 'Could not restore this template.', type: 'error' });
    }
  };

  const { mutate: mutateDeleteTemplate, isPending } = useMutation({
    mutationFn: deleteCallHandlingTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getCallHandlingTemplate'] });
      const deletedTemplate = drawerState?.tempDetails;
      /* Not `data?.data?.message || ...` — demo mode's every successful
         response hardcodes message to the literal string "Demo mode" (see
         the `ok()` helper in demo-mode.ts), so that fallback never actually
         fires there and this toast would say "Demo mode" instead of naming
         which template it just deleted. The specific name matters here more
         than it does elsewhere, since it is the only thing telling the
         admin what Undo is about to restore. */
      handleAlert({
        text: (
          <span className="flex items-center gap-2">
            {`'${deletedTemplate?.name}' deleted.`}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => runUndoDelete(deletedTemplate)}
            >
              Undo
            </button>
          </span>
        ) as any,
        type: 'success',
        autoClose: 6000,
      });
      setDrawerState((prev) => ({
        ...prev,
        isDeleteAlert: false,
        tempDetails: null,
      }));
    },
  });

  const { mutate: mutateDuplicate, isPending: duplicating } = useMutation({
    mutationFn: (template: any) =>
      upsertCallHandlingTemplate({
        name: `Copy of ${template?.name}`,
        forward_call_actions: template?.forward_call_actions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getCallHandlingTemplate'] });
      handleAlert({ text: 'Template duplicated.', type: 'success' });
    },
    onError: () => handleAlert({ text: 'Could not duplicate this template.', type: 'error' }),
  });


  const exportRows = (rows: any[]) => {
    const header = ['Name', 'Status', 'Applied to', 'Created', 'Last Modified'].map(escapeCell).join(',');
    const body = rows.map((template) => {
      const count = usageCounts[template?.uuid] || 0;
      return [
        template?.name,
        count > 0 ? 'Applied' : 'Not applied',
        count,
        formatDate(template?.created_at),
        formatDate(template?.updated_at),
      ]
        .map(escapeCell)
        .join(',');
    });
    const csv = [header, ...body].join('\r\n');
    const BOM = String.fromCharCode(0xfeff);
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `call-handling-templates-${formatDate(new Date().toISOString())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeDateFilterCount =
    (dateFilters.createdFrom || dateFilters.createdTo ? 1 : 0) + (dateFilters.lastModifiedDays ? 1 : 0);

  /* Same applied/not-applied value the row's own Status cell already
     computes from usageCounts — reused here just to pick a row-tint
     class, not to duplicate the status logic. */
  const getTemplateRowClassName = (row: any) => {
    const applied = (usageCounts[row?.original?.uuid] || 0) > 0;
    return applied ? 'row-status-applied' : 'row-status-notapplied';
  };

  const columns: ColumnDef<any>[] = [
    {
      header: () => <SortHeader label="Name" sortKey="name" sortState={sortState} onSort={handleSort} />,
      accessorKey: 'name',
      cell: ({ row }) => (
        <span
          onClick={() =>
            setDrawerState((prev) => ({
              ...prev,
              isAddEdit: true,
              tempDetails: row.original,
            }))
          }
          className="text-primary  cursor-pointer"
        >
          {capitalizeFirstLetter(row?.original?.name)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row }) => {
        const applied = (usageCounts[row?.original?.uuid] || 0) > 0;
        return (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: applied ? 'var(--live, #0d9488)' : 'var(--ink-3, #8a6f57)' }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={
                applied
                  ? { backgroundColor: 'var(--live, #0d9488)' }
                  : { border: '1px solid var(--ink-3, #8a6f57)' }
              }
            />
            {applied ? 'Applied' : 'Not applied yet'}
          </span>
        );
      },
    },
    {
      header: 'Applied To',
      accessorKey: 'usage',
      cell: ({ row }) => {
        const count = usageCounts[row?.original?.uuid] || 0;
        /* Queues stays 0 — Apply to Queue has no backend at all (see the
           Coming soon item in the Actions menu below), so showing anything
           else there would be a made-up number. */
        return <span className="text-xs text-gray-700">0 / {count}</span>;
      },
    },
    {
      header: () => (
        <SortHeader label="Updated" sortKey="updated_at" sortState={sortState} onSort={handleSort} />
      ),
      accessorKey: 'updated_at',
      cell: ({ row }) => <span>{formatDate(row?.original?.updated_at)}</span>,
    },
    {
      header: 'Actions',
      accessorKey: 'action',
      cell: ({ row }) => {
        const data = row?.original;
        const actions = [
          {
            icon: 'EditStrokIcon',
            onClick: () =>
              setDrawerState((prev) => ({
                ...prev,
                isAddEdit: true,
                tempDetails: data,
              })),
            className: 'bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white',
            tooltipText: 'Edit',
          },
          {
            icon: 'CopyLine',
            onClick: () => mutateDuplicate(data),
            className: 'bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white',
            tooltipText: duplicating ? 'Duplicating…' : 'Duplicate',
          },
          {
            icon: 'TrashBin',
            onClick: () =>
              setDrawerState((prev) => ({
                ...prev,
                isDeleteAlert: true,
                tempDetails: data,
              })),
            className: 'bg-red-100 text-red-500 hover:bg-red-500 hover:text-white',
            tooltipText: 'Delete',
          },
        ];

        return (
          <div className="flex items-center gap-0.5">
            <RouteSimulatorPopover template={data} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div>
                  <CustomTooltip text="Apply" side="top">
                    <div className="cursor-pointer flex items-center justify-center rounded-full w-7 h-7 bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white">
                      <Icon name="UsersIcon" className="w-4 h-4" />
                    </div>
                  </CustomTooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() =>
                    setDrawerState((prev) => ({ ...prev, isApply: true, tempDetails: data }))
                  }
                >
                  Apply to Numbers
                </DropdownMenuItem>
                {/* Confirmed against the actual backend router: there is no
                   apply/assign endpoint for a Queue or a Person, for any
                   template type — only plain CRUD. These stay disabled
                   rather than pretending to work. */}
                <DropdownMenuItem disabled className="flex items-center justify-between opacity-60">
                  <span>Apply to Queue</span>
                  <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                    Coming soon
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="flex items-center justify-between opacity-60">
                  <span>Apply to Person</span>
                  <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                    Coming soon
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {actions?.map((action, index) => (
              <CustomTooltip text={action.tooltipText} side="top" key={index}>
                <div
                  className={`cursor-pointer flex items-center justify-center rounded-full w-7 h-7 ${action.className}`}
                  onClick={() => {
                    action.onClick();
                  }}
                >
                  <Icon name={action.icon as IconName} className="w-4 h-4" />
                </div>
              </CustomTooltip>
            ))}
          </div>
        );
      },
    },
  ];
  return (
    <>
      <AdminPage
        section="Templates"
        title="Call Handling"
        description="Reusable call-routing rules you can apply to numbers, queues and people."
        actions={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => exportRows(filteredTemplates)}
            >
              Export Data
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                setDrawerState((prev) => ({ ...prev, isAddEdit: true, tempDetails: null }))
              }
            >
              <Plus className="w-3 h-3" />
              Add Call Handling Template
            </button>
          </>
        }
        filters={
          <>
            <Input
              type="search"
              placeholder="Search Call Queue"
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith(' ')) return;
                setSearchedText(e.target.value);
              }}
              className="w-full min-h-9 rounded-lg"
            />
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'applied' ? 'all' : 'applied')}
              className={`fchip ${statusFilter === 'applied' ? 'live' : ''}`}
            >
              Status: <strong>Applied</strong>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'not_applied' ? 'all' : 'not_applied')}
              className={`fchip ${statusFilter === 'not_applied' ? 'live' : ''}`}
            >
              Status: <strong>Not Applied</strong>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <div className="fchip">
                  <FilterIcon className="w-4 h-4" />
                  Advanced Filter Options
                  {activeDateFilterCount > 0 ? ` (${activeDateFilterCount})` : ''}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                  By Date Range
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <input
                    type="date"
                    value={dateFilters.createdFrom}
                    onChange={(e) =>
                      setDateFilters((prev) => ({ ...prev, createdFrom: e.target.value }))
                    }
                    className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-xs"
                    aria-label="Created from"
                  />
                  <span className="text-[11px] text-gray-400">to</span>
                  <input
                    type="date"
                    value={dateFilters.createdTo}
                    onChange={(e) => setDateFilters((prev) => ({ ...prev, createdTo: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-xs"
                    aria-label="Created to"
                  />
                </div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                  By Last Modified
                </div>
                <DropdownMenuCheckboxItem
                  checked={!!dateFilters.lastModifiedDays}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) =>
                    setDateFilters((prev) => ({ ...prev, lastModifiedDays: checked ? 5 : null }))
                  }
                >
                  Updated in last 5 days
                </DropdownMenuCheckboxItem>
                {activeDateFilterCount > 0 && (
                  <DropdownMenuItem
                    className="cursor-pointer text-primary"
                    onClick={() => setDateFilters(EMPTY_DATE_FILTERS)}
                  >
                    Clear filters
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="w-full flex flex-row gap-6 min-h-0 flex-1">
          <div className="min-w-0 flex-1 templates-table">
            <TableManager
              {...{
                columns,
                staticData: filteredTemplates,
                loading: loadingTemplates,
                hasSubRows: true,
                showMoreData: () => true,
                renderSubComponent: (template: any) => <TemplateRowPreview template={template} />,
                emptyTablePlaceholder: 'No call handling templates found',
                splitStickyHeader: true,
                visibleRowCount: 5,
                defaultPageSize: 8,
                perPageOptions: [8, 25, 50, 100, 200],
                getRowClassName: getTemplateRowClassName,
              }}
            />
          </div>
          <CallHandlingInsightsPanel
            templates={filteredTemplates}
            usageCounts={usageCounts}
            loading={loadingTemplates}
          />
        </div>
      </AdminPage>
      {drawerState?.isAddEdit && (
        <SideDrawer
          width="min(1040px, 84vw)"
          isOpen={drawerState?.isAddEdit}
          isTab={false}
          enableResponsive
          responsiveWidth="96vw"
          responsiveBreakpoint={1024}
          title={`${drawerState?.tempDetails ? 'Update' : 'Add'} Call Handling Template`}
          handleClose={() =>
            setDrawerState((prev) => ({ ...prev, isAddEdit: false, tempDetails: null }))
          }
          content={
            <UpsertCallForwarding
              drawerState={drawerState?.isAddEdit}
              setDrawerState={() =>
                setDrawerState((prev) => ({ ...prev, isAddEdit: false, tempDetails: null }))
              }
              initialData={drawerState?.tempDetails}
              initialType={'UPSERT_TEMPLATE'}
              isUser={false}
            />
          }
        />
      )}

      {drawerState?.isApply && (
        <SideDrawer
          width="min(760px, 90vw)"
          isOpen={drawerState?.isApply}
          isTab={false}
          enableResponsive
          responsiveWidth="96vw"
          responsiveBreakpoint={1024}
          title={`Apply "${drawerState?.tempDetails?.name}" to numbers`}
          handleClose={() =>
            setDrawerState((prev) => ({ ...prev, isApply: false, tempDetails: null }))
          }
          content={
            <ApplyCallHandlingTemplate
              template={drawerState?.tempDetails}
              onClose={() => setDrawerState((prev) => ({ ...prev, isApply: false, tempDetails: null }))}
            />
          }
        />
      )}

      {drawerState?.isDeleteAlert && (
        <AlertConfirm
          {...{
            apiLoading: isPending,
            onConfirm: () => {
              mutateDeleteTemplate(drawerState?.tempDetails?.uuid);
            },
            open: drawerState?.isDeleteAlert,
            setOpen: () => {
              setDrawerState((prev) => ({
                ...prev,
                isDeleteAlert: false,
                tempDetails: null,
              }));
            },
            headerText: 'Delete Confirmation',
            descriptionTextComp: 'Are you sure, you want to delete this template?',
          }}
        />
      )}
    </>
  );
};

export default CallHandling;
