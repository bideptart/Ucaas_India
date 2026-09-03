/* Applying a Call Handling Template to many numbers at once.
 *
 * Until now a template could only be picked one number at a time, from that
 * number's own "Update Forwarding" drawer (set-number-forwarding, when
 * opened with initialType SELECT_TEMPLATE). This is the other entry point:
 * start from the template, pick which numbers get it, apply it to all of
 * them in one run — the same shape as the User Settings Template "Apply to
 * people" screen next door (apply-template.tsx under templates/user-settings),
 * reusing the same picker/run/report structure.
 *
 * Two things this screen adds that the User Settings one didn't need:
 *
 *   A scope choice (Full / Business hours only / Media only) — see
 *   src/lib/apply-call-handling-template.ts for why: a call-handling
 *   template is a routing config, not a person's settings, and competitor
 *   research turned up Aircall's Smartflows import offering the exact same
 *   kind of scoped copy rather than an all-or-nothing one.
 *
 *   A `_templateSource` tag written alongside the real settings on every
 *   number this runs against — the only way this app can later answer "how
 *   many numbers use this template", since applying is a one-time copy, not
 *   a live link (confirmed against the actual backend: there is no
 *   apply/assign endpoint at all, only plain CRUD). Without a tag like this,
 *   that question would be unanswerable after the fact.
 *
 * Same carefulness rules as every other bulk screen in this codebase:
 *   - Numbers run one at a time with a pause between saves, never in
 *     parallel.
 *   - A number this template genuinely has nothing to write (an empty
 *     template) is reported as skipped rather than saved with no change.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import Loader from '@/components/custom/loader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { asObject } from '@/lib/bulk-user-settings';
import {
  applyCallHandlingTemplateWrites,
  buildCallHandlingTemplateWrites,
  CALL_HANDLING_APPLY_SCOPES,
  type CallHandlingApplyScope,
} from '@/lib/apply-call-handling-template';
import { handleAlert } from '@/lib/utils';
import { allNumbersList, callForwarding } from '@/services/api';

const BATCH_PAUSE_MS = 150;

const pause = () => new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));

interface NumberRow {
  uuid: string;
  label: string;
  detail: string;
  row: any;
}

type Outcome = 'changed' | 'skipped' | 'failed';

interface RunResult {
  outcome: Outcome;
  text: string;
}

const OUTCOME_ICON: Record<Outcome, typeof CheckCircle2> = {
  changed: CheckCircle2,
  skipped: AlertTriangle,
  failed: XCircle,
};

const OUTCOME_COLOUR: Record<Outcome, string> = {
  changed: 'text-green-600',
  skipped: 'text-amber-600',
  failed: 'text-red-600',
};

const numberLabel = (row: any): string => row?.did_number || row?.phone_number || 'Unknown number';

/** Which template (if any) a number's forward_call_actions says it last got
 *  from this Apply flow — read back from the `_templateSource` tag written
 *  below. Undefined for a number that was never run through Apply at all. */
const currentTemplateSource = (row: any): { uuid: string; name: string } | null => {
  const actions = asObject(row?.forward_call_actions);
  return actions?._templateSource?.uuid ? actions._templateSource : null;
};

const buildApplyPayload = (
  numberRow: any,
  template: any,
  scope: CallHandlingApplyScope,
): Record<string, any> | null => {
  const templateActions = asObject(template?.forward_call_actions);
  const writes = buildCallHandlingTemplateWrites(templateActions, scope);
  if (writes.length === 0) return null;

  const existingActions = asObject(numberRow?.forward_call_actions);
  const merged = applyCallHandlingTemplateWrites(existingActions, writes);

  return {
    uuid: numberRow?.uuid,
    forward_call_actions: {
      ...merged,
      _templateSource: { uuid: template?.uuid, name: template?.name, appliedAt: new Date().toISOString() },
    },
  };
};

