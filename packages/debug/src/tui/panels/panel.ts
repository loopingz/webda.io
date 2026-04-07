/**
 * Interface for TUI panels.
 *
 * Each panel represents a tab in the debug dashboard and is responsible
 * for rendering its content area and handling keyboard input.
 */
export interface Panel {
  /** Display name shown in the tab bar */
  name: string;

  /**
   * Render the panel content into the terminal.
   *
   * @param term - terminal-kit terminal instance
   * @param startRow - first row available for content (after header)
   * @param endRow - last row available for content (before status bar)
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void;

  /**
   * Handle a keypress while this panel is active.
   *
   * @param key - Key name from terminal-kit (e.g. "UP", "DOWN", "ENTER")
   */
  onKey?(key: string): void;

  /**
   * Update panel data (called on initial load and on restart events).
   */
  refresh?(): Promise<void>;

  /**
   * Clean up resources when the panel is no longer needed.
   */
  destroy(): void;
}

/**
 * Base class for panels that display a scrollable list of items.
 * Provides cursor movement and scroll offset logic.
 */
export abstract class ScrollablePanel implements Panel {
  abstract name: string;
  /** Current cursor position in the items array */
  protected cursor = 0;
  /** Scroll offset (first visible row index) */
  protected scrollOffset = 0;
  /** Total number of items */
  protected itemCount = 0;

  /**
   * Move the cursor, clamping to valid range and adjusting scroll.
   *
   * @param delta - Number of rows to move (negative = up)
   * @param visibleRows - Number of rows visible in the viewport
   */
  protected moveCursor(delta: number, visibleRows: number): void {
    this.cursor = Math.max(0, Math.min(this.itemCount - 1, this.cursor + delta));
    // Adjust scroll offset to keep cursor visible
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + visibleRows) {
      this.scrollOffset = this.cursor - visibleRows + 1;
    }
  }

  abstract render(term: any, startRow: number, endRow: number, width: number): void;
  abstract destroy(): void;
}
