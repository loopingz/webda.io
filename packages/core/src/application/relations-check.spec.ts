import { Store } from "../stores/store.js";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { checkRelations, clearLoggedDiagnostics, logDiagnostic, type RelationDiagnostic } from "./relations-check.js";
import { TestApplication } from "../test/objects.js";
import { Core } from "../core/core.js";
import { User } from "../models/user.model.js";
import { Ident } from "../models/ident.model.js";
import { ModelLink } from "@webda/models";

@suite
class RelationsCheckPureTest {
  beforeEach() {
    clearLoggedDiagnostics();
  }

  @test
  supportsParentsInheritedLinksAndUnresolvedMetadata() {
    for (const ancestor of [false, true]) {
      for (const kind of ["parent", "links"]) {
        for (const target of ["A", undefined, { Identifier: "A" }]) {
          const relation =
            kind === "parent"
              ? { parent: { attribute: "owner", model: target } }
              : { links: [{ attribute: "owner", model: target }] };
          const models: any = {
            A: { Relations: { queries: [{ attribute: "items", model: "B", targetAttribute: "owner" }] } },
            B: {
              Ancestors: ancestor ? ["Missing", { Metadata: { Identifier: "Base" } }, undefined] : [],
              Relations: ancestor ? {} : relation
            },
            Base: { Relations: relation },
            Empty: undefined
          };
          assert.deepStrictEqual(checkRelations(models), []);
        }
      }
    }
    assert.deepStrictEqual(
      checkRelations({
        A: {
          Ancestors: {},
          Relations: { queries: [{ attribute: "items", model: "Missing", targetAttribute: "owner" }] }
        }
      }),
      []
    );
  }

  @test
  inheritsQueriesAndMapsWhileHonoringSubclassOverrides() {
    const models: any = {
      Base: {
        Relations: {
          queries: [{ attribute: "items", model: "Missing", targetAttribute: "old" }, { model: "B" }],
          maps: [{ attribute: "mapped", model: { Identifier: "B" }, targetLink: "owner" }, { model: "B" }]
        }
      },
      A: {
        Identifier: "A",
        Ancestors: ["Base", "Unknown"],
        Relations: {
          queries: [
            { attribute: "items", model: { Metadata: { Identifier: "B" } }, targetAttribute: "owner" },
            { model: "B" }
          ],
          maps: [{ attribute: "localMap", model: "B", targetLink: "owner" }, { model: "B" }]
        }
      },
      B: { Relations: { parent: { attribute: "owner", model: "A" } } }
    };
    assert.deepStrictEqual(
      checkRelations(models).map(d => [d.sourceModel, d.sourceAttribute, d.code]),
      [["Base", "mapped", "R3"]]
    );
  }

  @test
  validatesInheritedTargetsInStaticAndStoreModes() {
    const models = {
      A: {
        Identifier: "A",
        Ancestors: ["Base"],
        Relations: { queries: [{ attribute: "items", model: "B", targetAttribute: "owner" }] }
      },
      Base: { Identifier: "Base" },
      B: { Relations: { links: [{ attribute: "owner", model: "Base" }] } }
    };
    assert.deepStrictEqual(checkRelations(models), []);
    const differentStores = checkRelations(models, { isFinalModel: () => false, getStore: id => id });
    assert.strictEqual(differentStores[0].code, "R5");
    assert.deepStrictEqual(checkRelations(models, { isFinalModel: () => false, getStore: () => "shared" }), []);
    assert.deepStrictEqual(checkRelations(models, { deferStoreCheck: true }), []);
    assert.deepStrictEqual(checkRelations(models, { isFinalModel: () => false, staticOnly: true }), []);
    assert.deepStrictEqual(
      checkRelations(models, { staticOnly: true }).map(d => [d.code, d.level]),
      [["R4", "WARN"]]
    );
    for (const store of [undefined, "shared", { getName: () => "shared" }]) {
      const diagnostics = checkRelations(models, { getStore: () => store });
      assert.strictEqual(diagnostics[0].code, "R4");
      assert.ok(diagnostics[0].message.includes(store ? "shared" : "Registry"));
    }
  }

