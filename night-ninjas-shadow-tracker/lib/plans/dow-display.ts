import type { FirstDayOfWeek } from '@/lib/store/settings';

/**
 * DOW translation between internal Monday-anchored model and the
 * user's first-day-of-week display preference.
 *
 * Internal model (FIXED):
 *   Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
 *
 * Display layouts:
 *   monday-first: column order [Mon Tue Wed Thu Fri Sat Sun] = internal [0 1 2 3 4 5 6]
 *   sunday-first: column order [Sun Mon Tue Wed Thu Fri Sat] = internal [6 0 1 2 3 4 5]
 *
 * Two helpers below; the matrix presentation uses both.
 */

export const DOW_LABELS_MONDAY_FIRST = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const DOW_LABELS_SUNDAY_FIRST = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/**
 * Get the column-order array of internal dow indices for the user's
 * preferred week start. Iterating this in order gives the cells in
 * left-to-right display order.
 *
 * monday: [0,1,2,3,4,5,6]
 * sunday: [6,0,1,2,3,4,5]
 */
export function dowDisplayOrder(firstDay: FirstDayOfWeek): readonly number[] {
  return firstDay === 'sunday'
    ? [6, 0, 1, 2, 3, 4, 5]
    : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Get the display labels in column order for the user's preferred
 * week start.
 */
export function dowDisplayLabels(firstDay: FirstDayOfWeek): readonly string[] {
  return firstDay === 'sunday' ? DOW_LABELS_SUNDAY_FIRST : DOW_LABELS_MONDAY_FIRST;
}
