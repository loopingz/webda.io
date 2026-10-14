/** A type a shared method may use from an allowlisted module */
export interface Money {
  amount: number;
  currency: string;
}

/**
 * @param date - a date
 * @returns its ISO day
 */
export function formatDate(date: Date): string {
  return date.toISOString().substring(0, 10);
}
