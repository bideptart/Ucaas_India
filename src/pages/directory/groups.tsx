import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDepartmentList, getUserList, updateMemberForwading } from '@/services/api';
import CustomAvatar from '@/components/custom/custom-avatar';
import { Icon } from '@/assets/icons/icon';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCompanyFeatures } from '@/hooks/rbac';
import NewDepartment from '@/pages/admin-settings/phone-systems/departments/new-department';
import { Ic } from '@/components/mcm/icons';
import { DirectoryPage, EmptyRow, SearchChip } from './page-shell';
import { capitalizeFirstLetter, handleAlert } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useSocketEvents } from '@/hooks/use-socket-events';
import { useDialpad } from '@/hooks/use-dialpad';
import CustomTooltip from '@/components/custom/custom-tooltip';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import './groups-glass.css';

const parseJson = (value: unknown): any => {
  try {
    return typeof value === 'string' ? JSON.parse(value || 'null') : value;
  } catch {
    return null;
  }
};

const parseMembers = (members: unknown): any[] => {
  const parsed = parseJson(members);
  return Array.isArray(parsed) ? parsed : [];
};

const Groups = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [openGroup, setOpenGroup] = useState<any>(null);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [personForm, setPersonForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', site: '', extension: '',
  });

  const { features } = useCompanyFeatures();
  const phoneSystem = features?.plan_features?.phone_system_action;
  const canCreateGroup = Boolean(phoneSystem?.access?.DEPARTMENT && phoneSystem?.action?.add);

  const { user } = useUser();
  const { usersOnlineStatus, createNewChat, createPrivateChatId } = useSocketEvents();
  const { makeCall, sessions } = useDialpad();

  const iamOnCall = Object.values(sessions || {}).some((session: any) => {
    const status = String(session?.status || '').toLowerCase();
    return ['ringing', 'connecting', 'confirmed', 'calling'].includes(status);
  });

  const { data: rows = [], isPending } = useQuery({
    queryKey: ['getDepartmentList', 'directoryGroups'],
    queryFn: () => getDepartmentList({ page: 1, limit: 200 }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
  });

  const { data: people = [] } = useQuery({
    queryKey: ['directoryPeople'],
    queryFn: () => getUserList({ page: 1, limit: 500 }),
    select: (res: any) => res?.data?.data?.result?.rows || [],
  });

  const peopleByUuid = useMemo(() => {
    const map = new Map<string, any>();
    people.forEach((person: any) => {
      if (person?.uuid) map.set(String(person.uuid), person);
    });
    return map;
  }, [people]);

  const resolvePerson = (entry: any) => {
    const person = entry?.user_uuid ? peopleByUuid.get(String(entry.user_uuid)) : null;
    const name =
      entry?.label ||
      `${person?.first_name || ''} ${person?.last_name || ''}`.trim() ||
      person?.name || entry?.name || '';
    return {
      uuid: entry?.user_uuid || person?.uuid,
      name,
      extension: entry?.value || person?.extension || '',
      email: entry?.email || person?.email || '',
      role: entry?.role || person?.custom_role_data?.name || person?.role_data?.name || person?.role || '',
      profile: entry?.profile || person?.profile || '',
      user_uuid: entry?.user_uuid || person?.uuid || '',
      _full: person,
    };
  };

  const getMemberPresence = (ext: any) => {
    const s = usersOnlineStatus?.find((u: any) => u?.userId == ext);
    if (s?.onCall) return { label: 'On Call', tone: 'busy' };
    if (s?.online) return { label: 'Available', tone: 'good' };
    return { label: 'Offline', tone: 'neutral' };
  };

  const handleMakeCall = (number: any) => {
    if (!number || iamOnCall) return;
    makeCall(String(number));
  };

  const handleStartChat = (memberData: any) => {
    if (!memberData?.user_uuid) return;
    createNewChat({ uuid: memberData?.user_uuid, ...memberData });
    navigate(
      `/messenger?channel=chat&type=all&chatId=${createPrivateChatId([user?.uuid, memberData?.user_uuid])}&exact=true`,
    );
  };

  const openMemberProfile = (resolved: any) => {
    const fullUser = resolved._full;
    const nameParts = (resolved.name || '').split(' ');
    setSelectedMember(resolved);
    setPersonForm({
      first_name: fullUser?.first_name || nameParts[0] || '',
      last_name: fullUser?.last_name || nameParts.slice(1).join(' ') || '',
      email: fullUser?.email || resolved.email || '',
      phone: fullUser?.phone || fullUser?.mobile || '',
      site: fullUser?.site?.name || '',
      extension: String(fullUser?.extension || resolved.extension || ''),
    });
  };

  const { mutate: savePerson, isPending: isSavingPerson } = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      updateMemberForwading({ userID: selectedMember?.user_uuid, uuid: selectedMember?.user_uuid, ...payload }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['directoryPeople'] });
      handleAlert({ text: data?.data?.data?.message || 'Saved', type: 'success' });
      setSelectedMember(null);
    },
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row: any) => {
      const manager = parseJson(row?.manager);
      const managerName = manager?.name || manager?.label || '';
      return [row?.name, row?.extension, managerName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, search]);

  const groupManager = openGroup ? resolvePerson(parseJson(openGroup?.manager) || {}) : null;
  const groupMembers = openGroup
    ? Array.from(
        new Map(
          parseMembers(openGroup?.members).map((entry: any) => [entry?.user_uuid, resolvePerson(entry)]),
        ).values(),
      )
    : [];

  return (
    <>
      <div className="gp-groups gp-dirlist">
        <DirectoryPage
          title="Groups"
          description="Teams that answer calls together. Each group has an extension, a manager and the people in it."
          actions={
            <>
              <button type="button" className="btn ghost" onClick={() => navigate('/directory?view=people')}>
                <Ic n="users" />
                People
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const csv = [
                    ['Group', 'Manager', 'People', 'Extension'].join(','),
                    ...visible.map((row: any) => {
                      const mgr = parseJson(row?.manager);
                      const mgrName = mgr?.name || mgr?.label || '';
                      const members = parseMembers(row?.members);
                      return [row?.name || '', mgrName, members.length, row?.extension || '']
                        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                        .join(',');
                    }),
                  ].join('\n');
                  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `groups-${new Date().toISOString().slice(0, 10)}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Ic n="dl" />
                Export
              </button>
              {canCreateGroup ? (
                <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                  <Ic n="plus" />
                  New group
                </button>
              ) : null}
            </>
          }
          filters={
            <>
              <SearchChip value={search} onChange={setSearch} placeholder="Search groups" />
              <span className="fchip live" style={{ marginLeft: 'auto' }}>
                <span className="num">{rows.length}</span> group{rows.length === 1 ? '' : 's'}
              </span>
            </>
          }
        >
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Manager</th>
                <th>People</th>
                <th>Extension</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <EmptyRow span={5} message="Loading groups…" />
              ) : visible.length ? (
                visible.map((row: any) => {
                  const manager = parseJson(row?.manager);
                  const managerName = capitalizeFirstLetter(manager?.name || manager?.label || '');
                  const members = parseMembers(row?.members);
                  return (
                    <tr key={row?.uuid} style={{ cursor: 'pointer' }} onClick={() => setOpenGroup(row)}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <CustomAvatar name={row?.name} size="30" />
                          <span style={{ fontWeight: 700 }}>{row?.name || '—'}</span>
                        </span>
                      </td>
                      <td>{managerName || <span style={{ color: 'var(--ink-4)' }}>—</span>}</td>
                      <td><span className="tag acc num">{members.length}</span></td>
                      <td className="num">{row?.extension || '—'}</td>
                      <td>
                        <span className="mini">
                          <Ic n="chev" size={12} />
                          Open
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <EmptyRow span={5} message={rows.length ? 'No groups match that search.' : 'No Department Found'} />
              )}
            </tbody>
          </table>
        </DirectoryPage>
      </div>

      {/* Create group dialog */}
      <Dialog open={creating} onOpenChange={(next) => !next && setCreating(false)}>
        <DialogContent className="gp-create-group-dialog sm:max-w-[920px]" showCloseButton={false}>
          <div className="gp-create-group-head">
            <h2>Create group</h2>
            <button type="button" aria-label="Close" className="gp-create-group-close" onClick={() => setCreating(false)}>
              <Icon name="CloseIcon" className="h-4 w-4" />
            </button>
          </div>
          <div className="gp-create-group-body">
            <NewDepartment rowData={{}} setDrawerState={setCreating} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Group detail dialog — opens on same page, no navigation */}
      <Dialog open={Boolean(openGroup)} onOpenChange={(next) => !next && setOpenGroup(null)}>
        <DialogContent className="sm:max-w-[640px] w-[calc(100vw-32px)] p-0 gap-0 rounded-2xl overflow-hidden border border-[rgba(225,200,165,0.5)]">
          {openGroup && (
            <div className="flex flex-col max-h-[80vh]">
              {/* Group header */}
              <div className="flex items-center gap-3.5 px-6 py-4 border-b border-[rgba(225,200,165,0.3)] bg-[rgba(251,249,246,0.6)]">
                <CustomAvatar name={openGroup?.name} size="44" />
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-bold text-gray-900 truncate">{openGroup?.name}</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[13px] text-gray-500 flex items-center gap-1">
                      <Icon name="Grid" className="w-3.5 h-3.5" />
                      {openGroup?.extension || '—'}
                    </span>
                    <span className="text-[13px] text-gray-500">
                      {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
                {/* Description */}
                {openGroup?.description && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
                    <p className="text-sm text-gray-700">{openGroup.description}</p>
                  </div>
                )}

                {/* Manager */}
                {groupManager?.uuid && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Manager</p>
                    <div
                      className="flex items-center gap-3 p-3 rounded-xl border border-[rgba(225,200,165,0.35)] bg-[rgba(251,249,246,0.5)] cursor-pointer hover:bg-[#FBE2C8]/40 transition-colors"
                      onClick={() => openMemberProfile(groupManager)}
                    >
                      <CustomAvatar name={groupManager.name} showPresence extension={groupManager.extension} image={groupManager.profile} size="38" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate capitalize">{groupManager.name}</p>
                          {groupManager.role && <span className="text-[10px] font-semibold text-primary uppercase">{groupManager.role}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Icon name="Grid" className="w-3 h-3" />
                            {groupManager.extension}
                          </span>
                          {groupManager.email && <span className="text-xs text-gray-400 truncate">{groupManager.email}</span>}
                        </div>
                      </div>
                      {groupManager.user_uuid !== user?.uuid && (
                        <div className="flex shrink-0 gap-1.5">
                          <CustomTooltip text="Call" side="top">
                            <div
                              className={`flex items-center justify-center rounded-full w-8 h-8 ${iamOnCall ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-50 text-green-500 hover:bg-green-500 hover:text-white cursor-pointer'} transition-colors`}
                              onClick={(e) => { e.stopPropagation(); handleMakeCall(groupManager.extension); }}
                            >
                              <Icon name="PhoneIcon" className="w-3.5 h-3.5" />
                            </div>
                          </CustomTooltip>
                          <CustomTooltip text="Chat" side="top">
                            <div
                              className="flex items-center justify-center rounded-full w-8 h-8 bg-[#FBE2C8]/50 text-[#2E2D35]/70 hover:bg-primary hover:text-white cursor-pointer transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleStartChat(groupManager); }}
                            >
                              <Icon name="MessageStrokIcon" className="w-3.5 h-3.5" />
                            </div>
                          </CustomTooltip>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Members */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Members</p>
                  <div className="flex flex-col gap-2">
                    {groupMembers.length ? (
                      groupMembers.map((member: any) => {
                        const presence = getMemberPresence(member.extension);
                        return (
                          <div
                            key={member.uuid}
                            className="flex items-center gap-3 p-3 rounded-xl border border-[rgba(225,200,165,0.35)] bg-white cursor-pointer hover:bg-[#FBE2C8]/30 transition-colors"
                            onClick={() => openMemberProfile(member)}
                          >
                            <CustomAvatar name={member.name} showPresence extension={member.extension} image={member.profile} size="38" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate capitalize">{member.name}</p>
                                {member.role && <span className="text-[10px] font-semibold text-primary uppercase">{member.role}</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <Icon name="Grid" className="w-3 h-3" />
                                  {member.extension}
                                </span>
                                {member.email && <span className="text-xs text-gray-400 truncate">{member.email}</span>}
                                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                                  presence.tone === 'good' ? 'text-emerald-600' :
                                  presence.tone === 'busy' ? 'text-red-500' :
                                  'text-gray-400'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    presence.tone === 'good' ? 'bg-emerald-500' :
                                    presence.tone === 'busy' ? 'bg-red-500' :
                                    'bg-gray-400'
                                  }`} />
                                  {presence.label}
                                </span>
                              </div>
                            </div>
                            {member.user_uuid !== user?.uuid && (
                              <div className="flex shrink-0 gap-1.5">
                                <CustomTooltip text="Call" side="top">
                                  <div
                                    className={`flex items-center justify-center rounded-full w-8 h-8 ${iamOnCall ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-50 text-green-500 hover:bg-green-500 hover:text-white cursor-pointer'} transition-colors`}
                                    onClick={(e) => { e.stopPropagation(); handleMakeCall(member.extension); }}
                                  >
                                    <Icon name="PhoneIcon" className="w-3.5 h-3.5" />
                                  </div>
                                </CustomTooltip>
                                <CustomTooltip text="Chat" side="top">
                                  <div
                                    className="flex items-center justify-center rounded-full w-8 h-8 bg-[#FBE2C8]/50 text-[#2E2D35]/70 hover:bg-primary hover:text-white cursor-pointer transition-colors"
                                    onClick={(e) => { e.stopPropagation(); handleStartChat(member); }}
                                  >
                                    <Icon name="MessageStrokIcon" className="w-3.5 h-3.5" />
                                  </div>
                                </CustomTooltip>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-gray-400 py-3 text-center">No members in this group</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end px-6 py-3 border-t border-[rgba(225,200,165,0.3)] bg-[rgba(251,249,246,0.4)]">
                <button
                  type="button"
                  className="h-9 px-5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setOpenGroup(null)}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Member profile dialog — People-style */}
      <Dialog open={Boolean(selectedMember)} onOpenChange={(next) => !next && setSelectedMember(null)}>
        <DialogContent className="sm:max-w-[560px] w-[calc(100vw-32px)] p-0 gap-0 rounded-2xl overflow-hidden border border-[rgba(225,200,165,0.5)]">
          {selectedMember && (() => {
            const presence = getMemberPresence(selectedMember?.extension);
            const callerId = selectedMember?._full?.caller_id || '';
            return (
              <div className="flex flex-col">
                <div className="flex items-center gap-3.5 px-6 py-5 border-b border-gray-100 bg-[rgba(251,249,246,0.6)]">
                  <CustomAvatar name={selectedMember?.name} image={selectedMember?.profile} size="48" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-bold text-gray-900 truncate">{selectedMember?.name}</div>
                    <div className="text-[13px] text-gray-500 mt-0.5">{selectedMember?.role || 'Member'}</div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    presence.tone === 'good' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    presence.tone === 'busy' ? 'bg-red-50 text-red-600 border border-red-200' :
                    'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      presence.tone === 'good' ? 'bg-emerald-500' :
                      presence.tone === 'busy' ? 'bg-red-500' :
                      'bg-gray-400'
                    }`} />
                    {presence.label}
                  </span>
                </div>

                <div className="px-6 py-5 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Name</label>
                      <input className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" value={personForm.first_name} onChange={(e) => setPersonForm((p) => ({ ...p, first_name: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Name</label>
                      <input className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" value={personForm.last_name} onChange={(e) => setPersonForm((p) => ({ ...p, last_name: e.target.value }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                      <input className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" type="email" value={personForm.email} onChange={(e) => setPersonForm((p) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
                      <div className="[&_.react-tel-input_.form-control]:!h-10 [&_.react-tel-input_.form-control]:!rounded-lg [&_.react-tel-input_.form-control]:!border-gray-200 [&_.react-tel-input_.form-control]:!text-sm [&_.react-tel-input_.form-control]:!w-full [&_.react-tel-input_.flag-dropdown]:!rounded-l-lg [&_.react-tel-input_.flag-dropdown]:!border-gray-200">
                        <PhoneInput country={'in'} onlyCountries={['in']} disableDropdown value={personForm.phone} onChange={(value) => setPersonForm((p) => ({ ...p, phone: `+${value.startsWith('91') ? value : '91'}` }))} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Site</label>
                      <input className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 cursor-not-allowed" value={personForm.site} disabled />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Extension</label>
                      <input className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 cursor-not-allowed" value={personForm.extension} disabled />
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Caller ID</span>
                    {callerId ? (
                      <span className="text-sm font-medium text-gray-900">{callerId}</span>
                    ) : (
                      <span className="text-sm text-gray-400">Not assigned</span>
                    )}
                  </div>
                </div>

                {selectedMember?.user_uuid !== user?.uuid && (
                  <div className="px-6 pb-5 flex items-center gap-3">
                    <button
                      type="button"
                      className="group flex-1 flex items-center justify-center gap-2.5 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-primary hover:border-primary hover:text-white active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
                      disabled={!selectedMember?.extension || iamOnCall}
                      onClick={() => { handleMakeCall(selectedMember?.extension); setSelectedMember(null); }}
                    >
                      <Icon name="PhoneIcon" className="w-4 h-4" />
                      <span>Call</span>
                    </button>
                    <button
                      type="button"
                      className="group flex-1 flex items-center justify-center gap-2.5 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-primary hover:border-primary hover:text-white active:scale-[0.98] transition-all duration-150"
                      onClick={() => { handleStartChat(selectedMember); setSelectedMember(null); }}
                    >
                      <Icon name="MessageStrokIcon" className="w-4 h-4" />
                      <span>Message</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                  <button type="button" className="h-9 px-5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setSelectedMember(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-9 px-5 rounded-lg bg-primary text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                    disabled={isSavingPerson}
                    onClick={() => savePerson({ first_name: personForm.first_name, last_name: personForm.last_name, email: personForm.email, phone: personForm.phone })}
                  >
                    {isSavingPerson ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Groups;
