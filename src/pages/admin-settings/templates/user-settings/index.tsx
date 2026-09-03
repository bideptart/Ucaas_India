import { Plus } from '@/assets/icons';
import { AdminPage } from '@/pages/admin-settings/page-shell';
import '../templates-table.css';
import SideDrawer from '@/components/custom/side-drawer';
import TableManager from '@/components/custom/table-manager';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, handleAlert } from '@/lib/utils';
import { templateDelete, templateList } from '@/services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { FC, useMemo, useRef, useState } from 'react';
import UpsertUserSettingsTemplate from './add-edit-user-settings';
import ApplyUserSettingsTemplate from './apply-template';
import AlertConfirm from '@/components/custom/alert-confirm';
import CustomTooltip from '@/components/custom/custom-tooltip';
import { Icon, IconName } from '@/assets/icons/icon';
import { Input } from '@/components/ui/input';
import useDebounce from '@/hooks/use-debounce';
import { useNavigate } from 'react-router-dom';
import { COMPANY_DEFAULT_TEMPLATE_NAME } from '@/lib/company-defaults';
import { isDemoMode } from '@/lib/demo-mode';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { FilterIcon } from '@/assets/icons';
import { escapeCell } from '@/lib/user-roster-export';
import {
  DUMMY_FILTER_ACCESS,
  DUMMY_FILTER_AUTHORS,
  DUMMY_FILTER_STATUSES,
  DUMMY_FILTER_TAGS,
  getAccessColours,
  getDummyTemplateMeta,
  getDummyTemplateStatus,
  getStatusColours,
  getTagColours,
  setDummyTemplateStatus,
  type DummyTemplateStatus,
} from './dummy-template-meta';
import TemplateInsightsPanel from './template-insights-panel';

// const breadcrumbData = [{ label: 'Templates' }, { label: 'User Settings' }];

interface IUserSettingsState {
  isAddEdit: boolean;
  tempDetails: any;
  isDeleteAlert: boolean;
  isApply: boolean;
}

interface DummyFilters {
  tag: string | null;
  author: string | null;
  access: string[];
  statuses: DummyTemplateStatus[];
  createdFrom: string;
  createdTo: string;
  /** Truthy when "updated in the last 5 days" is on. */
  lastModifiedDays: number | null;
}

const EMPTY_FILTERS: DummyFilters = {
  tag: null,
  author: null,
  access: [],
  statuses: [],
  createdFrom: '',
  createdTo: '',
  lastModifiedDays: null,
};

/** The small card a click on a row's "dead space" (Tags/Access/Status/Created
 *  By/Created/Updated) opens — a quick look at that template without the
 *  weight of the full edit drawer, which stays reserved for the Name link. */
