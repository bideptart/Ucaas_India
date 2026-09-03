/* Walking a hypothetical call through a Call Handling Template's decision
 * tree, without placing a real call or touching a live number.
 *
 * Competitor research (RingCentral, Webex, Aircall, Microsoft Teams Phone,
 * Genesys Cloud, Zoom Phone, Dialpad, Nextiva, Vonage, plus a follow-up pass
 * over Five9, Intermedia, babelforce, Talkdesk, 8x8, GoTo Connect and Ooma
 * Office — 15 vendors total) found no product that ships this for a plain
 * call-routing/IVR template: every "test" feature found actually places a
 * real call (8x8's "Test Open Menu", Intermedia, babelforce) or is scoped to
 * conversational/AI flows rather than routing rules (Talkdesk's Automation
 * Designer Simulator). This is a deliberately different, purely local
 * decision-tree walk instead.
 *
 * Pure — no network, no React, no clock read internally (the caller passes
 * the moment to test, so the same input always produces the same answer and
 * this stays trivially testable).
 */

export interface SimulationStep {
  label: string;
  detail: string;
}

export interface SimulationResult {
  isOpen: boolean;
  steps: SimulationStep[];
  finalAction: string;
}

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Whether `time` (HH:MM) falls within [start, end), both HH:MM strings. */
const withinWindow = (time: string, start: string, end: string): boolean =>
  Boolean(start) && Boolean(end) && time >= start && time < end;

/**
 * Given a template's parsed `forward_call_actions` and a moment to test,
 * decides whether that moment is inside business hours and what the call
 * would do next — the same two facts `set-number-forwarding` already reads
 * off this exact shape (`condition.operational_hours`, `call_handling.business_hours`),
 * just evaluated instead of rendered into a form.
 */
export const simulateCallHandling = (forwardActions: any, testAt: Date): SimulationResult => {
  const condition = forwardActions?.condition ?? {};
  const callHandling = forwardActions?.call_handling ?? {};
  const operationalHours = condition?.operational_hours ?? {};

  const dayKey = DAY_KEYS[testAt.getDay()];
  const dayLabel = testAt.toLocaleDateString(undefined, { weekday: 'long' });
  const timeStr = `${pad2(testAt.getHours())}:${pad2(testAt.getMinutes())}`;

  const steps: SimulationStep[] = [];
  let isOpen: boolean;

  if (operationalHours?.type === '24_hours') {
    isOpen = true;
    steps.push({
      label: 'Business hours',
      detail: 'This template is set to 24 Hours — every moment counts as open.',
    });
  } else {
    const daySchedule = operationalHours?.value?.[dayKey];
    if (!daySchedule?.open) {
      isOpen = false;
      steps.push({
        label: 'Business hours',
        detail: `${dayLabel} is marked closed on this template's weekly schedule.`,
      });
    } else {
      isOpen = withinWindow(timeStr, daySchedule.start, daySchedule.end);
      steps.push({
        label: 'Business hours',
        detail: `${dayLabel} is open ${daySchedule.start}–${daySchedule.end}. ${timeStr} is ${
          isOpen ? 'inside' : 'outside'
        } that window.`,
      });
    }
  }

  let finalAction: string;
  if (isOpen) {
    const businessHours = callHandling?.business_hours;
    finalAction = businessHours?.label || businessHours?.name || 'No action configured on this template';
    steps.push({ label: 'Routes to', detail: finalAction });
  } else {
    const closedAction = operationalHours?.closed_hour_action;
    finalAction =
      closedAction?.value_label ||
      closedAction?.type_label ||
      'No closed-hours action configured on this template';
    steps.push({ label: 'Closed-hours action', detail: finalAction });
  }

  const media = forwardActions?.media ?? {};
  if (media?.welcome?.enabled) {
    steps.push({ label: 'Plays first', detail: media.welcome.label || 'Welcome greeting' });
  }

  return { isOpen, steps, finalAction };
};
