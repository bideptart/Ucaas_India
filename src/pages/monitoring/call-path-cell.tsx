import CustomTooltip from '@/components/custom/custom-tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

function getContextPathValueLabel(value: any): string {
  if (value === null || value === undefined) return '';

  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return getContextPathValues(value).join(' -> ');
  }

  const displayValue =
    value?.label ??
    value?.name ??
    value?.context ??
    value?.current_context ??
    value?.value ??
    value?.type ??
    value?.id;

  if (displayValue !== null && displayValue !== undefined && typeof displayValue !== 'object') {
    return String(displayValue).trim();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function getContextPathValues(contextPath: any): string[] {
  if (contextPath === null || contextPath === undefined || contextPath === '') return [];

  if (Array.isArray(contextPath)) {
    return contextPath.map(getContextPathValueLabel).filter(Boolean);
  }

  if (typeof contextPath === 'string') {
    const trimmedContextPath = contextPath.trim();
    if (!trimmedContextPath) return [];

    try {
      const parsedContextPath = JSON.parse(trimmedContextPath);
      return getContextPathValues(parsedContextPath);
    } catch {
      return trimmedContextPath
        .split(/\s*(?:->|,|\|)\s*/)
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  if (typeof contextPath === 'object') {
    return Object.values(contextPath).map(getContextPathValueLabel).filter(Boolean);
  }

  return [String(contextPath).trim()].filter(Boolean);
}

type CallPathCellProps = {
  call: any;
  onOpen: (call: any) => void;
  secondary?: ReactNode;
};

const getCampaignCallPathLabel = (call: any) => {
  const campaignLabel =
    `${call?.campaign_name || ''}${call?.campaign_type ? ` (${call?.campaign_type})` : ''}`.trim();

  return campaignLabel || null;
};

export const CallPathCell = ({ call, onOpen, secondary }: CallPathCellProps) => {
  const secondaryContent = secondary ?? getCampaignCallPathLabel(call);

  const currentContextLabel = call?.current_context || '';

  return (
    // min-w-[120px] gives this column room to hold "Retention Queue"-length
    // values without the browser's natural auto-layout squeezing it down to
    // whatever's left over; max-w-[200px] plus truncate below is the actual
    // clipping mechanism ONLY once a genuinely long value would otherwise
    // run into the Actions column beside it — the tooltip on each truncated
    // span means nothing is lost, just not shown at full length inline.
    <div className="flex min-w-[120px] max-w-[200px] flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Empty, not a dash. A cell with no context has nothing to say;
            '---' reads as a value that failed to load. The info button
            beside it still opens the full path. */}
        <CustomTooltip text={currentContextLabel} side="top">
          <div className="min-w-0 truncate capitalize">{currentContextLabel}</div>
        </CustomTooltip>
        {call ? (
          <CustomTooltip text="View call path" side="top">
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-500 dark:text-mcm-ink-3 hover:bg-gray-100 dark:hover:bg-mcm-surface-3 hover:text-primary"
              aria-label="View call path"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(call);
              }}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </CustomTooltip>
        ) : null}
      </div>
      {secondaryContent ? (
        <CustomTooltip text={secondaryContent} side="top">
          <div className="min-w-0 truncate">{secondaryContent}</div>
        </CustomTooltip>
      ) : null}
    </div>
  );
};

type CallPathDialogProps = {
  call: any;
  onClose: () => void;
};

export const CallPathDialog = ({ call, onClose }: CallPathDialogProps) => {
  const contextPathValues = getContextPathValues(call?.context_path);

  return (
    <Dialog
      open={Boolean(call)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-full max-w-[480px] p-5">
        <DialogHeader>
          <DialogTitle className="text-md">Call Path</DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-mcm-ink-3">
            Current context:{' '}
            <span className="font-medium capitalize text-gray-900 dark:text-mcm-ink">
              {call?.current_context || '---'}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-mcm-ink-3">
            Context Path
          </p>
          {contextPathValues.length ? (
            <div className="rounded-lg border border-gray-200 dark:border-mcm-line bg-gray-50 dark:bg-mcm-surface-3 p-3">
              <p className="break-words text-sm font-medium capitalize text-gray-900 dark:text-mcm-ink">
                {contextPathValues.join(' -> ')}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 dark:border-mcm-line p-3 text-sm text-gray-500 dark:text-mcm-ink-3">
              No context path available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
