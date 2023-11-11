/**
 * This test file tries to validate all aspect of the model driven
 *
 * It use the Contact model as a reference
 */

import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Binaries, Binary, BinaryService, MemoryBinaryFile } from "../services/binary";
import { ModelMapper } from "../stores/modelmapper";
import { WebdaTest } from "../test";
import { CoreModel, Emitters } from "./coremodel";
import { ModelLink, ModelsMapped } from "./relations";

interface UserInterface extends CoreModel {
  contacts: ModelsMapped<ContactInterface, "owner", "firstName" | "lastName" | "age">;
}

interface ContactInterface extends CoreModel {
  firstName: string;
  lastName: string;
  type: "PERSONAL" | "PROFESSIONAL";
  age: number;
  custom: string;
  optional: string;
  avatar: Binary;
  photos: Binaries;
  owner: ModelLink<CoreModel>;
}
@suite
export class ModelDrivenTest extends WebdaTest {
  after() {
    // Ensure we remove all listeners
    Object.values(this.webda.getModels()).forEach(m => Emitters.get(m)?.removeAllListeners());
  }

  @test
  async test() {
    // Init mapper
    let mapper = new ModelMapper(this.webda, "test", {}).resolve();
    await mapper.init();

    const Contact = this.webda.getModel<ContactInterface>("Contact");
    const User = this.webda.getModel<UserInterface>("User");

    // Create a User
    let user = await User.ref("user1").getOrCreate(<any>{ uuid: "user1" }, undefined, true);

    Contact.factory({ firstName: "test", lastName: "" });
    let contact = new Contact().load({ firstName: "test", lastName: "", age: 18 }, true);
    // Saving contact
    await contact.save();

    // Creation date need to exist
    assert.notStrictEqual(contact._creationDate, undefined);
    // Last update should match creation date
    assert.strictEqual(contact._creationDate, contact._lastUpdate);

    assert.strictEqual((await Contact.ref(contact.getUuid()).get()).firstName, contact.firstName);
    assert.strictEqual(contact.avatar.isEmpty(), true);
    assert.strictEqual(contact.toStoredJSON().avatar, undefined);
    await contact.avatar.upload(new MemoryBinaryFile(Buffer.from("fake")));
    assert.strictEqual(contact.avatar.isEmpty(), false);
    assert.strictEqual(contact.photos.length, 0);
    await contact.photos.upload(new MemoryBinaryFile("firstPhoto"));
    assert.strictEqual(contact.photos.length, 1);
    assert.strictEqual((await BinaryService.streamToBuffer(await contact.avatar.get())).toString(), "fake");
    assert.strictEqual((await BinaryService.streamToBuffer(await contact.photos[0].get())).toString(), "firstPhoto");
    assert.strictEqual(await contact.owner.get(), undefined);

    contact.owner.set("user1");
    assert.notStrictEqual(await contact.owner.get(), undefined);
    await contact.save();

    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);

    // Update
    contact.lastName = "updatedName";
    await contact.save();
    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);
    assert.strictEqual(user.contacts[0].lastName, "updatedName");
    assert.strictEqual(user.contacts[0].firstName, "test");
    assert.strictEqual(user.contacts[0].age, 18);

    // Patch
    await contact.incrementAttribute("age", 1);
    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);
    assert.strictEqual(user.contacts[0].age, 19);
    await contact.patch({ firstName: "Loopz" });
    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);
    assert.strictEqual(user.contacts[0].firstName, "Loopz");
    await contact.removeAttribute("firstName");
    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);
    assert.strictEqual(user.contacts[0].firstName, undefined);

    // Delete
    await contact.delete();
    await user.refresh();
    assert.strictEqual(user.contacts.length, 0);

    await new Contact().load({ firstName: "test", lastName: "", age: 18, owner: "user1" }, true).save();
    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);
  }

  @test
  async listeners() {
    // In test context, the CoreModel is loaded from different models
    const SubProject = this.webda.getModel("SubProject");
    const Project = this.webda.getModel<UserInterface>("Project");
    let evt = 0;
    Project.on("Store.Action", () => {
      evt++;
    });
    SubProject.emit("Store.Action", {
      action: "test",
      store: null,
      context: null
    });
    Project.emit("Store.Action", <any>{});
    await this.nextTick(2);
    assert.strictEqual(evt, 2);
    // cov for now
    Project.onAsync("Store.Action", () => {
      evt++;
    });
  }
}
