import { suite, test } from "@testdeck/mocha";
import { WebdaTerminal } from "./terminal";
import * as assert from "assert";
import { WorkerMessage, WorkerOutput } from "@webda/workout";
import * as sinon from "sinon";

@suite
class TerminalTest {
  @test
  webdaize() {
    let output = new WorkerOutput();
    let term = new WebdaTerminal(output, { webda: "1.1.0" });
    term.tty = false;
    assert.strictEqual(term.webdaize("plop"), "plop");
    assert.strictEqual(term.webdaize("webda"), "webda");
    term.tty = true;
    assert.strictEqual(term.webdaize("webda"), "web\u001b[33mda\u001b[39m");
    assert.strictEqual(term.displayString("webda").trim(), "web\u001b[33mda\u001b[39m");
    let spy = sinon.spy(term, "webdaize");
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
