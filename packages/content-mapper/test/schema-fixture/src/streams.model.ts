/**
 * A streamed parameter next to another one: invalid, converted directly by the test
 * (not decorated, so the top-level schema generation ignores it).
 */
export interface Frame {
  data: string;
}

export class Mixed {
  /**
   * @param id - an identifier
   * @param frames - the stream
   * @returns nothing
   */
  mixed(id: string, frames: AsyncIterable<Frame>): Promise<void> {
    void id;
    void frames;
    return Promise.resolve();
  }
}
