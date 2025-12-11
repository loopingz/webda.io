/**
 * Represents a time duration that defaults to seconds but supports composite strings.
 *
 * Supported units:
 * - seconds: `s`, `sec`, `secs`, `second`, `seconds`
 * - minutes: `m`, `min`, `mins`, `minute`, `minutes`
 * - hours: `h`, `hr`, `hour`, `hours`
 * - days: `d`, `day`, `days`
 * - months: `mo`, `mon`, `month`, `months` (assumed 30 days)
 * - years: `y`, `yr`, `year`, `years` (assumed 365 days)
 *
 * Examples:
 * - `10` → 10 seconds
 * - `15s` → 15 seconds
 * - `2m` → 120 seconds
 * - `1d2h30m` → 1 day + 2 hours + 30 minutes
 * - `1 d 2 h` → same as above (spaces allowed)
 */
export class Duration {
    protected _raw: number | string;
    protected seconds: number;
    /**
     * Create a Duration.
     * @param value Number of seconds or a string representing the duration.
     * @param start Optional start time reference for expiration, as `Date`, ms timestamp, or ISO string.
     */
    constructor(value: number | string, protected start?: Date | number | string) {
        this._raw = value;
        this.seconds = Duration.parseToSeconds(this._raw);
    }

    /**
     * Convert the duration to milliseconds.
     * @returns Duration in milliseconds.
     */
    toMs() {
        return this.seconds * 1000;
    }

    /**
     * Convert the duration to seconds.
     * @returns Duration in seconds.
     */
    toSeconds() {
        return this.seconds;
    }

    /**
     * Primitive numeric representation used in arithmetic, returns milliseconds.
     * @returns Duration in milliseconds.
     */
    valueOf() {
        return this.toMs();
    }

    /**
     * Check whether the duration has elapsed since `start`.
     * If `start` is not provided, uses the start provided to the constructor.
     * @param start Optional start reference time.
     * @returns `true` if now - start >= duration; otherwise `false`.
     */
    expired(start?: Date | number | string) : boolean {
        start ??= this.start;
        if (!start) {
            throw new Error("Start date is required, if not provided in constructor");
        }
        const startMs = Duration.resolveToMs(start);
        const nowMs = Date.now();
        const durationMs = this.toMs();
        return nowMs - startMs >= durationMs;
    }

    // Internal helpers
    /**
     * Map a unit token to its multiplier in seconds.
     * @param unit Unit string.
     * @returns Number of seconds in one unit.
     */
    private static unitToSeconds(unit: string): number {
        const u = unit.toLowerCase();
        switch (u) {
            case "s":
            case "sec":
            case "secs":
            case "second":
            case "seconds":
                return 1;
            case "h":
            case "hr":
            case "hour":
            case "hours":
                return 60 * 60;
            case "m":
            case "min":
            case "mins":
            case "minute":
            case "minutes":
                return 60;
            case "d":
            case "day":
            case "days":
                return 60 * 60 * 24;
            case "M":
            case "mo":
            case "mon":
            case "month":
            case "months":
                return 60 * 60 * 24 * 30; // assume 30-day months
            case "y":
            case "yr":
            case "year":
            case "years":
                return 60 * 60 * 24 * 365; // assume 365-day years
            default:
                throw new Error(`Unsupported duration unit: ${unit}`);
        }
    }

    /**
     * Normalize a date-like input to milliseconds since epoch.
     * @param value `Date`, ms timestamp, or date string.
     * @returns Milliseconds since epoch.
     */
    private static resolveToMs(value: Date | number | string): number {
        if (value instanceof Date) return value.getTime();
        if (typeof value === "number") return value; // assume already ms if number start is provided
        const d = new Date(value);
        const t = d.getTime();
        if (isNaN(t)) {
            throw new Error(`Invalid start date: ${value}`);
        }
        return t;
    }

    /**
     * Parse a duration input to seconds.
     * Accepts numbers (seconds) or composite strings like `1d2h30m`.
     * Missing units default to seconds.
     * @param input Numeric seconds or a duration string.
     * @returns Duration in seconds.
     */
    private static parseToSeconds(input: number | string): number {
        if (typeof input === "number") {
            // Default: numbers are seconds
            return input;
        }
        const raw = String(input).trim();
        if (!raw) throw new Error("Duration value cannot be empty");

        // Support composite durations like "1d2h30m" or with spaces "1 d 2 m".
        let totalSeconds = 0;
        const re = /([+-]?\d+(?:\.\d+)?)([a-zA-Z]+)?/g;
        let matched = false;
        let m: RegExpExecArray | null;
        while ((m = re.exec(raw)) !== null) {
            matched = true;
            const num = parseFloat(m[1]);
            const unit = m[2] ?? "s"; // default to seconds if unit omitted
            const factor = this.unitToSeconds(unit);
            totalSeconds += num * factor;
        }
        if (!matched) {
            throw new Error(`Invalid duration format: ${raw}`);
        }
        return totalSeconds;
    }
}

export default Duration;