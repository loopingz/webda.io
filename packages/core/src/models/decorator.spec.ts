import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Encrypted, Masked, applyMask, getMaskedFields } from "./decorator.js";
import { maskArguments } from "../core/operations.js";

/** Class carrying masked fields */
class Card {
  @Masked("XXXX-XXXX-XXXX-____")
  number: string = "";

  @Masked
  pin: string = "";

  label: string = "";
}

/** Subclass adding a masked field: the parent keeps its own list */
class GiftCard extends Card {
  @Masked("XX__")
  code: string = "";
}

@suite
class MaskedDecoratorTest {
  @test
  keepsTheValueOnTheInstance() {
    const card = new Card();
    card.number = "1234-5678-9012-3456";
    card.pin = "0000";
    // The model still needs the clear value: @Masked only changes what is shown
    assert.strictEqual(card.number, "1234-5678-9012-3456");
    assert.strictEqual(card.pin, "0000");
    assert.deepStrictEqual(Object.keys(card), ["number", "pin", "label"]);
  }

  @test
  recordsFields() {
    assert.deepStrictEqual(getMaskedFields(new Card()), { number: "XXXX-XXXX-XXXX-____", pin: undefined });
    assert.deepStrictEqual(getMaskedFields(new GiftCard()), {
      number: "XXXX-XXXX-XXXX-____",
      pin: undefined,
      code: "XX__"
    });
    assert.deepStrictEqual(getMaskedFields({}), {});
    assert.deepStrictEqual(getMaskedFields(Object.create(null)), {});
  }

  @test
  applyMaskPattern() {
    assert.strictEqual(applyMask("1234-5678-9012-3456", "XXXX-XXXX-XXXX-____"), "XXXX-XXXX-XXXX-3456");
    // The output always has the mask length: the value length is not disclosed
    assert.strictEqual(applyMask("12", "XX__"), "XX??");
    assert.strictEqual(applyMask("123456", "XX__"), "XX34");
    // Without a pattern, or for a value that is not a string, the whole value is hidden
    assert.strictEqual(applyMask("secret", undefined), "********");
    assert.strictEqual(applyMask(1234, "XX__"), "********");
    assert.strictEqual(applyMask(undefined, "XX__"), undefined);
    assert.strictEqual(applyMask(null, undefined), null);
  }

  @test
  maskArgumentsHonoursMasked() {
    const card = new GiftCard();
    card.number = "1234-5678-9012-3456";
    card.pin = "0000";
    card.code = "ABCD";
    card.label = "visible";
    assert.deepStrictEqual(maskArguments([card, { card }]), [
      { number: "XXXX-XXXX-XXXX-3456", pin: "********", label: "visible", code: "XXCD" },
      { card: { number: "XXXX-XXXX-XXXX-3456", pin: "********", label: "visible", code: "XXCD" } }
    ]);
    // The instance is not modified
    assert.strictEqual(card.number, "1234-5678-9012-3456");
  }
}

@suite
class EncryptedDecoratorTest {
  @test
  refusesAtDefinition() {
    assert.throws(() => {
      class Secret {
        @Encrypted
        value: string = "";
      }
      return Secret;
    }, /@Encrypted does not encrypt.*EncryptedField/);
    assert.throws(() => {
      class Secret {
        // @ts-ignore factory form
        @Encrypted()
        value: string = "";
      }
      return Secret;
    }, /@Encrypted does not encrypt/);
  }
}
