import type { Panel } from "./panel.js";
import type { DebugClient } from "../client.js";

/**
 * Represents a node in the flattened JSON tree.
 */
interface JsonTreeNode {
  /** Property name (undefined for array items) */
  key?: string;
  /** Array index when parent is an array */
  index?: number;
  /** The actual value */
  value: any;
  /** Nesting level */
  depth: number;
  /** Whether this node is collapsed */
  collapsed: boolean;
  /** Is object or array with children */
  hasChildren: boolean;
  /** Dot-separated path for tracking collapse state */
  path: string;
  /** Number of child keys (for objects) or items (for arrays) */
  childCount: number;
  /** Whether the value is an array (vs object) */
  isArray: boolean;
}

/**
 * Config panel: displays the resolved application configuration
 * as an interactive, collapsible JSON tree with syntax highlighting.
 *
 * Navigate with Up/Down arrows, toggle collapse with Enter or Space.
 * Top-level keys start expanded; deeper levels start collapsed.
 */
export class ConfigPanel implements Panel {
  name = "Config";
  private nodes: JsonTreeNode[] = [];
  private collapsed: Set<string> = new Set();
  private cursor = 0;
  private scrollOffset = 0;
  private visibleRows = 0;

  /**
   * @param client - Debug API client
   */
  constructor(private client: DebugClient) {}

  /**
   * Fetch configuration and build the tree.
   */
  async refresh(): Promise<void> {
    try {
      const config = await this.client.getConfig();
      this.nodes = [];
      this.collapsed = new Set();
      this.buildTree(config, 0, "root");

      // Collapse everything deeper than level 1 by default
      for (const node of this.nodes) {
        if (node.hasChildren && node.depth >= 1) {
          this.collapsed.add(node.path);
          node.collapsed = true;
        }
      }

      this.cursor = Math.min(this.cursor, Math.max(0, this.getVisibleNodes().length - 1));
    } catch {
      this.nodes = [];
      this.collapsed = new Set();
    }
  }

  /**
   * Recursively build a flat list of tree nodes from a JSON value.
   *
   * @param obj - The value to process
   * @param depth - Current nesting depth
   * @param parentPath - Dot-separated path of the parent
   * @param key - Property name if this is an object property
   * @param index - Array index if this is an array element
   */
  private buildTree(obj: any, depth: number, parentPath: string, key?: string, index?: number): void {
    const pathSegment = key !== undefined ? key : index !== undefined ? String(index) : "root";
    const path = parentPath === "" ? pathSegment : `${parentPath}.${pathSegment}`;

    const isObject = obj !== null && typeof obj === "object" && !Array.isArray(obj);
    const isArray = Array.isArray(obj);
    const hasChildren = isObject || isArray;
    const childCount = hasChildren ? (isArray ? obj.length : Object.keys(obj).length) : 0;

    const node: JsonTreeNode = {
      key,
      index,
      value: obj,
      depth,
      collapsed: false,
      hasChildren,
      path,
      childCount,
      isArray
    };
    this.nodes.push(node);

    if (hasChildren) {
      if (isArray) {
        for (let i = 0; i < obj.length; i++) {
          this.buildTree(obj[i], depth + 1, path, undefined, i);
        }
      } else {
        const keys = Object.keys(obj);
        for (const k of keys) {
          this.buildTree(obj[k], depth + 1, path, k);
        }
      }
    }
  }

  /**
   * Compute the list of visible nodes by filtering out
   * children of collapsed nodes.
   *
   * @returns array of nodes that should be rendered
   */
  private getVisibleNodes(): JsonTreeNode[] {
    const visible: JsonTreeNode[] = [];
    let skipUntilDepth = -1;

    for (const node of this.nodes) {
      // If we are skipping children of a collapsed node
      if (skipUntilDepth >= 0 && node.depth > skipUntilDepth) {
        continue;
      }
      skipUntilDepth = -1;

      visible.push(node);

      // If this node is collapsed, skip its children
      if (node.hasChildren && this.collapsed.has(node.path)) {
        skipUntilDepth = node.depth;
      }
    }

    return visible;
  }

