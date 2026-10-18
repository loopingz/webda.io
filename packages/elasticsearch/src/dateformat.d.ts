declare module "dateformat" {
  /**
   * Format a date using a dateformat mask.
   * @param date - date to format
   * @param mask - format mask
   * @param utc - use UTC instead of local time
   * @param gmt - use the GMT timezone label
   * @returns the formatted date
   */
  export default function dateFormat(date: Date | string | number, mask?: string, utc?: boolean, gmt?: boolean): string;
}
