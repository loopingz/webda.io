import { suite, test } from "@webda/test";
import assert from "assert";
import { Duration } from "./duration";

@suite
export class DurationSpec {
	@test
	async parses_default_seconds_from_number() {
		const d = new (Duration as any)(10);
		assert.strictEqual(d.toSeconds(), 10);
		assert.strictEqual(d.toMs(), 10000);
		assert.strictEqual(d.valueOf(), 10000);
	}

	@test
	async parses_seconds_from_string() {
		const d = new (Duration as any)("15s");
		assert.strictEqual(d.toSeconds(), 15);
		assert.strictEqual(d.toMs(), 15000);
	}

	@test
	async parses_minutes() {
		const d = new (Duration as any)("2m");
		assert.strictEqual(d.toSeconds(), 120);
		assert.strictEqual(d.toMs(), 120000);
	}

	@test
	async parses_days() {
		const d = new (Duration as any)("1d");
		assert.strictEqual(d.toSeconds(), 86400);
	}

	@test
	async parses_months_30_day() {
		const d = new (Duration as any)("1mo");
		assert.strictEqual(d.toSeconds(), 30 * 86400);
	}

	@test
	async parses_years_365_day() {
		const d = new (Duration as any)("1y");
		assert.strictEqual(d.toSeconds(), 365 * 86400);
	}

	@test
	async parses_complex_duration() {
		const d = new (Duration as any)("1y 6mo 10s");
		assert.strictEqual(d.toSeconds(), 365 * 86400 + 6 * 30 * 86400 + 10);
	}

	@test
	async expired_returns_false_when_not_reached() {
		const start = Date.now();
		const d = new (Duration as any)("2s", start);
		assert.strictEqual(d.expired(start), false);
	}

	@test
	async expired_returns_true_when_reached() {
		const start = Date.now();
		const d = new (Duration as any)("1s", start);
		await new Promise((r) => setTimeout(r, 1100));
		assert.strictEqual(d.expired(start), true);
	}

	@test
	async parses_hours() {
		const d1 = new (Duration as any)("1h");
		assert.strictEqual(d1.toSeconds(), 3600);

		const d2 = new (Duration as any)("2hr");
		assert.strictEqual(d2.toSeconds(), 7200);

		const d3 = new (Duration as any)("3hour");
		assert.strictEqual(d3.toSeconds(), 10800);

		const d4 = new (Duration as any)("4hours");
		assert.strictEqual(d4.toSeconds(), 14400);
	}

	@test
	async parses_all_second_units() {
		assert.strictEqual(new (Duration as any)("10sec").toSeconds(), 10);
		assert.strictEqual(new (Duration as any)("10secs").toSeconds(), 10);
		assert.strictEqual(new (Duration as any)("10second").toSeconds(), 10);
		assert.strictEqual(new (Duration as any)("10seconds").toSeconds(), 10);
	}

	@test
	async parses_all_minute_units() {
		assert.strictEqual(new (Duration as any)("5min").toSeconds(), 300);
		assert.strictEqual(new (Duration as any)("5mins").toSeconds(), 300);
		assert.strictEqual(new (Duration as any)("5minute").toSeconds(), 300);
		assert.strictEqual(new (Duration as any)("5minutes").toSeconds(), 300);
	}

	@test
	async parses_all_day_units() {
		assert.strictEqual(new (Duration as any)("1day").toSeconds(), 86400);
		assert.strictEqual(new (Duration as any)("2days").toSeconds(), 172800);
	}

	@test
	async parses_all_month_units() {
		assert.strictEqual(new (Duration as any)("1mo").toSeconds(), 30 * 86400);
		assert.strictEqual(new (Duration as any)("1mon").toSeconds(), 30 * 86400);
		assert.strictEqual(new (Duration as any)("1month").toSeconds(), 30 * 86400);
		assert.strictEqual(new (Duration as any)("2months").toSeconds(), 60 * 86400);
	}

	@test
	async parses_all_year_units() {
		assert.strictEqual(new (Duration as any)("1yr").toSeconds(), 365 * 86400);
		assert.strictEqual(new (Duration as any)("1year").toSeconds(), 365 * 86400);
		assert.strictEqual(new (Duration as any)("2years").toSeconds(), 730 * 86400);
	}

	@test
	async throws_on_empty_string() {
		assert.throws(() => new (Duration as any)(""), /Duration value cannot be empty/);
		assert.throws(() => new (Duration as any)("   "), /Duration value cannot be empty/);
	}

	@test
	async throws_on_invalid_unit() {
		assert.throws(() => new (Duration as any)("10xyz"), /Unsupported duration unit/);
	}

	@test
	async throws_on_invalid_format() {
		assert.throws(() => new (Duration as any)("invalid"), /Invalid duration format/);
	}

	@test
	async expired_with_date_object() {
		const start = new Date(Date.now() - 2000);
		const d = new (Duration as any)("1s");
		assert.strictEqual(d.expired(start), true);
	}

	@test
	async expired_with_string_date() {
		const start = new Date(Date.now() - 2000).toISOString();
		const d = new (Duration as any)("1s");
		assert.strictEqual(d.expired(start), true);
	}

	@test
	async expired_with_timestamp() {
		const start = Date.now() - 2000;
		const d = new (Duration as any)("1s");
		assert.strictEqual(d.expired(start), true);
	}

	@test
	async parses_decimal_values() {
		const d = new (Duration as any)("1.5h");
		assert.strictEqual(d.toSeconds(), 5400);
	}

	@test
	async parses_negative_values() {
		const d = new (Duration as any)("-10s");
		assert.strictEqual(d.toSeconds(), -10);
	}

	@test
	async parses_number_without_unit() {
		// Test the ?? operator when unit is not provided (line 140)
		const d = new (Duration as any)("30");
		assert.strictEqual(d.toSeconds(), 30);
	}
}

export default DurationSpec;
