import { User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { vi } from "vitest";
import { FireStoreRepository } from "./firestore.service.js";

@suite
class FireStoreErrorsTest extends WebdaApplicationTest {
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
