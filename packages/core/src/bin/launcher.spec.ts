import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventEmitter } from "node:events";
import { vi } from "vitest";

const state = vi.hoisted(() => ({
  child: undefined as any,
  spawnArgs: undefined as any[] | undefined,
  hasLocalCli: true
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: any[]) => {
    state.spawnArgs = args;
    return state.child;
  }
}));
vi.mock("node:module", async importOriginal => ({
  ...(await importOriginal<typeof import("node:module")>()),
  createRequire: () => ({ resolve: () => "/app/node_modules/@webda/core/lib/index.js" })
}));
vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    existsSync: (path: string) => (path.endsWith("/lib/bin/cli.js") ? state.hasLocalCli : fs.existsSync(path))
  };
});

@suite
class LauncherTest {
  handlers: Record<string, () => void>;
  exits: number[];

  /**
   * Run the launcher script against a fake child process, capturing process.on and process.exit
   * @returns the fake child
   */
  async launch(): Promise<EventEmitter & { kill: ReturnType<typeof vi.fn> }> {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    state.child = child;
    state.spawnArgs = undefined;
    this.handlers = {};
    this.exits = [];
    const on = vi.spyOn(process, "on").mockImplementation(((signal: string, handler: () => void) => {
      this.handlers[signal] = handler;
      return process;
    }) as any);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      this.exits.push(code);
    }) as any);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      await import("./launcher.js");
    } finally {
      on.mockRestore();
      error.mockRestore();
    }
    // Keep process.exit mocked for the child "exit" events
    child.on("exit", () => {});
    this.restoreExit = () => exit.mockRestore();
    return child;
  }

  restoreExit: () => void = () => {};

  afterEach() {
    this.restoreExit();
    state.hasLocalCli = true;
  }

  @test
  async delegatesToTheLocalCli() {
    await this.launch();
    assert.strictEqual(state.spawnArgs[0], process.execPath);
    assert.strictEqual(state.spawnArgs[1][0], "/app/node_modules/@webda/core/lib/bin/cli.js");
    assert.deepStrictEqual(state.spawnArgs[2].stdio, "inherit");
    assert.deepStrictEqual(this.exits, []);
  }

  @test
  async forwardsStopSignalsToTheChild() {
    const child = await this.launch();
    assert.deepStrictEqual(Object.keys(this.handlers).sort(), ["SIGHUP", "SIGINT", "SIGTERM"]);
    this.handlers.SIGTERM();
    this.handlers.SIGINT();
    this.handlers.SIGHUP();
    assert.deepStrictEqual(
      child.kill.mock.calls.map(c => c[0]),
      ["SIGTERM", "SIGINT", "SIGHUP"]
    );
  }

  @test
  async exitsWithTheChildCode() {
    const child = await this.launch();
    child.emit("exit", 3, null);
    // Killed by a signal: conventional 128 + signal number
    child.emit("exit", null, "SIGTERM");
    child.emit("exit", null, "SIGUNKNOWN");
    child.emit("exit", null, null);
    assert.deepStrictEqual(this.exits, [3, 143, 128, 0]);
  }

  @test
  async failsOutsideAWebdaProject() {
    state.hasLocalCli = false;
    await this.launch();
    assert.strictEqual(this.exits[0], 1);
  }
}
