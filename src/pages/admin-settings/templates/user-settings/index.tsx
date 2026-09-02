import { Plus } from '@/assets/icons';
// import Breadcrumb from '@/components/custom/breadcrumb';
import SideDrawer from '@/components/custom/side-drawer';
import TableManager from '@/components/custom/table-manager';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, handleAlert } from '@/lib/utils';
import { templateDelete, templateList, upsertTemplate } from '@/services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { FC, useMemo, useState } from 'react';
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
  isDummyTemplateArchived,
  isDummyTemplateFavourite,
  toggleDummyTemplateArchived,
  toggleDummyTemplateFavourite,
  type DummyTemplateStatus,
} from './dummy-template-meta';
import TemplateInsightsPanel from './template-insights-panel';

// const breadcrumbData = [{ label: 'Templates' }, { label: 'User Settings' }];

interface IUserSettingsState {
  isAddEdit: boolean;
  tempDetails: any;
  isDeleteAlert: boolean;
  isApply: boolean;
  isBulkDeleteAlert: boolean;
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

/* Deleting several templates back-to-back is a real write against the real
   API (in both demo and production) — never fire them in parallel. Same
   150ms pause company-bulk-settings.tsx uses, for the same reason: a burst of
   simultaneous writes is how a bulk action turns into an outage. */
const BULK_DELETE_PAUSE_MS = 150;

const UserSettings: FC = () => {
  const navigate = useNavigate();
  const [drawerState, setDrawerState] = useState<IUserSettingsState>({
    isAddEdit: false,
    tempDetails: null,
    isDeleteAlert: false,
    isApply: false,
    isBulkDeleteAlert: false,
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
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const selectableUuids = useMemo(
    () =>
      filteredTemplates
        .filter((template) => template?.name !== COMPANY_DEFAULT_TEMPLATE_NAME)
        .map((template) => template?.uuid)
        .filter(Boolean),
    [filteredTemplates],
  );
  const isAllSelected =
    selectableUuids.length > 0 && selectableUuids.every((uuid) => selectedUuids.has(uuid));
  const isSomeSelected = !isAllSelected && selectableUuids.some((uuid) => selectedUuids.has(uuid));

  const toggleSelectAll = () => {
    setSelectedUuids(isAllSelected ? new Set() : new Set(selectableUuids));
  };
  const toggleRow = (uuid: string) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

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

  const { mutate: mutateDuplicate, isPending: duplicating } = useMutation({
    mutationFn: (template: any) =>
      upsertTemplate({
        name: `Copy of ${template?.name}`,
        settings: template?.settings,
        greetings: template?.greetings,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTemplateList'] });
      handleAlert({ text: 'Template duplicated.', type: 'success' });
    },
    onError: () => handleAlert({ text: 'Could not duplicate this template.', type: 'error' }),
  });

  /* Real writes against the real templateDelete endpoint, run one at a time —
     this works the same whether demo mode is on or off, unlike the
     checkboxes/bulk bar around it, which are demo-only UI. */
  const runBulkDelete = async () => {
    const targets = Array.from(selectedUuids);
    if (!targets.length) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const uuid of targets) {
      try {
        await templateDelete(uuid);
      } catch {
        failed += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, BULK_DELETE_PAUSE_MS));
    }
    queryClient.invalidateQueries({ queryKey: ['userTemplateList'] });
    setSelectedUuids(new Set());
    setBulkDeleting(false);
    setDrawerState((prev) => ({ ...prev, isBulkDeleteAlert: false }));
    if (failed) {
      handleAlert({
        text: `${targets.length - failed} of ${targets.length} template(s) deleted — ${failed} failed.`,
        type: 'error',
      });
    } else {
      handleAlert({ text: `${targets.length} template(s) deleted.`, type: 'success' });
    }
  };

  const runBulkArchive = (nextArchived: boolean) => {
    selectedUuids.forEach((uuid) => toggleDummyTemplateArchived(uuid, nextArchived));
    setDemoMetaVersion((v) => v + 1);
    handleAlert({
      text: `${selectedUuids.size} template(s) ${nextArchived ? 'archived' : 'unarchived'}.`,
      type: 'success',
    });
    setSelectedUuids(new Set());
  };

  /* Genuinely builds and downloads a file — not a placeholder. Reuses the
     same quoting rules the People-page export already relies on
     (src/lib/user-roster-export.ts) rather than re-deriving CSV escaping. */
  const runBulkExport = () => {
    const rows = filteredTemplates.filter((template) => selectedUuids.has(template?.uuid));
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

  const columns: ColumnDef<any>[] = [
    ...(demo
      ? ([
          {
            header: () => (
              <Checkbox
                checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all templates"
              />
            ),
            accessorKey: 'select',
            meta: { textAlign: 'center' },
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const uuid = row?.original?.uuid;
              return (
                <Checkbox
                  checked={selectedUuids.has(uuid)}
                  onCheckedChange={() => toggleRow(uuid)}
                  aria-label={`Select ${row?.original?.name}`}
                />
              );
            },
          },
        ] as ColumnDef<any>[])
      : []),
    {
      header: 'Name',
      accessorKey: 'name',
      meta: { textAlign: 'center' },
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
        const meta = demo ? getDummyTemplateMeta(row?.original) : null;
        const favourite = meta ? isDummyTemplateFavourite(row?.original?.uuid, meta.baseFavourite) : false;
        return (
          <div className="flex flex-col items-center gap-0.5 text-center">
            <span className="flex items-center gap-1.5">
              {demo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDummyTemplateFavourite(row?.original?.uuid, !favourite);
                    setDemoMetaVersion((v) => v + 1);
                  }}
                  className="shrink-0"
                  aria-label={favourite ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Icon
                    name="Star"
                    className={`w-4 h-4 ${favourite ? 'text-amber-500 fill-current' : 'text-gray-300'}`}
                  />
                </button>
              )}
              <span
                onClick={() =>
                  setDrawerState((prev) => ({
                    ...prev,
                    isAddEdit: true,
                    tempDetails: row?.original,
                  }))
                }
                className="text-primary hover:text-primary/80 underline-offset-4 cursor-pointer"
              >
                {row?.original?.name}
              </span>
            </span>
            {meta && (
              <span className="text-[11px] leading-tight text-gray-500">
                Used in {meta.profileCount} user profiles
              </span>
            )}
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
            meta: { textAlign: 'center' },
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              return (
                <div className="flex flex-wrap gap-1">
                  {meta.tags.map((tag) => {
                    const colours = getTagColours(tag);
                    return (
                      <span
                        key={tag}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: colours.bg, color: colours.text }}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              );
            },
          },
          {
            header: 'Access',
            accessorKey: 'access',
            meta: { textAlign: 'center' },
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              const colours = getAccessColours(meta.access);
              return (
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: colours.bg, color: colours.text }}
                >
                  {meta.access}
                </span>
              );
            },
          },
          {
            header: 'Status',
            accessorKey: 'status',
            meta: { textAlign: 'center' },
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              const status = getDummyTemplateStatus(row?.original?.uuid, meta.baseStatus);
              const colours = getStatusColours(status);
              return (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: colours.bg, color: colours.text }}
                >
                  {status}
                </span>
              );
            },
          },
          {
            header: 'Created By',
            accessorKey: 'created_by',
            meta: { textAlign: 'center' },
            cell: ({ row }: any) => {
              if (row?.original?.name === COMPANY_DEFAULT_TEMPLATE_NAME) return null;
              const meta = getDummyTemplateMeta(row?.original);
              return (
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: meta.author.colour }}
                  >
                    {meta.author.initials}
                  </span>
                  <span className="text-xs text-gray-700">{meta.author.name}</span>
                </div>
              );
            },
          },
        ] as ColumnDef<any>[])
      : []),
    {
      header: 'Created',
      accessorKey: 'created_at',
      meta: { textAlign: 'center' },
      cell: ({ row }) => <span>{formatDate(row?.original?.created_at)}</span>,
    },

    {
      header: 'Updated',
      accessorKey: 'updated_at',
      meta: { textAlign: 'center' },
      cell: ({ row }) => <span>{formatDate(row?.original?.updated_at)}</span>,
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

        const archivedMeta = demo ? getDummyTemplateMeta(data) : null;
        const archived = archivedMeta
          ? isDummyTemplateArchived(data?.uuid, archivedMeta.baseStatus)
          : false;

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
            icon: 'CopyLine',
            onClick: () => mutateDuplicate(data),
            className: 'bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white',
            tooltipText: duplicating ? 'Duplicating…' : 'Duplicate',
          },
          ...(demo
            ? [
                {
                  icon: archived ? 'Refresh' : 'Box',
                  onClick: () => {
                    toggleDummyTemplateArchived(data?.uuid, !archived);
                    setDemoMetaVersion((v) => v + 1);
                  },
                  className: 'bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white',
                  tooltipText: archived ? 'Unarchive' : 'Archive',
                },
              ]
            : []),
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
      <section className="w-full flex flex-col bg-gradient-to-b from-[#fdf3e7] via-[#fbe9d5] to-[#f7dcc0] min-h-full">
        {/* <Breadcrumb breadcrumbs={breadcrumbData} /> */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-b border-[#f0d6b4] min-h-[65px] bg-white/60 backdrop-blur-md">
          <div>
            <p className="text-gray-900 font-semibold text-lg flex items-center gap-1">
              Templates
              <div className="-rotate-90 text-gray-800">
                <Icon name="ChevronIcon" className="w-5 h-5" />
              </div>
              <span className="text-[#b5502f] text-md">User Settings</span>
            </p>
            <p className="text-gray-500 text-xs">
              Saved bundles of user settings you can apply when creating or editing someone.
            </p>
          </div>
          <div className="flex gap-2 filters  flex-col sm:flex-row">
            <Input
              type="search"
              placeholder="Search"
              onChange={(e) => setSearchedText(e.target.value)}
              className="w-64 min-h-9 rounded-lg"
            />
            {demo && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <div className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-[#f0d6b4] bg-white/70 px-3 min-h-9 text-sm text-[#b5502f] hover:bg-white">
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
            <Button
              variant={'outline'}
              type="button"
              className="min-h-9"
              onClick={() =>
                setDrawerState((prev) => ({ ...prev, isAddEdit: true, tempDetails: null }))
              }
            >
              <Plus className="w-3 h-3" />
              Add User Settings Template
            </Button>
          </div>
        </div>

        {demo && selectedUuids.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[#f0d6b4] bg-[#fdeee0]">
            <span className="text-xs font-semibold text-[#b5502f]">
              {selectedUuids.size} selected
            </span>
            <Button
              variant="outline"
              type="button"
              className="min-h-8 text-xs"
              onClick={() => runBulkArchive(true)}
            >
              Archive
            </Button>
            <Button
              variant="outline"
              type="button"
              className="min-h-8 text-xs"
              onClick={() => runBulkArchive(false)}
            >
              Unarchive
            </Button>
            <Button
              variant="outline"
              type="button"
              className="min-h-8 text-xs"
              onClick={runBulkExport}
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              type="button"
              className="min-h-8 text-xs text-red-600 hover:text-red-600"
              onClick={() => setDrawerState((prev) => ({ ...prev, isBulkDeleteAlert: true }))}
            >
              Delete
            </Button>
            <button
              type="button"
              className="text-xs text-gray-500 hover:underline"
              onClick={() => setSelectedUuids(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="w-full p-3 flex flex-row gap-3 min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {demo ? (
              <TableManager
                {...{
                  columns,
                  staticData: filteredTemplates,
                  clientSideSearch: true,
                  loading: loadingTemplates,
                  emptyTablePlaceholder: 'No user settings templates found',
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
                }}
              />
            )}
          </div>
          {demo && (
            <TemplateInsightsPanel templates={allTemplates as any[]} loading={loadingTemplates} />
          )}
        </div>
      </section>
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

      {drawerState?.isBulkDeleteAlert && (
        <AlertConfirm
          {...{
            apiLoading: bulkDeleting,
            onConfirm: runBulkDelete,
            open: drawerState?.isBulkDeleteAlert,
            setOpen: () => setDrawerState((prev) => ({ ...prev, isBulkDeleteAlert: false })),
            headerText: 'Delete Confirmation',
            descriptionTextComp: `Are you sure you want to delete ${selectedUuids.size} template(s)?`,
          }}
        />
      )}
    </>
  );
};

export default UserSettings;
