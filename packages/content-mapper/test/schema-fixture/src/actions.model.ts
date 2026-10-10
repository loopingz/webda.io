/**
 * Decorated methods and `@WebdaSchema` types for the top-level schema tests.
 *
 * The `.input` schema is hand-built rather than converted, so the things
 * worth asserting are the ones that follow from that: no `$schema`,
 * declaration-order `required`, and `required` omitted entirely when empty.
 */

/**
 * Marks a method as a callable operation.
 * @returns the decorator
 */
export function Action(): MethodDecorator {
  return () => {};
}

/**
 * A type published under its own name.
 * @WebdaSchema
 */
export interface Ticket {
  /** What it is about. */
  subject: string;
  /** Optional detail. */
  body?: string;
  /** Optional by syntax, which holds even where `strict` is off. */
  assignee: string | undefined;
}

/**
 * A type published under an explicit name.
 * @WebdaSchema renamedPayload
 */
export interface Payload {
  value: number;
}

/**
 * Carries the actions under test.
 *
 * Tagged as a behaviour because that is one of the three places an action
 * schema can come from, and the only one whose root name comes from the tag.
 * @WebdaBehavior
 */
export class Desk {
  /** No parameters at all. */
  @Action()
  ping(): void {}

  /** Mixed optionality, to pin the order and the filter. */
  @Action()
  open(subject: string, priority?: number, tags: string[] = []): Promise<Ticket> {
    void subject;
    void priority;
    void tags;
    return Promise.resolve({ subject, assignee: undefined });
  }

  /**
   * A parameter written `| undefined` is still positionally required —
   * unlike a *property* written the same way, which the schema marks
   * optional. The two rules genuinely differ.
   */
  @Action()
  close(reason: string | undefined): Promise<number> {
    void reason;
    return Promise.resolve(0);
  }

  /** Server stream: tickets as they come. */
  @Action()
  async *watch(since: number): AsyncGenerator<Ticket> {
    void since;
    yield { subject: "watched", assignee: undefined };
  }

  /** Client stream: adds up the payloads. */
  @Action()
  async total(values: AsyncIterable<Payload>): Promise<number> {
    let sum = 0;
    for await (const payload of values) sum += payload.value;
    return sum;
  }

  /** Both directions: relays the payloads. */
  @Action()
  async *relay(frames: AsyncIterable<Payload>): AsyncGenerator<Payload> {
    yield* frames;
  }

  /** Not decorated, so it contributes nothing. */
  helper(): string {
    return "";
  }
}
