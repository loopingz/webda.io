import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { describeApp, renderAgentsMd } from "./agents.js";

@suite
class AgentsTest {
  @test
  describesTheApp() {
    assert.deepStrictEqual(describeApp({ store: "postgres", transports: ["rest", "graphql"] }), [
      "Store: PostgreSQL (`Webda/PostgresStore`), connection from `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`",
      "Transports: REST, GraphQL"
    ]);
  }

  @test
  replacesTheMarker() {
    const result = renderAgentsMd(
      "# App\n\n## This app\n\n<!-- WEBDA:APP -->\n\n## Next\n",
      ["Store: x"],
      ["Extra note."]
    );
    assert.strictEqual(result, "# App\n\n## This app\n\n- Store: x\n\nExtra note.\n\n## Next\n");
  }

  @test
  requiresTheMarker() {
    assert.throws(() => renderAgentsMd("# App\n", [], []), /WEBDA:APP/);
  }
}
