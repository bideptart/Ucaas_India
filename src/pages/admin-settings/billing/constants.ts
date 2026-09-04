import { formatMoney } from '@/lib/billing-money';

export const TOP_UP_AMOUNT = [20, 50, 100, 150, 200];

// `value` stays the raw figure the API expects; `label` is that figure
// converted to INR for display, via the same conversion every other billing
// screen uses.
export const AUTO_PURCHASE_MIN_BALANCE_DATA = [20, 30, 50, 75, 100, 125, 150, 175, 200].map(
  (value) => ({ label: formatMoney(value) as string, value }),
);

// export const RequestedPlanStatusMap: any = {
//   P: 'Pending',
//   C: 'Canceled',
//   A: 'Active',
//   D: 'Disabled',
//   E: 'Expired',
//   R: 'Rejected',
//   U: 'Upgraded',
//   S: 'Suspended',
// };

export const RequestedPlanStatusMap: Record<string, { label: string; color: string }> = {
  P: { label: 'Pending', color: 'bg-orange-100 text-orange-600' },
  C: { label: 'Canceled', color: 'bg-red-100 text-red-600' },
  A: { label: 'Active', color: 'bg-green-100 text-green-600' },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-600' },
  D: { label: 'Disabled', color: 'bg-gray-200 text-gray-600' },
  E: { label: 'Expired', color: 'bg-gray-100 text-gray-500' },
  EXPIRED: { label: 'Expired', color: 'bg-red-200 text-red-700' },
  R: { label: 'Rejected', color: 'bg-red-200 text-red-700' },
  U: { label: 'Upgraded', color: 'bg-ucass-active-bg text-ucass-active' },
  S: { label: 'Suspended', color: 'bg-yellow-100 text-yellow-600' },
};

export const RequestedPlanDurationMap: any = {
  1: 'month',
  4: 'quarter',
  6: 'half-Year',
  12: 'year',
};
export const PRICE_FEATURES = [
  { id: 1, name: 'Virtual Number' },
  { id: 2, name: 'Local Calls' },
  { id: 3, name: 'International Calls' },
  { id: 4, name: 'SMS' },
  { id: 5, name: 'Unlimited Chat' },
  { id: 6, name: 'Call Forwarding' },
  { id: 7, name: 'Call Waiting' },
  { id: 8, name: 'Call Recording' },
];

export const durationMap: any = {
  1: 'MONTHLY',
  3: 'QUARTERLY',
  6: 'SIX_MONTH',
  12: 'YEARLY',
};

export const PlanDurationMap: any = {
  1: 'month',
  12: 'year',
};
