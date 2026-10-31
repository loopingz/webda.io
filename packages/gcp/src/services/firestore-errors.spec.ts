import { User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { vi } from "vitest";
import { FireStoreRepository } from "./firestore.service.js";

@suite
class FireStoreErrorsTest extends WebdaApplicationTest {
  @test
  async rejectsPrototypeCollectionIndexes() {
    const transaction = vi.fn();
    const repository = new FireStoreRepository(User, ["uuid"], { runTransaction: transaction } as any, "unit");
    const ref = vi.spyOn(repository as any, "getDocumentRef").mockReturnValue({ id: "unit" });
    try {
      for (const index of ["__proto__", "constructor", -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(
          () => repository.upsertItemToCollection("unit", "items", {}, index as any),
          /non-negative safe integer/
        );
      }
      assert.strictEqual(transaction.mock.calls.length, 0);
      const update = vi.fn();
      const data: any = {};
      transaction.mockImplementation(async callback =>
        callback({
          get: async () => ({ exists: true, data: () => data }),
          update
        })
      );
      await repository.upsertItemToCollection("unit", "__proto__", "safe", 0);
      const fields = update.mock.calls[0][1];
      assert.ok(Object.hasOwn(fields, "__proto__"));
      assert.deepStrictEqual(fields.__proto__, ["safe"]);
      assert.strictEqual(Object.getPrototypeOf(fields), Object.prototype);
      data.items = [{ name: "old" }];
      await repository.upsertItemToCollection("unit", "items", { name: "new" }, 0, "name", "old");
      assert.deepStrictEqual(update.mock.calls.at(-1)![1].items, [{ name: "new" }]);
      data.items = {};
      await assert.rejects(() => repository.upsertItemToCollection("unit", "items", "value", 0), /must be an array/);
    } finally {
      ref.mockRestore();
    }
  }

  @test
  async preservesUnexpectedCreateFailuresAndTranslatesDuplicates() {
    const repository = new FireStoreRepository(User, ["uuid"], {} as any, "unit");
    const ref = vi.spyOn(repository as any, "getDocumentRef");
    try {
      for (const error of [null, "failure", new Error("failure"), { code: 13 }]) {
        ref.mockReturnValue({
          create: async () => {
            throw error;
          }
        });
        await assert.rejects(
          () => repository.create({ uuid: "unit" }),
          thrown => thrown === error
        );
      }
      ref.mockReturnValue({
        create: async () => {
          throw { code: 6 };
        }
      });
      await assert.rejects(() => repository.create({ uuid: "unit" }), /Already exists: unit/);
    } finally {
      ref.mockRestore();
    }
  }
}
