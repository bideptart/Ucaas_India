import { useMemo, useState } from 'react';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { useRecentlyRemoved } from './use-recently-removed';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import {
  History,
  MoreHorizontal,
  Pencil,
  PhoneOff,
  PhoneOutgoing,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { mayActOn } from '@/lib/role-rank';
import { Ic } from '@/components/mcm/icons';
import SideDrawer from '@/components/custom/side-drawer';
import UpdateForwarding from '@/pages/admin-settings/people/update-forwarding';
import { DirectoryPage, EmptyRow, FilterChip, SearchChip } from './page-shell';
import CustomAvatar from '@/components/custom/custom-avatar';
import { useConsoleDialer } from '@/pages/phone/console/dial-number';
import { useInstantMeeting } from '@/hooks/use-instant-meeting';
import { usePeopleRows, type PersonRow } from './people-rows';
import { useDirectoryFavourites } from './use-directory-favourites';
import { useUser } from '@/hooks/use-user';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteMember, removeAssignNumber, updateMemberForwading } from '@/services/api';
import { handleAlert } from '@/lib/utils';
import { invalidateGlobalUsersDirectory } from '@/lib/invalidate-global-users-directory';
import AlertConfirm from '@/components/custom/alert-confirm';
import RemovalWarning, { useRemovalImpact } from '@/components/mcm/removal-warning';
import {
  PRESENCE_OPTIONS,
  presenceValueOf,
  useMyPresenceControl,
} from '@/hooks/use-presence-control';
import { useCompanyFeatures } from '@/hooks/rbac';
import RoleChangeModal from '@/pages/admin-settings/people/role-change-modal';
import AssignCallerIdModal from '@/pages/admin-settings/people/add-users/assign-caller-id-modal';
import AddUsers from '@/pages/admin-settings/people/add-users';
import { invalidateNumberLists } from '@/lib/number-list-cache';
import { buildRosterCsv, rosterFileName, toExportRow } from '@/lib/user-roster-export';
import './people-glass.css';
import './groups-glass.css';

/**
 * Directory ▸ People — the organisation roster.
 *
 * Everyone in the org with their role, department, extension, the queues they
 * take (the platform's nearest thing to an ACD skill), live presence, and one
 * click to call, message or start video.
 *
 * Row actions mirror the platform's own Extension page rather than inventing a
 * second vocabulary: on this platform "Edit" for a user means Update Forwarding,
 * and it is gated on the same admin + plan permissions, so People cannot offer
 * an action the Extension page would refuse.
 */

const TONE_CLASS: Record<string, string> = {
  good: 'tag pos',
  busy: 'tag neg',
  warn: 'tag warn',
  idle: 'tag neu',
};

