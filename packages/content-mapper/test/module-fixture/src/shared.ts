import { Action, Shared } from "./decorators.js";
import { useContext } from "./decorators.js";
import { formatDate, type Money } from "./helpers.js";

const RATE = 2;

/**
 * A helper declared in the file
 * @returns a number
 */
function helper(): number {
  return 1;
}

// Not a model (nothing here extends @webda/models): only read by
// buildModelShared directly, to check the purity rules.
export class Invoice {
  amount: number;
  due: Date;
  status: "open" | "paid";
  lines: { amount: number }[];

  /**
   * Pure: parameters, attributes, globals, another shared method and a static shared one
   * @param now - the date
   * @returns true when overdue
   */
  @Shared()
  isOverdue(now: Date = new Date()): boolean {
    const late = this.status === "open" && this.due.getTime() < now.getTime();
    return late && this.total() > Math.max(0, Invoice.minimum());
  }

  @Shared()
  total(): number {
    return this.lines.reduce((sum, line) => sum + line.amount, 0);
  }

  @Shared()
  static minimum(): number {
    return 0;
  }

  @Shared()
  label(): string {
    return formatDate(this.due);
  }

  @Shared()
  withType(money: Money): Money {
    return money;
  }

  @Shared()
  toProxy(): Invoice {
    return this;
  }

  @Shared()
  static sortByDue<T extends { due: Date }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.due.getTime() - b.due.getTime());
  }

  @Shared()
  shorthand(): { amount: number } {
    const amount = this.amount;
    return { amount };
  }

  @Action()
  notShared() {}

  save(): void {}
}

export class Impure {
  amount: number;

  @Shared()
  usesContext(): string {
    return useContext();
  }

  @Shared()
  usesLocal(): number {
    return helper() + RATE;
  }

  @Shared()
  usesSave(): void {
    this.save();
  }

  @Shared()
  usesAction(): void {
    this.action();
  }

  @Shared()
  usesUnknownStatic(): number {
    return Impure.nope();
  }

  @Shared()
  usesSuper(): string {
    return super.toString();
  }

  @Shared()
  usesUnresolved(): unknown {
    return notDeclaredAnywhere;
  }

  @Action()
  action() {}

  save(): void {}

  static nope(): number {
    return 1;
  }
}
