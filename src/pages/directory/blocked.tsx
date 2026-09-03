import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { getContactList, updateContactTag } from '@/services/api';
import CustomAvatar from '@/components/custom/custom-avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CreateContactNew from '@/pages/new-contact/create-new-contact';
import { Ic } from '@/components/mcm/icons';
import { SettingCard, SettingRow } from '@/components/mcm/setting-card';
import {
  DEFAULT_BLOCK_CHOICE,
  SCOPE_LABELS,
  TREATMENT_DESCRIPTIONS,
  TREATMENT_LABELS,
  type BlockChoice,
  type BlockLine,
  type BlockScope,
  type BlockTreatment,
  type BlockableContact,
  canBlock,
  contactName,
  describeChoice,
  planBlock,
  tagRequest,
} from '@/lib/contact-blocking';
import { DirectoryPage, EmptyRow, SearchChip } from './page-shell';
import './blocked-glass.css';

/**
 * Directory ▸ Blocked — the numbers you have stopped hearing from.
 *
 * Blocking is spread across the app today: a menu on a row of the contacts
 * table marks somebody as Blocked, and after that the block is invisible.
 * Nothing lists what is blocked, so nobody can check whether a caller they are
 * no longer hearing from was blocked on purpose or is simply not calling.
 *
 * This is that list, plus the one thing the row menu cannot do — block a number
 * you are looking at rather than a contact you have already opened.
 *
 * The important honesty, and the reason the card at the top says so plainly:
 * marking a contact as blocked records the decision and nothing more. Nothing
 * in the call path reads it yet, so a blocked number can still ring through.
 * The screen is still worth having — the decision has to be recorded somewhere
 * before anything can act on it, and until then people deserve to know.
 */

/**
 * A `.mcm-field`-styled dropdown for this page's "Block a number" form.
 *
 * Not a native `<select>`, for the same reason `FilterChip` (page-shell.tsx)
 * isn't one: a native popup's hover/keyboard highlight is drawn by the OS
 * and ignores page CSS in every browser that matters here, so it kept
 * showing the platform's blue instead of this app's orange accent. This
 * reuses the same custom-listbox pattern and dropdown styling as the
 * Tag/Label filters, just with a full-width, bordered trigger to match the
 * other `.mcm-field` controls on this form. Local to this file — the
 * select rows this page needs pair a value with a separate display label
 * (`SCOPE_LABELS` etc.), which `FilterChip` doesn't support and no other
 * page needs, so this stays here rather than widening a shared component.
 *
 * The menu renders through a portal, `position: fixed` and placed by the
 * trigger's own screen coordinates, so `.panel-card`'s `overflow: hidden`
 * (there for its rounded corners) can no longer clip it against the card's
 * edge the way an in-place absolutely-positioned menu was being clipped on
 * the lower rows. It portals to the nearest `.mcm-page` ancestor rather
 * than `document.body`: this design system's colours are CSS custom
 * properties scoped to `.mcm-page`, so a portal outside it would render
 * with no theme at all. `FilterChip`'s dropdown doesn't need any of this —
 * it sits in the filter bar, above the table card, so it was never clipped.
 */