  @test
  reportsMissingInheritedBackReferencesAndUntargetedDiagnostics() {
    const models = {
      A: { Relations: { queries: [{ attribute: "items", model: "B", targetAttribute: "owner" }] } },
      B: { Ancestors: ["Empty", "Other"], Relations: {} },
      Empty: {},
      Other: { Relations: { links: [{ attribute: "different", model: "A" }] } }
    };
    assert.strictEqual(checkRelations(models)[0].code, "R2");
    logDiagnostic({
      code: "R1",
      level: "DEBUG",
      message: "untargeted",
      sourceModel: "A",
      sourceAttribute: "items",
      targetModel: "B"
    });
  }

  @test
  modelRelatedWithoutTargetAttributeLogsDebugR1() {
    const models = {
      "App/Hardware": {
        Identifier: "App/Hardware",
        Ancestors: [],
        Relations: {
          queries: [
            {
              attribute: "brands",
              model: "App/Brand"
              // targetAttribute is omitted / undefined
            }
          ]
        }
      },
      "App/Brand": {
        Identifier: "App/Brand",
        Ancestors: [],
        Relations: {}
      }
    };

    const diagnostics = checkRelations(models);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, "R1");
    assert.strictEqual(diagnostics[0].level, "DEBUG");
    assert.ok(diagnostics[0].message.includes("Cannot verify reverse relation"));
  }

  @test
  modelRelatedTargetingMissingAttributeLogsWarnR2() {
    const models = {
      "App/Company": {
        Identifier: "App/Company",
        Ancestors: [],
        Relations: {
          queries: [
            {
              attribute: "users",
              model: "App/User",
              targetAttribute: "nonexistentCompany"
            }
          ]
        }
      },
      "App/User": {
        Identifier: "App/User",
        Ancestors: [],
        Relations: {
          links: [{ attribute: "company", model: "App/Company", type: "LINK" }]
        }
      }
    };

    const diagnostics = checkRelations(models);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, "R2");
    assert.strictEqual(diagnostics[0].level, "WARN");
    assert.ok(diagnostics[0].message.includes('no link or parent named "nonexistentCompany"'));
  }

  @test
  modelRelatedTargetingUnrelatedModelLogsWarnR3() {
    const models = {
      "App/Company": {
        Identifier: "App/Company",
        Ancestors: [],
        Relations: {
          queries: [
            {
              attribute: "users",
              model: "App/User",
              targetAttribute: "company"
            }
          ]
        }
      },
      "App/User": {
        Identifier: "App/User",
        Ancestors: [],
        Relations: {
          links: [{ attribute: "company", model: "App/OtherCompany", type: "LINK" }]
        }
      },
      "App/OtherCompany": {
        Identifier: "App/OtherCompany",
        Ancestors: [],
        Relations: {}
      }
    };

    const diagnostics = checkRelations(models);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, "R3");
    assert.strictEqual(diagnostics[0].level, "WARN");
    assert.ok(diagnostics[0].message.includes("references unrelated model App/OtherCompany instead of App/Company"));
  }

  @test
  symmetricCustomUserAndIdentProducesNoDiagnostics() {
    const models = {
      "App/User": {
        Identifier: "App/User",
        Ancestors: ["Webda/User"],
        Relations: {
          queries: [
            {
              attribute: "_idents",
              model: "App/Ident",
              targetAttribute: "_user"
            }
          ]
        }
      },
      "App/Ident": {
        Identifier: "App/Ident",
        Ancestors: ["Webda/Ident"],
        Relations: {
          links: [
            {
              attribute: "_user",
              model: "App/User",
              type: "LINK"
            }
          ]
        }
      },
      "Webda/User": {
        Identifier: "Webda/User",
        Ancestors: [],
        Relations: {}
      },
      "Webda/Ident": {
        Identifier: "Webda/Ident",
        Ancestors: [],
        Relations: {
          links: [{ attribute: "_user", model: "Webda/User", type: "LINK" }]
        }
      }
    };

    const diagnostics = checkRelations(models, {
      isFinalModel: id => id === "App/User" || id === "App/Ident"
    });
    // Completely symmetric: App/User._idents -> App/Ident._user -> App/User
    assert.strictEqual(diagnostics.filter(d => d.level === "WARN").length, 0);
  }

  @test
  customUserWithIdentLinkingToAncestorSameStoreProducesInfoR4() {
    const models = {
      "App/User": {
        Identifier: "App/User",
        Ancestors: ["Webda/User"],
        Relations: {
          queries: [
            {
              attribute: "_idents",
              model: "Webda/Ident",
              targetAttribute: "_user"
            }
          ]
        }
      },
      "Webda/User": {
        Identifier: "Webda/User",
        Ancestors: [],
        Relations: {}
      },
      "Webda/Ident": {
        Identifier: "Webda/Ident",
        Ancestors: [],
        Relations: {
          links: [{ attribute: "_user", model: "Webda/User", type: "LINK" }]
        }
      }
    };

    const sharedStore = { getName: () => "UsersStore" };
    const diagnostics = checkRelations(models, {
      isFinalModel: id => id === "App/User",
      getStore: () => sharedStore
    });

    const warns = diagnostics.filter(d => d.level === "WARN");
    const infos = diagnostics.filter(d => d.level === "INFO");
    assert.strictEqual(warns.length, 0);
    assert.strictEqual(infos.length, 1);
    assert.strictEqual(infos[0].code, "R4");
    assert.ok(infos[0].message.includes("same store: UsersStore"));
  }

  @test
  customUserWithIdentLinkingToAncestorDifferentStoresProducesWarnR5() {
    const models = {
      "App/User": {
        Identifier: "App/User",
        Ancestors: ["Webda/User"],
        Relations: {
          queries: [
            {
              attribute: "_idents",
              model: "Webda/Ident",
              targetAttribute: "_user"
            }
          ]
        }
      },
      "Webda/User": {
        Identifier: "Webda/User",
        Ancestors: [],
        Relations: {}
      },
      "Webda/Ident": {
        Identifier: "Webda/Ident",
        Ancestors: [],
        Relations: {
          links: [{ attribute: "_user", model: "Webda/User", type: "LINK" }]
        }
      }
    };

    const usersStore = { getName: () => "Users" };
    const registryStore = { getName: () => "Registry" };

    const diagnostics = checkRelations(models, {
      isFinalModel: id => id === "App/User",
      getStore: id => (id === "App/User" ? usersStore : registryStore)
    });

    const r5 = diagnostics.find(d => d.code === "R5");
    assert.ok(r5);
    assert.strictEqual(r5.level, "WARN");
    assert.ok(
      r5.message.includes(
        "App/User._idents expects Webda/Ident._user to reference App/User, but it references Webda/User (stores: Users vs Registry)."
      )
    );
    assert.ok(
      r5.message.includes(
        'Override `_user: ModelLink<App/User>` in Webda/Ident or add "Webda/User" to the Users store models.'
      )
    );
  }

  @test
  modelsMappedFollowsSameRules() {
    const models = {
      "App/User": {
        Identifier: "App/User",
        Ancestors: [],
        Relations: {
          maps: [
            {
              attribute: "profile",
              model: "App/Profile",
              targetLink: "missingUser",
              targetAttributes: ["name"]
            }
          ]
        }
      },
      "App/Profile": {
        Identifier: "App/Profile",
        Ancestors: [],
        Relations: {
          links: [{ attribute: "user", model: "App/User", type: "LINK" }]
        }
      }
    };

    const diagnostics = checkRelations(models);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, "R2");
    assert.strictEqual(diagnostics[0].level, "WARN");
  }

  @test
  logDiagnosticDeduplicationLogsOncePerKey() {
    const logger = new MemoryLogger(useWorkerOutput());
    try {
      const diag: RelationDiagnostic = {
        level: "WARN",
        code: "R2",
        message: "Duplicate test warning",
        sourceModel: "A",
        sourceAttribute: "b",
        targetModel: "C",
        targetAttribute: "d"
      };

      logDiagnostic(diag);
      logDiagnostic(diag);
      logDiagnostic(diag);

      const logs = logger
        .getLogs()
        .map(l => (l.log?.args ?? []).join(" "))
        .filter(msg => msg.includes("Duplicate test warning"));
      assert.strictEqual(logs.length, 1);
    } finally {
      logger.close();
    }
  }
}