const People = () => {
  const navigate = useNavigate();
  const { dial } = useConsoleDialer();
  const { startVideoCall, isStarting } = useInstantMeeting();
  const { rows, isLoading } = usePeopleRows();

  const { user } = useUser();
  const { setMyPresence, isPending: isSettingPresence, myUuid } = useMyPresenceControl();
  const { features } = useCompanyFeatures();

  /* Same source the Extension page reads, so the two pages can't disagree about
     who may edit a user. */
  const userAccess = features?.plan_features?.account_setting?.access?.USER?.action;
  const isAdmin = user?.user_info?.role === 'ADMIN';
  const canEdit = Boolean(isAdmin && userAccess?.edit);
  const canAssignCallerId = Boolean(
    features?.plan_features?.virtual_numbers?.action?.assign_number,
  );

  /* Rank, not a string test. A plan permission says the feature exists on the
     account; it says nothing about who you may point it at. `outranks` answers
     that one way for every action on this screen -- see lib/role-rank.ts. */
  const outranks = (row: PersonRow) => mayActOn(user?.user_info, row.raw);

  /* Same gate the Extension page puts on Add Users: trial accounts and users
     without the add permission don't get an invite button that would fail. */
  const canInvite = Boolean(userAccess?.add) && user?.company_info?.is_trial !== 'Y';
  const canDelete = Boolean(userAccess?.delete);

  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<PersonRow | null>(null);

  /* Before anybody is removed, find what still points at them — a queue they
     are the last agent on, a menu key, a number forwarded to their extension.
     The roster is already on screen, so it is handed over rather than fetched
     a second time. */
  const roster = useMemo(() => rows.map((row: any) => row.raw), [rows]);
  const removal = useRemovalImpact((deleting?.raw ?? null) as any, Boolean(deleting), roster);
  const [unassigning, setUnassigning] = useState<PersonRow | null>(null);

  const { show: showRemoved, setShow: setShowRemoved, entries: recentlyRemoved, track: trackRemoval } = useRecentlyRemoved();

  const { mutate: removePerson, isPending: isDeletingPerson } = useMutation({
    mutationKey: ['deleteMember'],
    mutationFn: deleteMember,
    onSuccess: ({ data }: any) => {
      if (deleting) trackRemoval(deleting);
      queryClient.invalidateQueries({ queryKey: ['fetchUsersList'] });
      queryClient.invalidateQueries({ queryKey: ['directoryPeople'] });
      invalidateGlobalUsersDirectory(queryClient);
      handleAlert({ text: data?.data?.message || 'Person removed', type: 'success' });
      setDeleting(null);
    },
  });

  const { mutate: removeCallerId, isPending: isUnassigning } = useMutation({
    mutationFn: removeAssignNumber,
    onSuccess: (data: any) => {
      invalidateNumberLists(queryClient);
      queryClient.invalidateQueries({ queryKey: ['directoryPeople'] });
      handleAlert({
        text: data?.data?.data?.message || 'Caller ID removed',
        type: 'success',
      });
      setUnassigning(null);
    },
  });

  /* Was `row.role !== 'ADMIN'`, which reads the label: an administrator on a
     custom role named anything else passed it. Rank reads the stored role. */
  const canChangeRoleOf = (row: PersonRow) => isAdmin && outranks(row);

  const [changingRole, setChangingRole] = useState<PersonRow | null>(null);
  const [assigningCallerId, setAssigningCallerId] = useState<PersonRow | null>(null);
  const [inviting, setInviting] = useState(false);

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('All');
  const { isFavourite, toggleFavourite } = useDirectoryFavourites();
  const [presence, setPresence] = useState('Any');
  const [location, setLocation] = useState('All');
  const [open, setOpen] = useState<PersonRow | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);

  const [personForm, setPersonForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', site: '', extension: '',
  });

  const openPerson = (row: PersonRow) => {
    setOpen(row);
    setPersonForm({
      first_name: row.raw?.first_name || row.name.split(' ')[0] || '',
      last_name: row.raw?.last_name || row.name.split(' ').slice(1).join(' ') || '',
      email: row.email || '',
      phone: row.phone || '',
      site: row.location || '',
      extension: row.extension || '',
    });
  };

  const { mutate: savePerson, isPending: isSavingPerson } = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      updateMemberForwading({ userID: open?.uuid, uuid: open?.uuid, ...payload }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['directoryPeople'] });
      invalidateGlobalUsersDirectory(queryClient);
      handleAlert({ text: data?.data?.data?.message || 'Saved', type: 'success' });
      setOpen(null);
    },
  });

  const departments = useMemo(() => {
    const found = new Set<string>();
    rows.forEach((row) => row.department !== '—' && found.add(row.department));
    return ['All', ...Array.from(found).sort()];
  }, [rows]);

  const locations = useMemo(() => {
    const found = new Set<string>();
    rows.forEach((row) => row.location !== '—' && found.add(row.location));
    return ['All', ...Array.from(found).sort()];
  }, [rows]);

  const presences = useMemo(() => {
    const found = new Set<string>();
    rows.forEach((row) => found.add(row.presence));
    return ['Any', ...Array.from(found).sort()];
  }, [rows]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (department !== 'All' && row.department !== department) return false;
      if (location !== 'All' && row.location !== location) return false;
      if (presence !== 'Any' && row.presence !== presence) return false;
      if (!needle) return true;
      return [
        row.name,
        row.role,
        row.department,
        row.location,
        row.extension,
        row.email,
        ...row.skills,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, search, department, presence, location]);

  /* The roster used to scroll inside the card. A scroll box hides how much
     is left and makes the last row sit against a clipped edge, so it pages
     instead: a fixed 10 rows, with the pager below the table. */
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  /* Filtering can leave you on a page that no longer exists (search down to
     three results while on page 4), which would show an empty table with no
     hint why. Clamp rather than reset to 1, so narrowing a filter keeps you
     as close as possible to where you were. */
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visible, currentPage],
  );

  const onQueue = rows.filter((row) => row.tone === 'good').length;

  /* Take the roster away as a spreadsheet.
   *
   * The platform has no export of any kind for people, so this is built here
   * out of the list already on screen. That is why it exports what the filters
   * are showing rather than "everybody": the rows are what this page fetched,
   * and pretending otherwise would quietly hand somebody a partial file
   * labelled as the whole company. The button says how many are in it.
   *
   * The file starts with a byte-order mark because otherwise a spreadsheet
   * opening it on Windows reads the accents in people's names as rubbish. */
  const exportRoster = () => {
    const csv = buildRosterCsv(
      visible.map((row) =>
        toExportRow(
          row.raw,
          row.department && row.department !== '—' ? row.department.split(', ') : [],
        ),
      ),
    );
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = rosterFileName(
      user?.company_info?.company_name || user?.user_info?.company_name,
      new Date().toISOString(),
    );
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="gp-people">
      <DirectoryPage
        title="People"
        description="Everyone in the organisation, with live presence, skills and one-click contact."
        actions={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate('/directory/groups')}
            >
              <Ic n="users" />
              Groups
            </button>
            {/* The count is in the label on purpose: filters are on this page,
                and a button that just says "Export" invites somebody to file a
                filtered list as the whole company. */}
            <button
              type="button"
              className="btn ghost"
              disabled={!visible.length}
              title={
                visible.length === rows.length
                  ? 'Download everybody as a spreadsheet'
                  : 'Downloads the people these filters are showing, not the whole company'
              }
              onClick={exportRoster}
            >
              <Ic n="dl" />
              Export {visible.length}
            </button>
            {canInvite ? (
              <button type="button" className="btn primary" onClick={() => setInviting(true)}>
                <Ic n="plus" />
                Invite person
              </button>
            ) : null}
          </>
        }
        filters={
          <>
            <FilterChip
              label="Groups"
              value={department}
              options={departments}
              onChange={setDepartment}
            />
            <FilterChip
              label="Location"
              value={location}
              options={locations}
              onChange={setLocation}
            />
            <FilterChip
              label="Presence"
              value={presence}
              options={presences}
              onChange={setPresence}
            />
            <SearchChip value={search} onChange={setSearch} placeholder="Search people" />
            <button type="button" className="fchip" style={{ cursor: 'pointer', gap: 6, fontWeight: showRemoved ? 700 : undefined, background: showRemoved ? 'var(--primary)' : undefined, color: showRemoved ? '#fff' : undefined, borderColor: showRemoved ? 'var(--primary)' : undefined }} onClick={() => setShowRemoved((v) => !v)}>
              <Ic n="clock" size={12} />
              Recently removed
            </button>
            <span className="fchip live" style={{ marginLeft: 'auto' }}>
              <span className="num">{onQueue}</span> available
            </span>
          </>
        }
      >
        {showRemoved && (
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Groups</th>
                <th>Location</th>
                <th>Numbers</th>
                <th>ACD skills</th>
                <th>Presence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentlyRemoved.length ? recentlyRemoved.map((entry) => {
                const hoursAgo = Math.round((Date.now() - entry.removedAt) / 3600000);
                return (
                  <tr key={entry.uuid}>
                    <td><span className="flex items-center gap-2.5"><CustomAvatar name={entry.name} size="30" /><span style={{ fontWeight: 700 }}>{entry.name}</span></span></td>
                    <td>{entry.role || '—'}</td>
                    <td><span style={{ color: 'var(--ink-4)' }}>—</span></td>
                    <td><span style={{ color: 'var(--ink-4)' }}>—</span></td>
                    <td className="num">{entry.extension || '—'}</td>
                    <td><span style={{ color: 'var(--ink-4)' }}>—</span></td>
                    <td><span className="tag neg">Removed {hoursAgo < 1 ? 'just now' : `${hoursAgo}h ago`}</span></td>
                    <td><span style={{ color: 'var(--ink-4)' }}>—</span></td>
                  </tr>
                );
              }) : (
                <EmptyRow span={8} message="Nobody has been removed in the last 72 hours." />
              )}
            </tbody>
          </table>
        )}

        {!showRemoved && (
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Groups</th>
              <th>Location</th>
              <th>Numbers</th>
              <th>ACD skills</th>
              <th>Presence</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyRow span={8} message="Loading the roster…" />
            ) : visible.length ? (
              paged.map((row: PersonRow) => (
                <tr key={row.uuid} className="gp-person-row" onClick={() => openPerson(row)}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <CustomAvatar name={row.name} image={row.image} size="30" />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, display: 'block' }}>{row.name}</span>
                        {row.jobTitle ? (
                          <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block' }}>
                            {row.jobTitle}
                          </span>
                        ) : null}
                        {row.email ? (
                          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{row.email}</span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td>{row.role}</td>
                  <td>{row.department}</td>
                  <td>
                    <span style={{ display: 'block' }}>{row.location}</span>
                    {row.locationPlace ? (
                      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                        {row.locationPlace}
                      </span>
                    ) : null}
                  </td>
                  {/* Extension is the internal number, caller ID the outbound
                      one people outside the org actually see. Both belong here;
                      the personal phone stays in the drawer. */}
                  <td className="num">
                    <span style={{ display: 'block' }}>{row.extension || '—'}</span>
                    {row.callerId ? (
                      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{row.callerId}</span>
                    ) : null}
                  </td>
                  <td>
                    {row.skills.length ? (
                      row.skills.join(', ')
                    ) : (
                      <span style={{ color: 'var(--ink-4)' }}>—</span>
                    )}
                  </td>
                  {/* Your own row gets a control; everyone else's shows only the
                      live state. Availability is yours to set and nobody else's,
                      so there is nothing to display or imply on their rows. */}
                  <td onClick={(event) => event.stopPropagation()}>
                    <span className={TONE_CLASS[row.tone] || 'tag neu'}>{row.presence}</span>
                    {row.uuid === myUuid ? (
                      <select
                        className="mcm-presence-set"
                        aria-label="Set my availability"
                        value={presenceValueOf(row.availability)}
                        disabled={isSettingPresence}
                        onChange={(event) => setMyPresence(event.target.value)}
                      >
                        {PRESENCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    {/* Three actions on the row, the rest behind the menu. Ten
                        buttons wrapped onto a second line and made every row
                        taller, and the three people actually reach for -- call,
                        message, video -- were lost among the admin ones. */}
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        className="mini"
                        title={`Call ${row.name}`}
                        aria-label={`Call ${row.name}`}
                        disabled={!row.extension}
                        onClick={() =>
                          row.extension && dial(row.extension, { forceRefreshContactInfo: true })
                        }
                      >
                        <Ic n="phone" size={16} />
                      </button>
                      <button
                        type="button"
                        className="mini"
                        title={`Message ${row.name}`}
                        aria-label={`Message ${row.name}`}
                        onClick={() => navigate(`/messenger?chatId=${row.uuid}&chatType=chat`)}
                      >
                        <Ic n="chat" size={16} />
                      </button>
                      <button
                        type="button"
                        className="mini"
                        title={`Start video with ${row.name}`}
                        aria-label={`Start video with ${row.name}`}
                        disabled={isStarting}
                        onClick={() =>
                          startVideoCall(
                            { user_uuid: row.uuid, name: row.name, email: row.email },
                            `Call with ${row.name}`,
                          )
                        }
                      >
                        <Ic n="video" size={16} />
                      </button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="mini"
                            title={`More for ${row.name}`}
                            aria-label={`More actions for ${row.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-52">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => toggleFavourite('person', row.uuid)}
                          >
                            <Star
                              className="h-4 w-4"
                              fill={isFavourite('person', row.uuid) ? 'currentColor' : 'none'}
                            />
                            {isFavourite('person', row.uuid)
                              ? 'Remove from favourites'
                              : 'Add to favourites'}
                          </DropdownMenuItem>
                          {canEdit ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setEditing(row)}
                            >
                              <Pencil className="h-4 w-4" /> Edit person
                            </DropdownMenuItem>
                          ) : null}
                          {isAdmin ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => navigate(`/activity/${row.uuid}`)}
                            >
                              <History className="h-4 w-4" /> View activity
                            </DropdownMenuItem>
                          ) : null}
                          {canChangeRoleOf(row) ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setChangingRole(row)}
                            >
                              <ShieldCheck className="h-4 w-4" /> Change role
                            </DropdownMenuItem>
                          ) : null}
                          {canAssignCallerId && outranks(row) ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setAssigningCallerId(row)}
                            >
                              <PhoneOutgoing className="h-4 w-4" /> Assign caller ID
                            </DropdownMenuItem>
                          ) : null}
                          {canAssignCallerId && row.callerId && outranks(row) ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setUnassigning(row)}
                            >
                              <PhoneOff className="h-4 w-4" /> Remove caller ID
                            </DropdownMenuItem>
                          ) : null}
                          {/* Admins can remove a person; never yourself, and
                              never another admin unless you are one. */}
                          {canDelete && row.uuid !== myUuid && outranks(row) ? (
                            <DropdownMenuItem
                              className="cursor-pointer text-red-600 focus:text-red-600"
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 className="h-4 w-4" /> Remove person
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow
                span={8}
                message={
                  rows.length ? 'Nobody matches those filters.' : 'No people on the roster yet.'
                }
              />
            )}
          </tbody>
        </table>
        )}

        {/* Pager. Reuses the app's own `.mcm-pager` classes (index.css) so it
            matches every other paged table rather than being a second design.
            Hidden on a single page -- one inert control is noise. */}
        {!isLoading && pageCount > 1 ? (
          <div className="gp-people-pager">
            <span className="gp-people-pager-count">
              {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}
            </span>
            <div className="mcm-pager flex items-center">
              <button
                type="button"
                className="mcm-pager-btn"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                &#8249;
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={`mcm-pager-page${number === currentPage ? ' is-current' : ''}`}
                  onClick={() => setPage(number)}
                  aria-current={number === currentPage ? 'page' : undefined}
                >
                  {number}
                </button>
              ))}
              <button
                type="button"
                className="mcm-pager-btn"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === pageCount}
                aria-label="Next page"
              >
                &#8250;
              </button>
            </div>
          </div>
        ) : null}

        {open ? (
          <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
            <DialogContent
              className="gp-person-dialog sm:max-w-[620px]"
              /* Radix focuses the first focusable element when the dialog
                 opens — a plain `<input>`'s default browser behaviour on
                 programmatic focus (rather than a user click) is to select
                 all of its text, so "First Name" opened with the person's
                 whole name highlighted, one keystroke away from being wiped
                 out. Focus lands on the dialog itself instead, keeping
                 keyboard/screen-reader focus trapped inside it (rather than
                 lost to the page behind, which a bare `preventDefault`
                 would leave it) without pre-selecting any field. */
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                (event.target as HTMLElement)?.focus?.();
              }}
            >
              <div className="gp-person-fields">
                <label className="gp-field">
                  <span className="gp-field-l">First Name</span>
                  <input
                    className="gp-field-v"
                    value={personForm.first_name}
                    onChange={(event) =>
                      setPersonForm((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                </label>
                <label className="gp-field">
                  <span className="gp-field-l">Last Name</span>
                  <input
                    className="gp-field-v"
                    value={personForm.last_name}
                    onChange={(event) =>
                      setPersonForm((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                </label>
                <label className="gp-field">
                  <span className="gp-field-l">Email</span>
                  <input
                    className="gp-field-v"
                    type="email"
                    value={personForm.email}
                    onChange={(event) =>
                      setPersonForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </label>
                <label className="gp-field">
                  <span className="gp-field-l">Phone</span>
                  <PhoneInput
                    country={'in'}
                    onlyCountries={['in']}
                    disableDropdown
                    value={personForm.phone}
                    onChange={(value) =>
                      /* countryCodeEditable={false} freezes this library's input entirely
                         (can't type or delete at all), so +91 is protected here instead:
                         if editing eats into the dial code, snap back to a bare +91 rather
                         than let it disappear. */
                      setPersonForm((prev) => ({
                        ...prev,
                        phone: `+${value.startsWith('91') ? value : '91'}`,
                      }))
                    }
                  />
                </label>
                <label className="gp-field">
                  <span className="gp-field-l">Site</span>
                  <input
                    className="gp-field-v"
                    value={personForm.site}
                    disabled
                    title="Site is set from the person's assigned location, not edited here"
                  />
                </label>
                <label className="gp-field">
                  <span className="gp-field-l">Extension</span>
                  <input
                    className="gp-field-v"
                    value={personForm.extension}
                    disabled
                    title="Extension is provisioned, not edited here"
                  />
                </label>
              </div>

              <div className="gp-person-callerid">
                <span className="gp-field-l">Caller ID</span>
                {open.callerId ? (
                  <span className="gp-field-v" style={{ flex: 'none' }}>
                    {open.callerId}
                  </span>
                </div>

                {/* Form fields */}
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
                    {open.callerId ? (
                      <span className="text-sm font-medium text-gray-900">{open.callerId}</span>
                    ) : canAssignCallerId ? (
                      <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors" onClick={() => setAssigningCallerId(open)}>
                        <Ic n="vm" size={14} />
                        Assign Number
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">Not assigned</span>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="px-6 pb-5 flex items-center gap-3">
                  <button
                    type="button"
                    className="group flex-1 flex items-center justify-center gap-2.5 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-primary hover:border-primary hover:text-white active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
                    disabled={!open.extension}
                    onClick={() => open.extension && dial(open.extension, { forceRefreshContactInfo: true })}
                  >
                    <span className="inline-flex [&_svg]:fill-white [&_svg]:stroke-gray-700 [&_svg]:[stroke-width:1.5px] group-hover:[&_svg]:stroke-white"><Ic n="phone" size={16} /></span>
                    <span className="transition-colors">Call</span>
                  </button>
                  <button
                    type="button"
                    className="group flex-1 flex items-center justify-center gap-2.5 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-primary hover:border-primary hover:text-white active:scale-[0.98] transition-all duration-150"
                    onClick={() => navigate(`/messenger?chatId=${open.uuid}&chatType=chat`)}
                  >
                    <span className="inline-flex [&_svg]:fill-white [&_svg]:stroke-gray-700 [&_svg]:[stroke-width:1.5px] group-hover:[&_svg]:stroke-white"><Ic n="chat" size={16} /></span>
                    <span className="transition-colors">Message</span>
                  </button>
                  <button
                    type="button"
                    className="group flex-1 flex items-center justify-center gap-2.5 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-primary hover:border-primary hover:text-white active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
                    disabled={isStarting}
                    onClick={() => startVideoCall({ user_uuid: open.uuid, name: open.name, email: open.email }, `Call with ${open.name}`)}
                  >
                    <span className="inline-flex [&_svg]:fill-white [&_svg]:stroke-gray-700 [&_svg]:[stroke-width:1.5px] group-hover:[&_svg]:stroke-white"><Ic n="video" size={16} /></span>
                    <span className="transition-colors">Video</span>
                  </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                  <button type="button" className="h-9 px-5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setOpen(null)}>
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
            )}
          </DialogContent>
        </Dialog>
      </DirectoryPage>
      </div>

      {/* The platform's own add-user flow, opened in place rather than
          bouncing to Admin — the console keeps you in Directory. */}
      <Dialog open={inviting} onOpenChange={(next) => !next && setInviting(false)}>
        <DialogContent
          className="gp-create-group-dialog gp-invite-dialog sm:max-w-[600px] lg:max-w-[1120px]"
          showCloseButton={false}
        >
          {/* The title lives on the step rail now (`AddUsers`'s
              `railTitle`/`railSubtitle`, matching the reference layout),
              so this bar is just the close control -- kept rather than
              removed since every other `gp-create-group-dialog` still
              needs somewhere for it to sit. */}
          <div className="gp-create-group-head gp-create-group-head--bare">
            <button
              type="button"
              aria-label="Close"
              className="gp-create-group-close"
              onClick={() => setInviting(false)}
            >
              <Icon name="CloseIcon" className="h-4 w-4" />
            </button>
          </div>
          <div className="gp-create-group-body">
            <AddUsers
              setDrawerState={() => setInviting(false)}
              railTitle="Invite people"
              railSubtitle="Add team members and give them access to your workspace."
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertConfirm
        {...{
          apiLoading: isDeletingPerson,
          open: Boolean(deleting),
          setOpen: (value: boolean) => !value && setDeleting(null),
          onConfirm: () => deleting?.raw?.uuid && removePerson(deleting.raw.uuid),
          onCancel: () => setDeleting(null),
          onClose: () => setDeleting(null),
          confirmBtnText: 'Remove them',
          closeBtnText: 'Cancel',
          /* Off only for the finding that cannot be undone from inside the
             product — losing your last administrator. Everything else is a
             judgement the admin is entitled to make. */
          confirmBtnDisabled: removal.blocked || removal.loading,
          className: 'w-full sm:w-2/3 md:w-1/2 lg:w-2/5 p-3',
          descriptionTextComp: (
            <RemovalWarning
              impacts={removal.impacts}
              loading={removal.loading}
              incomplete={removal.incomplete}
              name={deleting?.name || 'this person'}
            />
          ),
        }}
      />

      <AlertConfirm
        {...{
          apiLoading: isUnassigning,
          open: Boolean(unassigning),
          setOpen: (value: boolean) => !value && setUnassigning(null),
          onConfirm: () =>
            unassigning?.callerId && removeCallerId({ did_number: unassigning.callerId }),
          onCancel: () => setUnassigning(null),
          onClose: () => setUnassigning(null),
          confirmBtnText: 'Remove',
          closeBtnText: 'Cancel',
          descriptionTextComp: (
            <div className="text-md">
              Remove <strong>{unassigning?.callerId}</strong> from {unassigning?.name}? The number
              stays on the account and can be assigned again.
            </div>
          ),
        }}
      />

      <RoleChangeModal
        open={Boolean(changingRole)}
        userData={changingRole?.raw}
        setOpen={(val: boolean) => {
          if (!val) setChangingRole(null);
        }}
      />

      {/* The Extension page normalises the key before handing the record over,
          because the modal expects `user_uuid` and the roster carries `uuid`. */}
      <AssignCallerIdModal
        open={Boolean(assigningCallerId)}
        userData={
          assigningCallerId
            ? {
                ...assigningCallerId.raw,
                user_uuid: assigningCallerId.raw?.user_uuid || assigningCallerId.raw?.uuid,
              }
            : null
        }
        onClose={() => setAssigningCallerId(null)}
      />

      {/* An explicit width matters: without one SideDrawer falls back to
          `calc(100% - 21rem)`, which is ~1660px on a wide screen — far more
          than a four-step form needs, and it buries the page behind it. */}
      {editing ? (
        <SideDrawer
          isOpen={Boolean(editing)}
          title={`Edit ${editing.name}`}
          width="min(1080px, 82vw)"
          enableResponsive
          responsiveWidth="96vw"
          responsiveBreakpoint={1024}
          handleClose={() => setEditing(null)}
          content={
            <UpdateForwarding
              drawerState
              setDrawerState={() => setEditing(null)}
              data={editing.raw}
              setTabData={() => undefined}
            />
          }
        />
      ) : null}
    </>
  );
};

export default People;