const FieldSelect = ({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const current = options.find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!open) return;
    setPortalTarget(rootRef.current?.closest('.mcm-page') || document.body);
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setMenuRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="mcm-field-select" ref={rootRef}>
      <button
        type="button"
        className="fchip-select-trigger"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span>{current?.label ?? value}</span>
        <Ic n="chev" size={12} className="fchip-select-caret" />
      </button>
      {open && menuRect && portalTarget
        ? createPortal(
            <ul
              ref={menuRef}
              className="fchip-select-menu fchip-select-menu-portal"
              role="listbox"
              aria-label={ariaLabel}
              style={{ top: menuRect.top, left: menuRect.left, minWidth: menuRect.width }}
            >
              {options.map((option) => (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={`fchip-select-option${option.value === value ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.value === value ? <Ic n="check" size={12} /> : null}
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>,
            portalTarget,
          )
        : null}
    </div>
  );
};

/* Sample rows appended after any real blocked numbers, so the list always
   has enough entries to show its design properly instead of looking sparse.
   Real data always comes first and is never hidden or replaced by these —
   see `blockedWithDemo` below. Their `_id`s aren't real contact ids, so
   their "Unblock" action is disabled rather than wired to the API. */
const DEMO_BLOCKED_NUMBERS: (BlockableContact & { _demo: true })[] = [
  {
    _id: 'demo-1',
    name: { first: 'Rahul', last: 'Sharma' },
    contact: { phone: '+91 98765 43210', email: 'rahul.sharma@example.com' },
    is_blocked: true,
    _demo: true,
  },
  {
    _id: 'demo-2',
    name: { first: 'Priya', last: 'Verma' },
    contact: { phone: '+91 91234 56789', email: 'priya.verma@example.com' },
    is_blocked: true,
    _demo: true,
  },
  {
    _id: 'demo-3',
    name: { first: 'Unknown', last: 'Caller' },
    contact: { phone: '+1 202 555 0143' },
    is_blocked: true,
    _demo: true,
  },
  {
    _id: 'demo-4',
    name: { first: 'Amit', last: 'Patel' },
    contact: { phone: '+91 90123 45678', email: 'amit.patel@example.com' },
    is_blocked: true,
    _demo: true,
  },
  {
    _id: 'demo-5',
    name: { first: 'Sara', last: 'Khan' },
    contact: { phone: '+91 88990 11223', email: 'sara.khan@example.com' },
    is_blocked: true,
    _demo: true,
  },
  {
    _id: 'demo-6',
    name: { first: 'Telemarketer' },
    contact: { phone: '+1 800 555 0192' },
    is_blocked: true,
    _demo: true,
  },
];

const Blocked = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [number, setNumber] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [scope, setScope] = useState<BlockScope>(DEFAULT_BLOCK_CHOICE.scope);
  const [treatment, setTreatment] = useState<BlockTreatment>(DEFAULT_BLOCK_CHOICE.treatment);
  const [line, setLine] = useState<BlockLine>(DEFAULT_BLOCK_CHOICE.line);

  /* Two reads of the same list. The blocked one is filtered on the server, which
     is what the table shows; the whole book is what a typed number is matched
     against, because the number you want to block is usually already saved. */
  const { data: blocked = [], isPending } = useQuery({
    queryKey: ['getContactList', 'directoryBlocked'],
    queryFn: () =>
      getContactList({ page: 1, limit: 200, filters: [{ key: 'tag', value: 'BLOCK' }] }),
    select: (res: any) => (res?.data?.data?.result?.rows || []) as BlockableContact[],
  });

  const { data: everyone = [] } = useQuery({
    queryKey: ['getContactList', 'directoryBlockedLookup'],
    queryFn: () => getContactList({ page: 1, limit: 200 }),
    select: (res: any) => (res?.data?.data?.result?.rows || []) as BlockableContact[],
  });

  const { mutate: setTag, isPending: isSaving } = useMutation({
    mutationFn: updateContactTag,
    onSuccess: () => {
      /* Every contact list in the app shares this prefix, so unblocking here
         also corrects the tag shown on the contacts table and the directory. */
      queryClient.invalidateQueries({ queryKey: ['getContactList'] });
      queryClient.invalidateQueries({ queryKey: ['newContactListQuery'] });
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message || 'That did not save. Try again.'),
  });

  const choice: BlockChoice = { number, scope, treatment, line };
  const plan = useMemo(() => planBlock(choice, everyone), [number, scope, treatment, line, everyone]);
  const typed = number.trim().length > 0;

  const blockedWithDemo = useMemo(
    () => [...blocked, ...DEMO_BLOCKED_NUMBERS],
    [blocked],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return blockedWithDemo;
    return blockedWithDemo.filter((row) =>
      [contactName(row), row?.contact?.phone, row?.contact?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [blockedWithDemo, search]);

  const block = () => {
    if (!canBlock(plan)) return;
    setTag(tagRequest(plan.targets, 'BLOCK'), {
      onSuccess: () => {
        toast.success(`${plan.targets.length === 1 ? 'That number is' : 'Those numbers are'} blocked.`);
        setNumber('');
      },
    });
  };

  const unblock = (contact: BlockableContact) =>
    setTag(tagRequest([contact], 'STANDARD'), {
      onSuccess: () => toast.success(`${contactName(contact) || 'That number'} is unblocked.`),
    });

  return (
    <>
      <div className="gp-blocked">
      <DirectoryPage
        className="blocked-compact"
      title="Blocked Numbers"
      description="Everyone you have stopped hearing from, and one place to block someone new."
      filters={
        <>
          <SearchChip value={search} onChange={setSearch} placeholder="Search blocked numbers" />
          <span className="fchip live" style={{ marginLeft: 'auto' }}>
            <span className="num">{blocked.length}</span> blocked
          </span>
        </>
      }
    >
      <div className="blocked-form">
        <SettingCard
          title="Block a number"
          description="Blocking covers calls, faxes and messages from that number."
          icon={<Ic n="shield" size={16} />}
          status="coming-soon"
        >
          <SettingRow
            label="Number"
            description="The number you want to stop hearing from. It has to be saved as a contact first."
            control={
              <input
                className="mcm-field"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="+44 20 7946 0000"
                inputMode="tel"
                aria-label="Number to block"
              />
            }
          />

          <SettingRow
            label="What to stop"
            description="Blocking calls blocks faxes too — they arrive over the same line."
            control={
              <FieldSelect
                value={scope}
                onChange={(next) => setScope(next as BlockScope)}
                ariaLabel="What to stop"
                options={(Object.keys(SCOPE_LABELS) as BlockScope[]).map((key) => ({
                  value: key,
                  label: SCOPE_LABELS[key],
                }))}
              />
            }
            status={scope === DEFAULT_BLOCK_CHOICE.scope ? undefined : 'coming-soon'}
          />

          <SettingRow
            label="What the caller gets"
            description={TREATMENT_DESCRIPTIONS[treatment]}
            control={
              <FieldSelect
                value={treatment}
                onChange={(next) => setTreatment(next as BlockTreatment)}
                ariaLabel="What the caller gets"
                options={(Object.keys(TREATMENT_LABELS) as BlockTreatment[]).map((key) => ({
                  value: key,
                  label: TREATMENT_LABELS[key],
                }))}
              />
            }
            status={treatment === DEFAULT_BLOCK_CHOICE.treatment ? undefined : 'coming-soon'}
          />

          <SettingRow
            label="Whose line"
            description="A block on your own line stops that caller reaching you. A shared line has to be blocked for everyone who answers it."
            control={
              <FieldSelect
                value={line}
                onChange={(next) => setLine(next as BlockLine)}
                ariaLabel="Whose line"
                options={[
                  { value: 'personal', label: 'My line' },
                  { value: 'shared', label: 'A shared line' },
                ]}
              />
            }
            status={line === DEFAULT_BLOCK_CHOICE.line ? undefined : 'coming-soon'}
          />

          {typed ? (
            <div className="mcm-setrow mcm-setrow-stack">
              <div className="mcm-setrow-full">
                <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 8px' }}>
                  {describeChoice(choice)}
                </p>

                {plan.problems.map((problem) => (
                  <p
                    key={problem.message}
                    style={{
                      fontSize: 12,
                      margin: '0 0 6px',
                      color: problem.blocking ? 'var(--crit)' : 'var(--ink-3)',
                    }}
                  >
                    {problem.message}
                  </p>
                ))}

                {plan.notStored.length ? (
                  <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 8px' }}>
                    Recorded on this screen but not saved with the contact:{' '}
                    {plan.notStored.join(', ')}.
                  </p>
                ) : null}

                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!canBlock(plan) || isSaving}
                    onClick={block}
                  >
                    <Ic n="shield" />
                    Block this number
                  </button>
                  {plan.needsContact ? (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setAddingContact(true)}
                    >
                      <Ic n="plus" />
                      Save as a contact
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}
        </SettingCard>
      </div>

      <div className="blocked-note-card">
        <p className="blocked-note-text">
          Coming soon. A block is recorded against the contact and that is as far as it goes
          today: nothing in the call path reads it yet, so a blocked number can still ring
          through. Only the fact of the block is kept — not which channels it covers, not what
          the caller hears instead, and not whether it applies to a shared line. Those choices
          are shown here because they are the decision people actually make, and they are what
          we need to be able to keep.
        </p>
      </div>

      <div className="blocked-table-card">
      <div className="blocked-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Number</th>
              <th>Email</th>
              <th>Blocked</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
          {isPending ? (
            <EmptyRow span={5} message="Loading blocked numbers…" />
          ) : visible.length ? (
            visible.map((row) => {
              const name = contactName(row) || 'Unknown';
              const isDemo = Boolean((row as { _demo?: boolean })._demo);
              return (
                <tr key={row?._id || row?.contact?.phone}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <CustomAvatar name={name} type="contact" size="30" />
                      <span style={{ fontWeight: 700 }}>{name}</span>
                      {isDemo ? <span className="tag neu">Demo</span> : null}
                    </span>
                  </td>
                  <td className="num">{row?.contact?.phone || '—'}</td>
                  <td>{row?.contact?.email || <span style={{ color: 'var(--ink-4)' }}>—</span>}</td>
                  <td>
                    <span className="tag acc">Blocked</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="mini"
                      disabled={isSaving || isDemo}
                      title={isDemo ? 'Sample data — not a real contact' : `Unblock ${name}`}
                      aria-label={isDemo ? `${name} is sample data` : `Unblock ${name}`}
                      onClick={() => unblock(row)}
                    >
                      <Ic n="check" size={12} />
                      Unblock
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <EmptyRow
              span={5}
              message={
                blocked.length
                  ? 'No blocked numbers match that search.'
                  : 'Nobody is blocked. Numbers you block will be listed here.'
              }
            />
          )}
          </tbody>
        </table>
      </div>
      </div>
      </DirectoryPage>
      </div>

      <Dialog open={addingContact} onOpenChange={setAddingContact}>
        <DialogContent className="max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>
          <CreateContactNew
            isDisable={false}
            keepFormDataAfterSave
            isLead={false}
            prefillPhone={number.trim()}
            handleClose={() => setAddingContact(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Blocked;
