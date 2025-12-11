/**
 * Represents a file size that can be created from a number of bytes or a human-readable string.
 *
 * Schema:
 * - `@schema number | string`
 * - `@minimum 0`
 * - `@pattern ^([0-9]*\.?[0-9]+)\s*(B|KB|MB|GB|TB|PB|O|KO|MO|GO|TO|PO)?$`
 *
 * Supported inputs:
 * - Numeric bytes: `1024`
 * - Strings with units: `"1 KB"`, `"1MB"`, `"1.5 GB"`
 * - Octet aliases (translated to `B`): `O`, `KO`, `MO`, `GO`, `TO`, `PO`
 *
 * Output formatting chooses the most suitable unit and prints with 0 decimals for values >= 100,
 * otherwise 2 decimals.
 */
export class FileSize {
    value: number;
    /**
     * Create a FileSize.
     * @param value Bytes as a number or a unit string.
     */
    constructor(value: number | string) {
        if (typeof value === "number") {
            this.value = value;
            return;
        }
        // Also manage octet
        const trimmed = value.trim().replace(/o+/gi, "B").toUpperCase();
        const match = /^([0-9]*\.?[0-9]+)\s*(B|KB|MB|GB|TB|PB)?$/i.exec(trimmed);
        if (!match) {
            throw new Error(`Invalid file size: ${value}`);
        }
        const num = parseFloat(match[1]);
        const unit = (match[2] || "B").toUpperCase();
        const factor = {
            B: 1,
            KB: 1024,
            MB: 1024 ** 2,
            GB: 1024 ** 3,
            TB: 1024 ** 4,
            PB: 1024 ** 5
        }[unit];
        this.value = Math.round(num * factor);
    }

    /**
     * Primitive numeric representation returns the number of bytes.
     * @returns Bytes as a number.
     */
    valueOf() {
        return this.value;
    }

    /**
     * Format bytes using the most suitable unit with a fixed precision.
     * @returns Human readable size string like `"1.23 MB"`.
     */
    toString(): string {
        const units = [
            { name: "B", factor: 1 },
            { name: "KB", factor: 1024 },
            { name: "MB", factor: 1024 ** 2 },
            { name: "GB", factor: 1024 ** 3 },
            { name: "TB", factor: 1024 ** 4 },
            { name: "PB", factor: 1024 ** 5 }
        ];
        let chosen = units[0];
        for (const u of units) {
            if (this.value >= u.factor) chosen = u;
            else break;
        }
        const val = this.value / chosen.factor;
        return `${val.toFixed(val >= 100 ? 0 : 2)} ${chosen.name}`;
    }

    /**
     * Allow implicit conversion to string or number depending on the hint.
     */
    [Symbol.toPrimitive](hint: "number" | "string" | "default") {
        if (hint === "string") return this.toString();
        return this.valueOf();
    }
}
