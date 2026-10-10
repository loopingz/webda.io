/**
 * Minimal typed event emitter that works in browsers and Node
 */
export class Emitter<E extends Record<string, any>> {
  protected listeners = new Map<keyof E, Set<(data: any) => void>>();

  /**
   * @param event - event name
   * @param fn - listener
   * @returns a function removing the listener
   */
  on<K extends keyof E>(event: K, fn: (data: E[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.off(event, fn);
  }

  /**
   * @param event - event name
   * @param fn - listener
   */
  off<K extends keyof E>(event: K, fn: (data: E[K]) => void): void {
    this.listeners.get(event)?.delete(fn);
  }

  /**
   * Call the listeners; a throwing listener does not stop the others
   * @param event - event name
   * @param data - payload
   */
  protected emit<K extends keyof E>(event: K, data: E[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        fn(data);
      } catch {
        // Listener errors belong to the app
      }
    }
  }
}
