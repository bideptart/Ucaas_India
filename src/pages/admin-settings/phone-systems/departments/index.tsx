import CustomTooltip from '@/components/custom/custom-tooltip';
import TableManager from '@/components/custom/table-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, getInitials, getObjectLength, handleAlert } from '@/lib/utils';
import { deleteDepartment, getDepartmentList } from '@/services/api';
import { useState } from 'react';
import NewDepartment from './new-department';
import DepartmentDetails from './department-details';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AlertConfirm from '@/components/custom/alert-confirm';
import { Plus, SearchLine } from '@/assets/icons';
import SideDrawer from '@/components/custom/side-drawer';
import { Icon, IconName } from '@/assets/icons/icon';
import useDebounce from '@/hooks/use-debounce';
import { useCompanyFeatures } from '@/hooks/rbac';
import AgentDetailsModal from '@/pages/auto-dialer/campaign/modal/agent-details-modal';
import { ModalState } from '@/pages/auto-dialer/campaign';
import { useLocation } from 'react-router-dom';

const UserDepartment = () => {
  const queryClient = useQueryClient();
  const [showInfo, setShowInfo] = useState(false);
  const [rowData, setRowData] = useState<any>({});
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebounce(search, 1000);
  const location = useLocation();
  const isSharedLine = location?.pathname?.includes('shared-line');
  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    type: null,
    data: [],
  });
  const [drawerState, setDrawerState] = useState<any>(false);
  const [open, setOpen] = useState(false);
  const { features } = useCompanyFeatures();
  const phoneSystem = features?.plan_features?.phone_system_action;

  const hasDepartmentAccess = Boolean(phoneSystem?.access?.DEPARTMENT);
  const departmentActions = phoneSystem?.action;

  const { mutate: mutateDeleteDepartment, isPending } = useMutation({
    mutationKey: ['deleteDepartment'],
    mutationFn: deleteDepartment,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['getDepartmentList'] });
      handleAlert({
        text: data?.data?.data?.message || 'Department deleted successfully',
        type: 'success',
      });
      setOpen(false);
    },
  });

  const columns = [
    {
      header: 'Date',
      accessorKey: 'created_at',
      cell: ({ getValue }: any) => <div className="text-gray-600">{formatDate(getValue())}</div>,
    },
    {
      header: 'Department Name',
      accessorKey: 'name',
      cell: (props: any) => {
        const data = props?.row?.original;
        return (
          <button
            type="button"
            className="text-primary hover:text-primary/80 underline underline-offset-4 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-sm"
            onClick={() => {
              setShowInfo(true);
              setRowData(data);
            }}
          >
            {data?.name}
          </button>
        );
      },
    },
    {
      header: 'Extension',
      accessorKey: 'extension',
      cell: ({ getValue }: any) => (
        <div className="flex shrink-0 items-center gap-1 text-gray-500">
          <Icon name="Grid" className="w-4 h-4" aria-hidden="true" />
          <small className="text-xs tabular-nums">{getValue() || '---'}</small>
        </div>
      ),
    },

    {
      header: 'Manager',
      accessorKey: 'manager',
      /* Same shape problem as Site below: a manager comes back as a JSON
         string on some rows and as a plain name on others. The unguarded
         JSON.parse threw on the plain-name rows and took the whole table
         down with it. */
      cell: ({ getValue }: any) => {
        const raw = getValue();
        let name = '';
        if (typeof raw === 'string') {
          if (raw.trim().startsWith('{')) {
            try {
              name = JSON.parse(raw)?.label || '';
            } catch {
              name = raw;
            }
          } else {
            name = raw;
          }
        } else {
          name = raw?.label || '';
        }

        return <div className="text-gray-600 capitalize">{name || '---'}</div>;
      },
    },
    {
      header: 'Site',
      accessorKey: 'site',
      cell: ({ getValue }: any) => {
        const isJsonString = (str: unknown): str is string => {
          return typeof str === 'string' && str.trim().startsWith('{') && str.trim().endsWith('}');
        };

        const value = getValue();
        const Name = isJsonString(value) ? JSON.parse(value)?.label || '' : value;
        return <span>{Name || '---'}</span>;
      },
    },
    {
      header: 'Members',
      accessorKey: 'members',
      cell: ({ getValue }: any) => {
        let members = [];
        try {
          const parsed =
            typeof getValue() === 'string' ? JSON.parse(getValue() || '[]') : getValue();
          members = Array.isArray(parsed)
            ? Array.from(new Map(parsed.map((item: any) => [item.user_uuid, item])).values())
            : [];
        } catch (error) {
          console.error('Error parsing members JSON:', error);
        }

        return Array.isArray(members) ? (
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((item: any, index: number) => {
              const username = item?.label || 'Unknown';
              const imageUrl = item?.imageUrl || '';
              return (
                <CustomTooltip key={index} text={username} side="top">
                  <div className="mcm-avatar-hit w-9 h-9 cursor-pointer">
                    <div className="mcm-avatar-chip w-9 h-9 flex items-center justify-center border border-white rounded-full bg-gray-200 dark:border-gray-800">
                      {imageUrl ? (
                        <img
                          className="w-9 h-9 rounded-full"
                          src={imageUrl}
                          alt={username}
                          width={36}
                          height={36}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center rounded-full border border-gray-400 bg-gray-100 text-gray-600 text-xs capitalize">
                          {getInitials(username)}
                        </div>
                      )}
                    </div>
                  </div>
                </CustomTooltip>
              );
            })}

            {members?.length > 5 && (
              <button
                type="button"
                aria-label={`Show all ${members.length} members`}
                onClick={() => {
                  setModalState({ open: true, data: members || [], type: 'Total Members' });
                }}
                className="mcm-avatar-more w-9 h-9 flex items-center justify-center border border-gray-500 rounded-full bg-gray-500 text-white font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                +{members?.length - 5}
              </button>
            )}
          </div>
        ) : (
          <div>No members</div>
        );
      },
    },

    {
      header: 'Action',
      accessorKey: 'action',
      cell: (props: any) => {
        const data = props?.row?.original;
        const actions = [
          hasDepartmentAccess &&
            departmentActions?.edit && {
              icon: 'EditStrokIcon',
              onClick: () => {
                setDrawerState(true);
                setRowData(data);
              },

              className: 'bg-gray-100 text-gray-900/80 hover:bg-primary hover:text-white',
              tooltipText: 'Edit',
            },
          hasDepartmentAccess &&
            departmentActions?.delete && {
              icon: 'TrashBin',
              onClick: () => {
                setOpen(true);
                setRowData(data);
              },
              className: 'bg-red-100 text-red-500 hover:bg-red-500 hover:text-white',
              tooltipText: 'Delete',
            },
        ].filter(Boolean);

        if (!actions?.length) return '---';

        return (
          <div className="flex items-center gap-2">
            {actions?.map((action, index) => (
              <CustomTooltip key={index} text={action.tooltipText} side="top">
                <button
                  type="button"
                  aria-label={action.tooltipText}
                  className={`mcm-row-action cursor-pointer flex items-center justify-center rounded-full w-8 h-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${action.className}`}
                  onClick={() => {
                    action.onClick();
                  }}
                >
                  <Icon name={action.icon as IconName} className="w-5 h-5" aria-hidden="true" />
                </button>
              </CustomTooltip>
            ))}
          </div>
        );
      },
    },
  ];

  const handleNewDepartment = () => {
    setDrawerState(true);
    setRowData({});
  };

  return (
    <section className="w-full bg-gray-200/15 flex flex-col overflow-x-auto overflow-y-hidden overflow-x-auto overflow-y-hidden">
      <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-b border-gray-200 min-h-[65px] bg-white">
        <div className="text-gray-900 font-semibold text-lg flex items-center gap-1">
          Phone System
          <div className="-rotate-90 text-gray-800">
            <Icon name="ChevronIcon" className="w-5 h-5" />
          </div>
          <span className="text-primary text-md">{isSharedLine ? 'Shared Lines' : 'Departments'}</span>
        </div>
        {!showInfo && (
          <div className="flex gap-2 filters">
            <Input
              type="search"
              name="department-search"
              autoComplete="off"
              spellCheck={false}
              aria-label={isSharedLine ? 'Search shared lines' : 'Search departments'}
              placeholder="Search…"
              className="pl-10 w-full min-h-9 rounded-lg"
              IconPosition="left-0 pl-2 inset-y-0"
              value={search}
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith(' ')) return;
                setSearch(value);
              }}
              Icon={<SearchLine className="text-gray-700" aria-hidden="true" />}
            />
            {hasDepartmentAccess && departmentActions?.add && (
              <Button
                className="min-h-9"
                variant={'outline'}
                onClick={() => {
                  handleNewDepartment();
                }}
              >
                <Plus className="w-3 h-3" /> New Department
              </Button>
            )}
          </div>
        )}
      </div>
      {!showInfo ? (
        <div className="w-full p-3 flex flex-col gap-2">
          <p className="text-gray-900 text-sm">
            {isSharedLine
              ? 'Multi-Department Sharing, this feature to link one or more departments to a single shared line. This creates a unified communication point where all assigned departments can manage calls from the same number simultaneously.'
              : 'Create a department to organize your company’s workflow. This allows you to route calls to specific teams (e.g., Support or Billing) and assign multiple users to a single extension so they can handle incoming calls together.'}
          </p>
          <div className="panel-card">
            <div className="tbl-wrap">
              <TableManager
                {...{
                  fetcherKey: 'getDepartmentList',
                  fetcherFn: getDepartmentList,
                  columns,
                  extraParams: {
                    filter: [{ key: 'name', value: debouncedSearch }],
                  },
                  emptyTablePlaceholder: 'No departments created yet',
                  descriptionEmptyTable: 'Create a department to see here.',
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <DepartmentDetails handleBack={() => setShowInfo(false)} tabData={rowData} />
      )}
      {modalState?.open && (
        <AgentDetailsModal modalState={modalState} setModalState={setModalState} />
      )}
      {drawerState && (
        <SideDrawer
          isOpen={drawerState}
          title={
            getObjectLength(rowData) ? `Update Department (${rowData?.name})` : 'Create Department'
          }
          handleClose={() => setDrawerState(false)}
          isTab={false}
          enableResponsive
          headerClassName="min-h-8 px-4 sm:px-5"
          content={
            <NewDepartment
              drawerState={drawerState}
              setDrawerState={setDrawerState}
              rowData={rowData}
            />
          }
        />
      )}

      <AlertConfirm
        {...{
          apiLoading: isPending,
          onConfirm: () => {
            mutateDeleteDepartment(rowData?.uuid);
          },
          open,
          setOpen,
        }}
      />
    </section>
  );
};

export default UserDepartment;