const ApplyCallHandlingTemplate = ({ template, onClose }: { template: any; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<CallHandlingApplyScope>('full');
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [ran, setRan] = useState(false);

  const { data: rows = [], isPending: loadingNumbers } = useQuery({
    queryKey: ['fetchNumbersList', 'applyCallHandlingTemplate'],
    queryFn: () => fetchAllPages(allNumbersList),
  });

  const numbers = useMemo<NumberRow[]>(
    () =>
      (rows as any[])
        .filter((row) => row?.uuid)
        .map((row) => ({
          uuid: String(row.uuid),
          label: numberLabel(row),
          detail: [row?.did_name, row?.site_data?.name].filter(Boolean).join(' · '),
          row,
        })),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return numbers;
    return numbers.filter(
      (number) =>
        number.label.toLowerCase().includes(needle) || number.detail.toLowerCase().includes(needle),
    );
  }, [numbers, search]);

  const chosenNumbers = useMemo(
    () => numbers.filter((number) => selected[number.uuid]),
    [numbers, selected],
  );

  const willChangeCount = useMemo(
    () =>
      chosenNumbers.filter((number) => buildApplyPayload(number.row, template, scope) !== null).length,
    [chosenNumbers, template, scope],
  );

  /* Numbers already carrying settings from a *different* template — surfaced
     before the run so an admin picking numbers doesn't overwrite another
     template's work without knowing. No platform researched blocks on this
     (see the deep-dive research: a "this affects N numbers" warning wasn't
     found documented anywhere), so this stays informational, not a gate. */
  const alreadyTemplated = useMemo(
    () =>
      chosenNumbers
        .map((number) => ({ number, source: currentTemplateSource(number.row) }))
        .filter(({ source }) => source && source.uuid !== template?.uuid) as {
        number: NumberRow;
        source: { uuid: string; name: string };
      }[],
    [chosenNumbers, template],
  );

  const { mutate: run, isPending: running } = useMutation({
    mutationFn: async () => {
      const tally = { changed: 0, skipped: 0, failed: 0 };
      const collected: Record<string, RunResult> = {};

      for (const number of chosenNumbers) {
        const payload = buildApplyPayload(number.row, template, scope);

        if (!payload) {
          collected[number.uuid] = {
            outcome: 'skipped',
            text: 'This template has nothing in this scope to apply, so nothing was saved.',
          };
          tally.skipped += 1;
          continue;
        }

        try {
          await callForwarding({
            uuid: payload.uuid,
            forward_call_actions: JSON.stringify(payload.forward_call_actions),
          });
          collected[number.uuid] = { outcome: 'changed', text: 'Template applied.' };
          tally.changed += 1;
        } catch (error: any) {
          collected[number.uuid] = {
            outcome: 'failed',
            text: error?.response?.data?.message || 'The save was refused. Please try again.',
          };
          tally.failed += 1;
        }

        await pause();
      }

      return { tally, collected };
    },
    onSuccess: ({ tally, collected }) => {
      setResults(collected);
      setRan(true);
      const parts: string[] = [];
      if (tally.changed > 0) parts.push(`Applied to ${tally.changed}.`);
      if (tally.skipped > 0) parts.push(`${tally.skipped} skipped — nothing in this scope to give them.`);
      if (tally.failed > 0) parts.push(`${tally.failed} failed to save.`);
      handleAlert({
        type: tally.failed > 0 ? 'warning' : 'success',
        text: parts.join(' ') || 'Nothing to do — no numbers were selected.',
      });
      if (tally.changed > 0) {
        queryClient.invalidateQueries({ queryKey: ['fetchNumbersList'] });
        queryClient.invalidateQueries({ queryKey: ['allNumbersList'] });
      }
    },
    onError: () =>
      handleAlert({ type: 'error', text: 'The run could not be started. Please try again.' }),
  });

  const allVisibleOn = visible.length > 0 && visible.every((number) => selected[number.uuid]);

  const toggleAllVisible = () =>
    setSelected((previous) => {
      const next = { ...previous };
      visible.forEach((number) => {
        next[number.uuid] = !allVisibleOn;
      });
      return next;
    });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#9A948F]" />
        <p className="text-xs text-[#2E2D35]">
          <span className="font-semibold text-[#2E2D35]">What this writes.</span> Each number you pick
          is saved with a copy of "{template?.name}"'s settings, in the scope you choose below.
          Applying is a one-time copy — editing the template afterwards will not change numbers it was
          already applied to. Anything outside the chosen scope is left exactly as that number already
          had it.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-[#EEE7DD] p-3">
        <p className="text-xs font-semibold text-[#2E2D35]">Apply</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {CALL_HANDLING_APPLY_SCOPES.map((option) => (
            <label
              key={option.value}
              className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-xs transition-colors ${
                scope === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-[#EEE7DD] hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-1.5 font-semibold text-[#2E2D35]">
                <input
                  type="radio"
                  name="call-handling-apply-scope"
                  className="accent-primary"
                  checked={scope === option.value}
                  disabled={running}
                  onChange={() => setScope(option.value)}
                />
                {option.label}
              </span>
              <span className="text-[#9A948F]">{option.description}</span>
            </label>
          ))}
        </div>
      </div>

      {alreadyTemplated.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            {alreadyTemplated.length} of the numbers you picked already {alreadyTemplated.length === 1 ? 'has' : 'have'} settings
            from a different template ({Array.from(new Set(alreadyTemplated.map((item) => item.source.name))).join(', ')}).
            Running this will overwrite that.
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#EEE7DD] p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-[280px]">
            <Input
              placeholder="Search by number, label or site"
              value={search}
              disabled={running}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#2E2D35]">
              {chosenNumbers.length} of {numbers.length} chosen
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAllVisible}
              disabled={running || visible.length === 0}
            >
              {allVisibleOn ? 'Clear these' : `Select these ${visible.length}`}
            </Button>
          </div>
        </div>

        {loadingNumbers ? (
          <Loader />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#EEE7DD]">
            {visible.length === 0 ? (
              <p className="p-4 text-center text-xs text-[#9A948F]">No numbers match that search.</p>
            ) : (
              visible.map((number) => {
                const result = ran ? results[number.uuid] : undefined;
                const Icon = result ? OUTCOME_ICON[result.outcome] : null;
                const source = currentTemplateSource(number.row);
                return (
                  <label
                    key={number.uuid}
                    className="flex cursor-pointer items-start gap-3 border-b border-gray-100 p-3 last:border-b-0 hover:bg-[#FBE2C8]/45"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={!!selected[number.uuid]}
                      disabled={running}
                      onCheckedChange={() =>
                        setSelected((previous) => ({
                          ...previous,
                          [number.uuid]: !previous[number.uuid],
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[#2E2D35]">{number.label}</span>
                      {number.detail ? (
                        <span className="block text-xs text-[#9A948F]">{number.detail}</span>
                      ) : null}
                      {source && !result ? (
                        <span className="mt-1 block text-[11px] text-[#9A948F]">
                          Currently from "{source.name}"
                        </span>
                      ) : null}
                      {result && Icon ? (
                        <span
                          className={`mt-1 flex items-start gap-1 text-xs ${OUTCOME_COLOUR[result.outcome]}`}
                        >
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="text-[#2E2D35]">{result.text}</span>
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] p-4">
        <p className="text-xs text-[#9A948F]">
          Numbers are saved one at a time, so a long list takes a moment. Please leave this open until
          it finishes.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => run()}
            disabled={running || chosenNumbers.length === 0}
          >
            {running
              ? 'Applying...'
              : `Apply to ${willChangeCount || chosenNumbers.length} ${
                  (willChangeCount || chosenNumbers.length) === 1 ? 'number' : 'numbers'
                }`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ApplyCallHandlingTemplate;
