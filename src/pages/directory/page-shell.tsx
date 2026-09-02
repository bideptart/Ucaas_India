import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ic, McmIconSprite } from '@/components/mcm/icons';

/**
 * The shape every Directory page takes.
 *
 * People, Groups and External are three views of the same idea — a filtered
 * list of records you act on — so they are laid out by one component rather
 * than three hand-built pages. That is what stops them drifting apart: a change
 * to the header, the filter bar or the empty state lands on all of them at once
 * and none of them can quietly end up looking like a different product.
 *
 * Create and edit flows use `DirectoryDrawer` below for the same reason.
 */

export const DirectoryPage = ({
  title,
  description,
  note,
  actions,
  filters,
  children,
  className,
}: {
  title: string;
  description: string;
  /* An honest caveat about how far this screen really reaches, shown under the
     description. Optional, so every page that does not need one is unchanged. */
  note?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  /* Opt-in extra class on the page wrapper, so a single Directory view can
     carry its own layout/spacing tweaks without touching the others that
     share this shell. */
  className?: string;
}) => (
  <div className={`page${className ? ` ${className}` : ''}`}>
    <McmIconSprite />
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
    </div>
    {note ? <div className="page-caveat">{note}</div> : null}
    {filters ? <div className="tbar">{filters}</div> : null}
    <div className="panel-card">
      <div className="tbl-wrap">{children}</div>
    </div>
  </div>
);

/**
 * A filter chip driving a small custom dropdown, so the chip is the whole
 * hit area.
 *
 * Not a native `<select>`: browsers draw a `<select>` popup's hover/keyboard
 * highlight as an OS-level layer that page CSS cannot restyle (only the
 * `:checked` row takes app colours in the browsers that support it at all),
 * so it kept showing the platform's blue instead of this app's accent no
 * matter what was tried here. This listbox is plain HTML + CSS, so every
 * state — hover, selected, focus — is fully themeable.
 */
export const FilterChip = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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
    <div className="fchip fchip-select" ref={rootRef}>
      <button
        type="button"
        className="fchip-select-trigger"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}: <span className="fchip-select-value">{value}</span>
        <Ic n="chev" size={12} className="fchip-select-caret" />
      </button>
      {open ? (
        <ul className="fchip-select-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={`fchip-select-option${option === value ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option === value ? <Ic n="check" size={12} /> : null}
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const SearchChip = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <label className="fchip" style={{ flex: '1 1 220px', maxWidth: 320 }}>
    <Ic n="search" size={13} />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{ border: 0, background: 'transparent', width: '100%', outline: 'none' }}
    />
  </label>
);

/** The row every Directory list falls back to, so empty never looks broken. */
export const EmptyRow = ({ span, message }: { span: number; message: string }) => (
  <tr>
    <td colSpan={span}>
      <div className="empty">
        <Ic n="users" size={30} />
        <p>{message}</p>
      </div>
    </td>
  </tr>
);

/**
 * Create / edit surface.
 *
 * The platform opens these in its own SideDrawer with app styling; inside a
 * console page they use the console's drawer shape instead, so saving a record
 * looks like the page you saved it from.
 */
export const DirectoryDrawer = ({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) => (
  <>
    <div className="scrim" onClick={onClose} aria-hidden />
    <aside className="drw" role="dialog" aria-label={title}>
      <div className="drw-h">
        <h2>{title}</h2>
        <button type="button" className="mini" onClick={onClose} aria-label="Close">
          <Ic n="x" size={12} />
        </button>
      </div>
      <div className="drw-b">{children}</div>
      {footer ? <div className="drw-f">{footer}</div> : null}
    </aside>
  </>
);

export default DirectoryPage;
