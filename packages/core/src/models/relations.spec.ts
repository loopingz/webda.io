/**
 * This test file tries to validate all aspect of the model driven
 *
 * It use the Contact model as a reference
 */

import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Binaries, Binary, BinaryService, MemoryBinaryFile } from "../services/binary";
import { ModelMapper } from "../stores/modelmapper";
import { WebdaApplicationTest } from "../test/test";
import { CoreModel, Emitters } from "./coremodel";
import {
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRef,
  ModelRelated,
  ModelsMapped
} from "./relations";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { CoreModelEvents } from "./imodel";
import { useApplication, useModel } from "../application/hook";

interface StudentInterface extends CoreModel {
  email: string;
  firstName: string;
  lastName: string;
  friends: ModelLinksArray<StudentInterface, { email: string; firstName: string; lastName: string }>;
  teachers: ModelLinksSimpleArray<TeacherInterface>;
  courses: ModelsMapped<CourseInterface, "students", "name">;
}

interface TeacherInterface extends CoreModel {
  uuid: string;
  courses: ModelsMapped<CourseInterface, "teacher", "name">;
  students: ModelsMapped<StudentInterface, "teachers", "firstName" | "lastName" | "email">;
  name: string;
  senior: boolean;
  ref: (uuid: string) => ModelRef<this>;
}

interface CourseInterface extends CoreModel {
  uuid: string;
  name: string;
  classroom: ModelLink<ClassroomInterface>;
  teacher: ModelLink<TeacherInterface>;
  students: ModelLinksMap<
    StudentInterface,
    {
      email: string;
      firstName: string;
      lastName?: string;
    }
  >;
  ref: (uuid: string) => ModelRef<this>;
}

interface ClassroomInterface extends CoreModel {
  uuid: string;
  name: string;
  courses: ModelsMapped<CourseInterface, "classroom", "name">;
  hardwares: ModelRelated<HardwareInterface, "classroom">;
}

interface HardwareInterface extends CoreModel {
  classroom: ModelParent<ClassroomInterface>;
  name: string;
}

type ProjectEvents = CoreModelEvents & { Test: any };
interface UserInterface extends CoreModel {
  Events: ProjectEvents;
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
  ref: (uuid: string) => ModelRef<this>;
}
@suite
export class ModelDrivenTest extends WebdaApplicationTest {
  async afterEach() {
    super.afterEach();
    // Ensure we remove all listeners
    Object.values(useApplication()!.getModels()).forEach(m => Emitters.get(m)?.removeAllListeners());
  }

  getTestConfiguration() {
    return dirname(fileURLToPath(import.meta.url)) + "/../../../../sample-app/";
  }

  @test
  async test() {
    // Init mapper
    const mapper = new ModelMapper("test", {}).resolve();
    await mapper.init();

    const Contact = useModel<ContactInterface>("Contact");
    const User = useModel<UserInterface>("User");

    // Create a User
    const user = await User.ref("user1").getOrCreate(<any>{ uuid: "user1" }, true);
    const user2 = await User.ref("user2").getOrCreate(<any>{ uuid: "user2" }, true);

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
    //assert.strictEqual(contact.toStoredJSON().avatar, undefined);
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

    contact = await new Contact().load({ firstName: "test", lastName: "", age: 18, owner: "user1" }, true).save();
    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);

    await contact.patch({ age: 21 });

    await user.refresh();
    assert.strictEqual(user.contacts.length, 1);
    assert.strictEqual(user.contacts[0].age, 21);
    contact.owner.set("user2");
    contact.age = 22;
    await contact.save();
    await user.refresh();
    assert.strictEqual(user.contacts.length, 0);
    await user2.refresh();
    assert.strictEqual(user2.contacts.length, 1);
    assert.strictEqual(user2.contacts[0].age, 22);

    await contact.patch({ optional: "plop" });
  }

  @test
  async classrooms() {
    // Init mapper
    const mapper = new ModelMapper(this.webda, "test", {}).resolve();
    await mapper.init();

    const Course = useModel<CourseInterface>("Course");
    const Student = useModel<StudentInterface>("Student");
    const Teacher = useModel<TeacherInterface>("Teacher");
    const Classroom = useModel<ClassroomInterface>("Classroom");

    const t1 = await Teacher.ref("teacher1").create({ name: "teacher1", senior: true });
    const t2 = await Teacher.ref("teacher2").create({ name: "teacher2", senior: false });

    const class1 = await Classroom.ref("classroom1").create({ name: "classroom1" });

    const s1 = await Student.ref("s1@school.com").create({
      firstName: "first1",
      lastName: "last1",
      email: "s1@school.com",
      teachers: ["teacher1", "teacher2"]
    });
    const s2 = await Student.ref("s2@school.com").create({
      firstName: "first2",
      lastName: "last2",
      email: "s2@school.com",
      teachers: ["teacher1"],
      friends: [
        {
          // @ts-ignore
          firstName: "student1",
          lastName: "student1",
          uuid: "s1@school.com"
        }
      ]
    });

    const course1 = await Course.ref("course1").create({
      name: "course1",
      teacher: "teacher1",
      classroom: "classroom1",
      students: {
        "s2@school.com": {
          uuid: "s2@school.com",
          firstName: "first2"
        }
      }
    });

    await t1.refresh();
    await t2.refresh();
    await s1.refresh();
    await s2.refresh();
    await class1.refresh();

    assert.strictEqual(t1.students.length, 2);
    assert.strictEqual(t1.courses.length, 1);

    assert.strictEqual(t2.students.length, 1);
    assert.strictEqual(t2.courses.length, 0);

    assert.strictEqual(s2.courses.length, 1);
    assert.strictEqual(s1.courses.length, 0);

    assert.strictEqual(class1.courses.length, 1);

    course1.teacher.set("teacher2");
    await course1.save();

    await t1.refresh();
    await t2.refresh();
    assert.strictEqual(t1.courses.length, 0);
    assert.strictEqual(t2.courses.length, 1);

    course1.students.add({
      email: s1.email,
      uuid: s1.getUuid(),
      firstName: s1.firstName
    });
    await course1.save();

    await s1.refresh();
    await s2.refresh();
    assert.strictEqual(s2.courses.length, 1);
    assert.strictEqual(s1.courses.length, 1);

    course1.students.remove(s2);
    await course1.save();
    await s1.refresh();
    await s2.refresh();
    assert.strictEqual(s2.courses.length, 0);
    assert.strictEqual(s1.courses.length, 1);

    await s1.teachers.remove(t1);
    await s1.save();

    await t1.refresh();
    await t2.refresh();

    assert.strictEqual(t1.students.length, 1);
    assert.strictEqual(t2.students.length, 1);
  }

  @test
  async listeners() {
    // In test context, the CoreModel is loaded from different models
    const SubProject = this.webda.getModel<UserInterface>("SubProject");
    const Project = this.webda.getModel<UserInterface>("Project");
    let evt = 0;
    Project.on("Test", () => {
      evt++;
    });
    SubProject.emit("Test", {
      action: "test",
      store: null,
      context: null
    });
    Project.emit("Test", <any>{});
    await this.nextTick(2);
    assert.strictEqual(evt, 2);
  }
}