export class CustomUser extends User {
  customField: string = "custom";
}

export class CustomIdentWithOverride extends Ident {
  declare _user: ModelLink<CustomUser>;
}

import { runWithInstanceStorage } from "../core/instancestorage.js";
import { setApplication } from "./hooks.js";

@suite
class StoreRoutingIntegrationTest {
  beforeEach() {
    clearLoggedDiagnostics();
  }

  @test
  async symmetricCustomUserIdentLogsNoWarnInStoreCompute() {
    return runWithInstanceStorage({}, async () => {
      const logger = new MemoryLogger(useWorkerOutput());
      let core: Core | undefined;
      try {
        const app = new TestApplication({
          version: 4,
          services: {
            Users: {
              type: "Webda/MemoryStore",
              models: ["WebdaDemo/CustomUser", "WebdaDemo/CustomIdentWithOverride"]
            }
          }
        });
        setApplication(app);
        await app.load();

        (app as any).models["WebdaDemo/CustomUser"] = CustomUser;
        CustomUser.Metadata = {
          Identifier: "WebdaDemo/CustomUser",
          PrimaryKey: ["uuid"],
          Ancestors: [User],
          Subclasses: [],
          Relations: {
            queries: [
              {
                attribute: "_idents",
                model: "WebdaDemo/CustomIdentWithOverride",
                targetAttribute: "_user"
              }
            ]
          }
        } as any;

        (app as any).models["WebdaDemo/CustomIdentWithOverride"] = CustomIdentWithOverride;
        CustomIdentWithOverride.Metadata = {
          Identifier: "WebdaDemo/CustomIdentWithOverride",
          PrimaryKey: ["uuid"],
          Ancestors: [Ident],
          Subclasses: [],
          Relations: {
            links: [
              {
                attribute: "_user",
                model: "WebdaDemo/CustomUser",
                type: "LINK"
              }
            ]
          }
        } as any;

        core = new Core(app);
        await core.init();

        const warnLogs = logger
          .getLogs()
          .map(l => (l.log?.args ?? []).join(" "))
          .filter(msg => msg.includes("expects"));
        assert.strictEqual(warnLogs.length, 0);
      } finally {
        logger.close();
        await core?.stop();
      }
    });
  }