const TemplateInfoCard = ({
  template,
  onEdit,
}: {
  template: any;
  onEdit: (template: any) => void;
}) => {
  const meta = getDummyTemplateMeta(template);
  const status = getDummyTemplateStatus(template?.uuid, meta.baseStatus);
  const statusColours = getStatusColours(status);
  const accessColours = getAccessColours(meta.access);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900">{template?.name}</span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-semibold"
          style={{ backgroundColor: statusColours.bg, color: statusColours.text }}
        >
          {status}
        </span>
      </div>

      {meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.tags.map((tag) => {
            const colours = getTagColours(tag);
            return (
              <span
                key={tag}
                className="rounded-full px-2 py-0.5 font-semibold"
                style={{ backgroundColor: colours.bg, color: colours.text }}
              >
                {tag}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 text-gray-600">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
          style={{ backgroundColor: meta.author.colour }}
        >
          {meta.author.initials}
        </span>
        {meta.author.name}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-gray-500">
        <span>Access</span>
        <span className="justify-self-end font-medium" style={{ color: accessColours.text }}>
          {meta.access}
        </span>
        <span>Used in</span>
        <span className="justify-self-end font-medium text-gray-700">
          {meta.profileCount} user profiles
        </span>
        <span>Created</span>
        <span className="justify-self-end font-medium text-gray-700">
          {formatDate(template?.created_at)}
        </span>
        <span>Updated</span>
        <span className="justify-self-end font-medium text-gray-700">
          {formatDate(template?.updated_at)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onEdit(template)}
        className="mt-1 text-left text-xs font-semibold text-primary hover:underline"
      >
        Open full details →
      </button>
    </div>
  );
};

/** The click-target wrapper opens the card on click AND hover — a plain
 *  function can't hold this open/close state itself (every cell in a
 *  98-row table would share one hook slot), so this is its own component.
 *  Small delays on both ends: opening waits a beat so sweeping the mouse
 *  across the table doesn't flash a card per row it passes over; closing
 *  waits so moving from the badge to the "Open full details" link inside
 *  the card doesn't close it out from under the pointer first. */
const RowInfoPopover = ({
  trigger,
  template,
  onEdit,
}: {
  trigger: React.ReactNode;
  template: any;
  onEdit: (template: any) => void;
}) => {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };
  const openSoon = () => {
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => setOpen(true), 200);
  };
  const closeSoon = () => {
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="-ml-[12px] -mt-[12px] flex h-[calc(100%+24px)] w-[calc(100%+24px)] cursor-pointer items-center justify-start pl-[12px]"
          onMouseEnter={openSoon}
          onMouseLeave={closeSoon}
          onClick={() => {
            clearPendingTimeout();
            setOpen(true);
          }}
        >
          {trigger}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        align="start"
        onMouseEnter={openSoon}
        onMouseLeave={closeSoon}
        onClick={(e) => e.stopPropagation()}
      >
        <TemplateInfoCard template={template} onEdit={onEdit} />
      </PopoverContent>
    </Popover>
  );
};

const STATUS_OPTIONS: DummyTemplateStatus[] = ['Active', 'Archived', 'Pending', 'Draft'];

/** Clicking a row's Status badge opens a small picker instead of the usual
 *  info card — the one field on this row an admin can actually change from
 *  the list itself, so it gets its own dropdown rather than sharing the
 *  read-only quick-look popover every other cell opens. */
const StatusPicker = ({
  status,
  onChange,
}: {
  status: DummyTemplateStatus;
  onChange: (status: DummyTemplateStatus) => void;
}) => {
  const colours = getStatusColours(status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: colours.bg, color: colours.text }}
        >
          {status}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {STATUS_OPTIONS.map((option) => {
          const optionColours = getStatusColours(option);
          return (
            <DropdownMenuItem
              key={option}
              className="cursor-pointer"
              onClick={() => onChange(option)}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: optionColours.text }}
              />
              {option}
              {option === status ? ' ✓' : ''}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const UserSettings: FC = () => {
  const navigate = useNavigate();
  const [drawerState, setDrawerState] = useState<IUserSettingsState>({
    isAddEdit: false,
    tempDetails: null,
    isDeleteAlert: false,
    isApply: false,
  });
  const [searchedText, setSearchedText] = useState('');
  const debouncedSearch = useDebounce(searchedText || '', 1000);
  const queryClient: any = useQueryClient();
  const demo = isDemoMode();

  /* Tag/Author/Access/Status/date filters and the checkbox column below only
     touch the demo-only columns and the insights panel — none of that exists
     on the real record (see dummy-template-meta.ts), so it never changes
     what the real Name/Created/Updated columns show or how the real API is
     queried. */
  const [dummyFilters, setDummyFilters] = useState<DummyFilters>(EMPTY_FILTERS);
  /* Bumped whenever a demo archive/favourite toggle fires, to re-read the
     module-level override stores — those stores aren't React state, so
     nothing else would tell this component to re-render when they change. */
  const [demoMetaVersion, setDemoMetaVersion] = useState(0);

  const { data: allTemplates = [], isPending: loadingTemplates } = useQuery({
    queryKey: ['userTemplateList', 'full'],
    queryFn: () => fetchAllPages(templateList),
    enabled: demo,
  });

  const filteredTemplates = useMemo(() => {
    if (!demo) return [];
    const needle = debouncedSearch.trim().toLowerCase();
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    return (allTemplates as any[]).filter((template) => {
      if (template?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return true;
      if (needle && !String(template?.name || '').toLowerCase().includes(needle)) return false;
      const meta = getDummyTemplateMeta(template);
      if (dummyFilters.tag && !meta.tags.includes(dummyFilters.tag)) return false;
      if (dummyFilters.author && meta.author.name !== dummyFilters.author) return false;
      if (dummyFilters.access.length && !dummyFilters.access.includes(meta.access)) return false;
      if (dummyFilters.statuses.length) {
        const status = getDummyTemplateStatus(template?.uuid, meta.baseStatus);
        if (!dummyFilters.statuses.includes(status)) return false;
      }
      /* Created/updated are real fields on the record, so date filtering
         works the same in demo and production — it just has nothing to read
         outside demo mode's static rows today. */
      if (dummyFilters.createdFrom) {
        const createdAt = new Date(template?.created_at).getTime();
        if (Number.isNaN(createdAt) || createdAt < new Date(dummyFilters.createdFrom).getTime()) {
          return false;
        }
      }
      if (dummyFilters.createdTo) {
        const createdAt = new Date(template?.created_at).getTime();
        const to = new Date(dummyFilters.createdTo).getTime() + DAY_MS - 1;
        if (Number.isNaN(createdAt) || createdAt > to) return false;
      }
      if (dummyFilters.lastModifiedDays) {
        const updatedAt = new Date(template?.updated_at).getTime();
        if (
          Number.isNaN(updatedAt) ||
          now - updatedAt > dummyFilters.lastModifiedDays * DAY_MS
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allTemplates, demo, debouncedSearch, dummyFilters, demoMetaVersion]);

  const { mutate: mutateDelete, isPending } = useMutation({
    mutationFn: templateDelete,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['userTemplateList'] });
      handleAlert({
        text: data?.data?.message || 'Template deleted successfully',
        type: 'success',
      });
      setDrawerState((prev) => ({
        ...prev,
        isDeleteAlert: false,
        tempDetails: null,
      }));
    },
  });


  /* Genuinely builds and downloads a file — not a placeholder. Reuses the
     same quoting rules the People-page export already relies on
     (src/lib/user-roster-export.ts) rather than re-deriving CSV escaping.
     Exports every currently-filtered row — there is no selection mechanism
     on this table any more, so "export" means everything the search/filter
     bar is showing rather than a hand-picked subset. */
  const exportFilteredTemplates = () => {
    const rows = filteredTemplates;
    const header = ['Name', 'Tags', 'Access', 'Status', 'Created By', 'Created', 'Updated']
      .map(escapeCell)
      .join(',');
    const body = rows.map((template) => {
      const meta = getDummyTemplateMeta(template);
      const status = getDummyTemplateStatus(template?.uuid, meta.baseStatus);
      return [
        template?.name,
        meta.tags.join(' '),
        meta.access,
        status,
        meta.author.name,
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
    link.download = `user-settings-templates-${formatDate(new Date().toISOString())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openEditDrawer = (data: any) => {
    if (data?.name === COMPANY_DEFAULT_TEMPLATE_NAME) {
      navigate('/admin-settings/company/policies');
      return;
    }
    setDrawerState((prev) => ({ ...prev, isAddEdit: true, tempDetails: data }));
  };

  /* Only the Name cell's own link opened anything — every other cell in a
     row (Tags, Access, Status, Created By, the date columns) was dead space
     to click on. Wrapping their content in a popover means clicking (or
     hovering) anywhere on a row's info shows a quick-look card for that
     record, without opening the full edit drawer just to glance at it —
     "Open full details" inside the card is what reaches that. */
  const renderInfoPopover = (trigger: React.ReactNode, template: any) => (
    <RowInfoPopover trigger={trigger} template={template} onEdit={openEditDrawer} />
  );

  /* Same status a row's own Status badge already shows (dummy-template-meta's
     getDummyTemplateStatus, including any override from the picker) — reused
     here just to pick a row-tint class, not to duplicate the status logic. */
  const getTemplateRowClassName = (row: any) => {
    const template = row?.original;
    if (!template || template.name === COMPANY_DEFAULT_TEMPLATE_NAME) return '';
    const meta = getDummyTemplateMeta(template);
    const status = getDummyTemplateStatus(template?.uuid, meta.baseStatus);
    return `row-status-${status.toLowerCase()}`;
  };

  const columns: ColumnDef<any>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => {
        /* The company record is stored as a reserved template row because there
           is no company-settings table. It is not a template — nobody applies it
           to a person — so it opens the company page, never the template drawer.
           Editing it here would let an admin overwrite the company's phone rules,
           emergency address, holidays and policies while believing they were
           editing a template. */
        if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) {
          return (
            <span className="flex items-center justify-center gap-2">
              <span
                onClick={() => navigate('/admin-settings/company/policies')}
                className="text-primary hover:text-primary/80 underline-offset-4 cursor-pointer"
              >
                {row?.original?.name}
              </span>
              <span className="rounded-sm bg-ucass-primary-200 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                Company record
              </span>
            </span>
          );
        }
        return (
          <div className="w-full min-w-0">
            {/* block, not the inline default a <span> would otherwise be —
                text-overflow: ellipsis only has an effect on a box that can
                itself be width-constrained, which an inline element isn't.
                text-left overrides the inherited centering from this
                column's `meta.textAlign: 'center'` (table-manager-row.tsx
                centers the cell as a whole via its own wrapper) — centered
                *text* inside a nowrap+ellipsis box clips evenly off both
                ends once it overflows instead of eliding cleanly on the
                right, which is what a too-long name was doing here. */}
            <span
              onClick={() =>
                setDrawerState((prev) => ({
                  ...prev,
                  isAddEdit: true,
                  tempDetails: row?.original,
                }))
              }
              className="block w-full truncate text-left text-[11px] text-primary hover:text-primary/80 underline-offset-4 cursor-pointer"
            >
              {row?.original?.name}
            </span>
          </div>
        );
      },
    },
    /* Tags/Access/Status/Created By below only exist as demo dressing — see
       dummy-template-meta.ts — so they are left out of the table entirely
       outside a preview host rather than shown empty or fake. */
    ...(demo
      ? ([
          {
            header: 'Tags',
            accessorKey: 'tags',
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              /* Only the first tag renders — showing every tag wrapped this
                 row to two lines on anything with 2+ tags while a 1-tag row
                 stayed one line, so rows sat at mismatched heights next to
                 each other. A "+N" badge for the rest keeps every row's
                 Tags cell exactly one line, still visible in full inside
                 the info popover this cell already opens. */
              const [firstTag, ...restTags] = meta.tags;
              const firstColours = firstTag ? getTagColours(firstTag) : null;
              return renderInfoPopover(
                <div className="flex flex-nowrap items-center gap-1">
                  {firstTag && (
                    <span
                      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: firstColours!.bg, color: firstColours!.text }}
                    >
                      {firstTag}
                    </span>
                  )}
                  {restTags.length > 0 && (
                    <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                      +{restTags.length}
                    </span>
                  )}
                </div>,
                row?.original,
              );
            },
          },
          {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              const status = getDummyTemplateStatus(row?.original?.uuid, meta.baseStatus);
              return (
                <StatusPicker
                  status={status}
                  onChange={(next) => {
                    setDummyTemplateStatus(row?.original?.uuid, next);
                    setDemoMetaVersion((v) => v + 1);
                  }}
                />
              );
            },
          },
          {
            header: 'By',
            accessorKey: 'created_by',
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              return renderInfoPopover(
                <CustomTooltip text={meta.author.name} side="top">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: meta.author.colour }}
                  >
                    {meta.author.initials}
                  </span>
                </CustomTooltip>,
                row?.original,
              );
            },
          },
        ] as ColumnDef<any>[])
      : []),
    {
      header: 'Updated',
      accessorKey: 'updated_at',
      cell: ({ row }) =>
        demo && row?.original?.name !== COMPANY_DEFAULT_TEMPLATE_NAME
          ? renderInfoPopover(<span>{formatDate(row?.original?.updated_at)}</span>, row?.original)
          : <span>{formatDate(row?.original?.updated_at)}</span>,
    },
    {
      header: 'Actions',
      accessorKey: 'action',
      cell: ({ row }) => {
        const data = row?.original;

        /* Deleting this row would silently wipe every company-wide setting, with
           no warning that it was anything other than a spare template. */
        if (data?.name === COMPANY_DEFAULT_TEMPLATE_NAME) {
          return (
            <span
              onClick={() => navigate('/admin-settings/company/policies')}
              className="cursor-pointer text-xs font-medium text-primary hover:underline"
            >
              Open company settings
            </span>
          );
        }

        const actions = [
          {
            icon: 'UsersIcon',
            onClick: () =>
              setDrawerState((prev) => ({
                ...prev,
                isApply: true,
                tempDetails: data,
              })),
            className: 'bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white',
            tooltipText: 'Apply to people',
          },
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
          <div className="flex items-center gap-2">
            {actions?.map((action, index) => (
              <CustomTooltip key={index} text={action.tooltipText} side="top">
                <div
                  className={`cursor-pointer flex items-center justify-center rounded-full w-8 h-8 ${action.className}`}
                  onClick={() => {
                    action.onClick();
                  }}
                >
                  <Icon name={action.icon as IconName} className="w-5 h-5" />
                </div>
              </CustomTooltip>
            ))}
          </div>
        );
      },
    },
  ];

  const activeDummyFilterCount =
    (dummyFilters.tag ? 1 : 0) +
    (dummyFilters.author ? 1 : 0) +
    (dummyFilters.access.length ? 1 : 0) +
    (dummyFilters.statuses.length ? 1 : 0) +
    (dummyFilters.createdFrom || dummyFilters.createdTo ? 1 : 0) +
    (dummyFilters.lastModifiedDays ? 1 : 0);

  return (
    <>
      <AdminPage
        section="Templates"
        title="User Settings"
        description="Saved bundles of user settings you can apply when creating or editing someone."
        actions={
          <>
            {demo && (
              <button type="button" className="btn ghost" onClick={exportFilteredTemplates}>
                Export Data
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                setDrawerState((prev) => ({ ...prev, isAddEdit: true, tempDetails: null }))
              }
            >
              <Plus className="w-3 h-3" />
              Add User Settings Template
            </button>
          </>
        }
        filters={
          <>
            <Input
              type="search"
              placeholder="Search"
              onChange={(e) => setSearchedText(e.target.value)}
              className="w-full min-h-9 rounded-lg"
            />
            {demo && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <div className="fchip">
                    <FilterIcon className="w-4 h-4" />
                    Filter
                    {activeDummyFilterCount > 0 ? ` (${activeDummyFilterCount})` : ''}
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-[75vh] overflow-y-auto">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                    By Date Range
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <input
                      type="date"
                      value={dummyFilters.createdFrom}
                      onChange={(e) =>
                        setDummyFilters((prev) => ({ ...prev, createdFrom: e.target.value }))
                      }
                      className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-xs"
                      aria-label="Created from"
                    />
                    <span className="text-[11px] text-gray-400">to</span>
                    <input
                      type="date"
                      value={dummyFilters.createdTo}
                      onChange={(e) =>
                        setDummyFilters((prev) => ({ ...prev, createdTo: e.target.value }))
                      }
                      className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-xs"
                      aria-label="Created to"
                    />
                  </div>

                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                    By Last Modified
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={!!dummyFilters.lastModifiedDays}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) =>
                      setDummyFilters((prev) => ({ ...prev, lastModifiedDays: checked ? 5 : null }))
                    }
                  >
                    Updated in last 5 days
                  </DropdownMenuCheckboxItem>

                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                    By Tag
                  </div>
                  {DUMMY_FILTER_TAGS.map((tag) => (
                    <DropdownMenuItem
                      key={tag}
                      className="cursor-pointer"
                      onClick={() =>
                        setDummyFilters((prev) => ({ ...prev, tag: prev.tag === tag ? null : tag }))
                      }
                    >
                      {dummyFilters.tag === tag ? '✓ ' : ''}
                      {tag}
                    </DropdownMenuItem>
                  ))}
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                    By Author
                  </div>
                  {DUMMY_FILTER_AUTHORS.map((author) => (
                    <DropdownMenuItem
                      key={author}
                      className="cursor-pointer"
                      onClick={() =>
                        setDummyFilters((prev) => ({
                          ...prev,
                          author: prev.author === author ? null : author,
                        }))
                      }
                    >
                      {dummyFilters.author === author ? '✓ ' : ''}
                      {author}
                    </DropdownMenuItem>
                  ))}

                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                    By Access
                  </div>
                  {DUMMY_FILTER_ACCESS.map((access) => (
                    <DropdownMenuCheckboxItem
                      key={access}
                      checked={dummyFilters.access.includes(access)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() =>
                        setDummyFilters((prev) => ({
                          ...prev,
                          access: prev.access.includes(access)
                            ? prev.access.filter((item) => item !== access)
                            : [...prev.access, access],
                        }))
                      }
                    >
                      {access}
                    </DropdownMenuCheckboxItem>
                  ))}

                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-gray-400">
                    By Status
                  </div>
                  {DUMMY_FILTER_STATUSES.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={dummyFilters.statuses.includes(status)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() =>
                        setDummyFilters((prev) => ({
                          ...prev,
                          statuses: prev.statuses.includes(status)
                            ? prev.statuses.filter((item) => item !== status)
                            : [...prev.statuses, status],
                        }))
                      }
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}

                  {activeDummyFilterCount > 0 && (
                    <DropdownMenuItem
                      className="cursor-pointer text-[#b5502f]"
                      onClick={() => setDummyFilters(EMPTY_FILTERS)}
                    >
                      Clear filters
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      >
        <div className="w-full flex flex-row gap-6 min-h-0 flex-1">
          <div className="min-w-0 flex-1 templates-table">
            {demo ? (
              <TableManager
                {...{
                  columns,
                  staticData: filteredTemplates,
                  clientSideSearch: true,
                  loading: loadingTemplates,
                  emptyTablePlaceholder: 'No user settings templates found',
                  splitStickyHeader: true,
                  visibleRowCount: 5,
                  defaultPageSize: 8,
                  perPageOptions: [8, 25, 50, 100, 200],
                  getRowClassName: getTemplateRowClassName,
                }}
              />
            ) : (
              <TableManager
                {...{
                  columns,
                  fetcherKey: 'userTemplateList',
                  fetcherFn: templateList,
                  extraParams: { filter: [{ key: 'name', value: debouncedSearch }] },
                  emptyTablePlaceholder: 'No user settings templates found',
                  splitStickyHeader: true,
                  visibleRowCount: 5,
                  defaultPageSize: 8,
                  perPageOptions: [8, 25, 50, 100, 200],
                  getRowClassName: getTemplateRowClassName,
                }}
              />
            )}
          </div>
          {demo && (
            <TemplateInsightsPanel templates={allTemplates as any[]} loading={loadingTemplates} />
          )}
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
          title={`${drawerState?.tempDetails ? `Update User Settings Template (${drawerState?.tempDetails?.name})` : 'Add User Settings Template'}`}
          handleClose={() =>
            setDrawerState((prev) => ({ ...prev, isAddEdit: false, tempDetails: null }))
          }
          content={
            <UpsertUserSettingsTemplate
              drawerState={drawerState?.isAddEdit}
              setDrawerState={() =>
                setDrawerState((prev) => ({ ...prev, isAddEdit: false, tempDetails: null }))
              }
              data={drawerState?.tempDetails}
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
          title={`Apply "${drawerState?.tempDetails?.name}" to people`}
          handleClose={() => setDrawerState((prev) => ({ ...prev, isApply: false, tempDetails: null }))}
          content={
            <ApplyUserSettingsTemplate
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
              mutateDelete(drawerState?.tempDetails?.uuid);
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

export default UserSettings;
