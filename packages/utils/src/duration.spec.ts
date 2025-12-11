import { suite, test } from "@webda/test";
import assert from "assert";
import { Duration } from "./duration";

@suite
class DurationSpec {
	@test
	async parses_default_seconds_from_number() {
		const d = new (Duration as any)(10);
		assert.strictEqual(d.toSeconds(), 10);
		assert.strictEqual(d.toMs(), 10000);
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
}

export default DurationSpec;

