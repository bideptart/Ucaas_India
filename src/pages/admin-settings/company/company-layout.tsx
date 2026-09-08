/* The frame around every company settings screen.
 *
 * These nine screens used to be one page holding `activeSection` in state, so
 * all nine shared a single URL. Nothing could be linked to, a reload always
 * landed back on the first section, the back button skipped the whole area, and
 * one permission guarded the lot — including Security, which sits behind the
 * phone-system permission and therefore opens for anyone who can view the phone
 * system.
 *
 * Each section is now a route. This component holds only what they share: the
 * heading, the sub-navigation, and the outlet the section renders into. The nav
 * is built from the same table the router uses, so a section cannot appear in
 * one and not the other.
 */

import { NavLink, Outlet } from 'react-router-dom';

import { useUser } from '@/hooks/use-user';
import { COMPANY_SECTIONS } from './company-sections';

import '@/components/mcm/mcm-page.css';

/* The journey a caller actually takes. Shown at the top because every setting
   below changes one of these steps, and an admin who cannot see the path cannot
   tell which setting they need. */
const CALL_JOURNEY = [
  { step: 'Call arrives', detail: 'on a company number' },
  { step: 'Open hours?', detail: 'business hours decide' },
  { step: 'Rings the person', detail: 'for the ring time set below' },
  { step: 'No answer', detail: 'nobody picks up' },
  { step: 'Voicemail', detail: 'caller leaves a message' },
];

const CompanyLayout = () => {
  const { user } = useUser();
  const companyName =
    user?.company_info?.company_name || user?.user_info?.company_name || 'your company';

  return (
    <section className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-muted/40">
      <div className="flex items-start justify-between gap-4 p-3 border-b border-gray-200 dark:border-mcm-line min-h-[65px] bg-white dark:bg-mcm-surface">
        <div>
          <p className="text-gray-900 dark:text-mcm-ink font-semibold text-lg">Company Phone Preferences</p>
          <p className="text-gray-500 dark:text-mcm-ink-3 text-xs">
            The phone rules for {companyName}, kept in one place.
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3 overflow-y-auto">
        <div>
          <div className="mcm-flowpath" aria-label="How an incoming call is handled">
            {CALL_JOURNEY.map(({ step, detail }, index) => (
              <span key={step} className="mcm-flowstep">
                <span className="chip" title={detail}>
                  {step}
                </span>
                {index < CALL_JOURNEY.length - 1 && (
                  <span aria-hidden="true" className="px-1 text-gray-400">
                    →
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Links rather than buttons, so each section can be opened in a new tab,
            bookmarked, and sent to someone in a support reply. */}
        <div className="mb-3 border-b border-gray-200 dark:border-mcm-line">
          <nav className="flex flex-wrap gap-1" aria-label="Company settings">
            {COMPANY_SECTIONS.map((item) => (
              <NavLink
                key={item.path}
                to={`/admin-settings/company/${item.path}`}
                /* Light mode keeps its original underline-tab look
                   untouched (`border-b-2` on active, plain text on
                   inactive) — the `dark:` classes below don't touch that,
                   they layer a full-chip treatment on top that only
                   applies under `.dark`, since a `dark:border` with higher
                   selector specificity than the base `border-b-2` wins
                   outright there. Inactive tabs had no background/border
                   at all in dark mode, which is why they read as plain
                   text rather than tabs; active only had a 2px bottom
                   line, not the "clearly bordered chip" the design calls
                   for. Both now get a real 1px --mcm-line border and a
                   --mcm-surface-2 elevated surface, active additionally
                   picking up the app's neutral-wash-plus-orange-text
                   pattern (--mcm-accent-wash background, --mcm-accent-edge
                   border, --mcm-accent-ink text) rather than a filled
                   orange block. */
                className={({ isActive }) =>
                  `cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    isActive
                      ? 'border-b-2 border-primary text-primary dark:border dark:border-mcm-accent-edge dark:bg-mcm-accent-wash dark:text-mcm-accent-ink'
                      : 'text-gray-700 dark:text-mcm-ink-2 hover:text-gray-900 dark:hover:text-mcm-ink dark:border dark:border-mcm-line dark:bg-mcm-surface-2 dark:hover:border-mcm-line-2 dark:hover:bg-mcm-surface-3'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <Outlet />
      </div>
    </section>
  );
};

export default CompanyLayout;