  /**
   * Handle keyboard input for navigation and toggling.
   *
   * @param key - key name from terminal-kit
   */
  onKey(key: string): void {
    const visible = this.getVisibleNodes();
    if (visible.length === 0) return;

    switch (key) {
      case "UP":
        if (this.cursor > 0) this.cursor--;
        break;
      case "DOWN":
        if (this.cursor < visible.length - 1) this.cursor++;
        break;
      case "PAGE_UP":
        this.cursor = Math.max(0, this.cursor - this.visibleRows);
        break;
      case "PAGE_DOWN":
        this.cursor = Math.min(visible.length - 1, this.cursor + this.visibleRows);
        break;
      case "HOME":
        this.cursor = 0;
        this.scrollOffset = 0;
        break;
      case "END":
        this.cursor = visible.length - 1;
        break;
      case "ENTER":
      case " ": {
        const node = visible[this.cursor];
        if (node?.hasChildren) {
          if (this.collapsed.has(node.path)) {
            this.collapsed.delete(node.path);
            node.collapsed = false;
          } else {
            this.collapsed.add(node.path);
            node.collapsed = true;
          }
        }
        break;
      }
    }

    // Adjust scroll to keep cursor visible
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + this.visibleRows) {
      this.scrollOffset = this.cursor - this.visibleRows + 1;
    }
  }

  /**
   * Render the JSON tree with syntax highlighting and collapse indicators.
   *
   * @param term - terminal-kit instance
   * @param startRow - first available row
   * @param endRow - last available row
   * @param width - terminal width in columns
   */
  render(term: any, startRow: number, endRow: number, width: number): void {
    this.visibleRows = endRow - startRow;

    if (this.nodes.length === 0) {
      term.moveTo(1, startRow);
      term.eraseLine();
      term("  No configuration loaded.");
      return;
    }

    const visible = this.getVisibleNodes();

    // Clamp cursor/scroll in case the tree changed
    if (this.cursor >= visible.length) {
      this.cursor = Math.max(0, visible.length - 1);
    }
    if (this.scrollOffset > this.cursor) {
      this.scrollOffset = this.cursor;
    }

    for (let i = 0; i < this.visibleRows; i++) {
      const idx = this.scrollOffset + i;
      const row = startRow + i;
      term.moveTo(1, row);
      term.eraseLine();

      if (idx >= visible.length) continue;

      const node = visible[idx];
      const isCurrent = idx === this.cursor;

      if (isCurrent) {
        term.bgGray();
      }

      this.renderNode(term, node, width, isCurrent);

      if (isCurrent) {
        // Fill rest of line with highlight background
        term.styleReset();
      }
    }
  }

  /**
   * Render a single tree node with indentation, collapse indicator,
   * key, and value with syntax-highlighted colors.
   *
   * @param term - terminal-kit instance
   * @param node - the tree node to render
   * @param width - terminal width
   * @param highlighted - whether this line is the cursor line
   */
  private renderNode(term: any, node: JsonTreeNode, width: number, highlighted: boolean): void {
    const indent = "  ".repeat(node.depth);
    term(indent);

    if (node.hasChildren) {
      // Collapse indicator
      const indicator = this.collapsed.has(node.path) ? "\u25B6 " : "\u25BC ";
      term.white(indicator);

      // Key or index label
      if (node.key !== undefined) {
        term.cyan(node.key);
        term(": ");
      } else if (node.index !== undefined) {
        term.dim(`[${node.index}]`);
        term(": ");
      }

      // Collapsed summary or opening bracket
      if (this.collapsed.has(node.path)) {
        if (node.isArray) {
          term.dim(`[...] (${node.childCount} items)`);
        } else {
          term.dim(`{...} (${node.childCount} keys)`);
        }
      } else {
        term.dim(node.isArray ? "[" : "{");
      }
    } else {
      // Leaf node: spaces in place of collapse indicator
      term("  ");

      // Key or index label
      if (node.key !== undefined) {
        term.cyan(node.key);
        term(": ");
      } else if (node.index !== undefined) {
        term.dim(`[${node.index}]`);
        term(": ");
      }

      // Value with type-appropriate color
      this.renderValue(term, node.value);
    }

    if (highlighted) {
      term.styleReset();
    }
  }

  /**
   * Render a leaf value with type-appropriate coloring.
   *
   * @param term - terminal-kit instance
   * @param value - the value to render
   */
  private renderValue(term: any, value: any): void {
    if (value === null) {
      term.red("null");
    } else if (value === undefined) {
      term.red("undefined");
    } else if (typeof value === "string") {
      term.green(`"${value}"`);
    } else if (typeof value === "number") {
      term.yellow(String(value));
    } else if (typeof value === "boolean") {
      term.magenta(String(value));
    } else {
      term(String(value));
    }
  }

  /**
   * Clean up panel resources.
   */
  destroy(): void {
    this.nodes = [];
    this.collapsed.clear();
  }
}
