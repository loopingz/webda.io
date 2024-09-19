import { suite, test } from "@testdeck/mocha";
import { WorkerMessage, WorkerOutput } from "@webda/workout";
import * as assert from "assert";
import * as sinon from "sinon";
import { WebdaTerminal } from "./terminal";

@suite
class TerminalTest {
  @test
  webdaize() {
    const output = new WorkerOutput();
    const term = new WebdaTerminal(output, { webda: "1.1.0" });
    term.tty = false;
    assert.strictEqual(WebdaTerminal.webdaize("plop", false), "plop");
    assert.strictEqual(WebdaTerminal.webdaize("webda", false), "webda");
    term.tty = true;
    assert.strictEqual(WebdaTerminal.webdaize("webda", true), "web\u001b[33mda\u001b[39m");
    assert.strictEqual(term.displayString("webda").trim(), "web\u001b[33mda\u001b[39m");
    const spy = sinon.spy(WebdaTerminal, "webdaize");
    try {
      term.setTitle("myTitle");
      term.handleTitleMessage(new WorkerMessage("title.set", output, {}));
      assert.strictEqual(spy.callCount, 2);
    } finally {
      spy.restore();
    }
    term.setDefaultLogo();
    term.versions = {};
    term.setDefaultLogo();

    assert.strictEqual(term.getBar(10, false), "          ]");
    assert.strictEqual(term.getBar(10, true), "[\u001b[1m\u001b[33m⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶\u001b[39m\u001b[22m");
  }
}
