/* Deciding which fields a Call Handling Template writes onto a number,
 * pulled out into its own pure module the same way
 * apply-user-settings-template.ts pulled the User Settings Template
 * decision out of its single-person form — so the bulk "Apply to Numbers"
 * screen and, later, any other caller build the exact same write from the
 * exact same input, rather than each re-deriving it slightly differently.
 *
 * A template's `forward_call_actions` has three sections — condition,
 * call_handling, media (see set-number-forwarding/index.tsx's
 * handleCallForwarding for where that shape comes from). Unlike a User
 * Settings Template, there is no per-field "apply this or don't" flag
 * authored on the template itself — instead the *admin* picks a scope at
 * apply time: the whole template, just its schedule, or just its
 * greetings/hold music. That mirrors Aircall's Smartflows import, which
 * offers the same kind of scoped choice (Steps only / Full configuration /
 * Number settings / Connected integrations) rather than a blanket
 * all-or-nothing copy.
 *
 * Reuses applyFieldWrites from apply-user-settings-template.ts rather than
 * re-deriving a merge: that function already clones only the nodes along
 * each write's path, leaving every sibling field alone — exactly what is
 * needed here too, since a number's `condition` also holds fields (caller
 * ID, display number) a "business hours only" apply must never touch.
 */

import { applyFieldWrites, type TemplateFieldWrite } from '@/lib/apply-user-settings-template';

export type CallHandlingApplyScope = 'full' | 'business_hours' | 'media';

export interface CallHandlingScopeOption {
  value: CallHandlingApplyScope;
  label: string;
  description: string;
}

export const CALL_HANDLING_APPLY_SCOPES: CallHandlingScopeOption[] = [
  {
    value: 'full',
    label: 'Full configuration',
    description: 'Everything on this template — hours, routing, recording and greetings.',
  },
  {
    value: 'business_hours',
    label: 'Business hours only',
    description: 'Just the schedule and what happens when closed. Greetings and recording are left as they are.',
  },
  {
    value: 'media',
    label: 'Greetings & hold music only',
    description: 'Just the welcome greeting, hold music and voicemail greeting. Hours and routing are left as they are.',
  },
];

/** Which forward_call_actions fields a scope choice writes, given a
 *  template's own parsed forward_call_actions. Pure — no network, no React. */
export const buildCallHandlingTemplateWrites = (
  templateForwardActions: any,
  scope: CallHandlingApplyScope,
): TemplateFieldWrite[] => {
  const writes: TemplateFieldWrite[] = [];
  const condition = templateForwardActions?.condition ?? {};
  const callHandling = templateForwardActions?.call_handling ?? {};
  const media = templateForwardActions?.media ?? {};

  if (scope === 'full' || scope === 'business_hours') {
    writes.push({ path: 'condition.operational_hours', value: condition?.operational_hours });
    writes.push({ path: 'call_handling.business_hours', value: callHandling?.business_hours });
  }

  if (scope === 'full') {
    writes.push({ path: 'condition.transcription', value: condition?.transcription ?? false });
    writes.push({
      path: 'condition.ai_call_monitoring',
      value: condition?.ai_call_monitoring ?? false,
    });
    writes.push({ path: 'condition.recording', value: condition?.recording });
    writes.push({ path: 'condition.display_number', value: condition?.display_number });
    writes.push({ path: 'condition.caller_id', value: condition?.caller_id ?? '' });
  }

  if (scope === 'full' || scope === 'media') {
    writes.push({ path: 'media', value: media });
  }

  return writes;
};

/** Folds a scope's writes onto a number's own current forward_call_actions —
 *  the non-form counterpart of set-number-forwarding's `{ ...stored, ...request }`
 *  merge, at field-path granularity instead of whole-object. */
export const applyCallHandlingTemplateWrites = (
  targetForwardActions: Record<string, any>,
  writes: TemplateFieldWrite[],
): Record<string, any> => applyFieldWrites(targetForwardActions ?? {}, writes);