  @test
  async customUserOnlyInStoreLogsSingleR5Warn() {
    return runWithInstanceStorage({}, async () => {
      const logger = new MemoryLogger(useWorkerOutput());
      let core: Core | undefined;
      try {
        const app = new TestApplication({
          version: 4,
          services: {
            Users: {
              type: "Webda/MemoryStore",
              models: ["WebdaDemo/CustomUser"]
            }
          }
        });
        setApplication(app);
        await app.load();

        (app as any).models["WebdaDemo/CustomUser"] = CustomUser;
        CustomUser.Metadata = {
          Identifier: "WebdaDemo/CustomUser",
          PrimaryKey: ["uuid"],
          Ancestors: [User],
          Subclasses: [],
          Relations: {
            queries: [
              {
                attribute: "_idents",
                model: "Webda/Ident",
                targetAttribute: "_user"
              }
            ]
          }
        } as any;

        core = new Core(app);
        await core.init();

        const r5Logs = logger
          .getLogs()
          .map(l => (l.log?.args ?? []).join(" "))
          .filter(msg =>
            msg.includes("WebdaDemo/CustomUser._idents expects Webda/Ident._user to reference WebdaDemo/CustomUser")
          );
        assert.strictEqual(r5Logs.length, 1);
        assert.ok(r5Logs[0].includes("stores: Users vs Registry"));
        assert.ok(
          r5Logs[0].includes(
            'Override `_user: ModelLink<WebdaDemo/CustomUser>` in Webda/Ident or add "Webda/User" to the Users store models.'
          )
        );
        // Legacy metadata can refer to an ancestor by an alias absent from the
        // final model dictionary. Resolve it through the application's model lookup.
        const originalGetModel = app.getModel.bind(app);
        const ident = app.getModels()["Webda/Ident"] as any;
        const originalMetadata = ident.Metadata;
        try {
          CustomUser.Metadata.Ancestors = ["Alias/Ancestor"] as any;
          ident.Metadata = {
            ...originalMetadata,
            Relations: { links: [{ attribute: "_user", model: "Alias/Ancestor" }] }
          };
          for (const resolved of [
            User,
            { Metadata: { Identifier: "Detached" }, getRepository: () => ({ _store: {} }) },
            { Metadata: { Identifier: "Detached" }, getRepository: () => undefined },
            { Metadata: { Identifier: "Detached" } },
            undefined
          ]) {
            (app as any).getModel = (id: string) => {
              if (id !== "Alias/Ancestor") return originalGetModel(id);
              if (!resolved) throw new Error("Missing ancestor");
              return resolved;
            };
            clearLoggedDiagnostics();
            Store.computeStores();
          }
        } finally {
          (app as any).getModel = originalGetModel;
          ident.Metadata = originalMetadata;
        }
      } finally {
        logger.close();
        await core?.stop();
      }
    });
  }
}
