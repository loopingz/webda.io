/**
 * This whole file play with relations definition
 */

import {
  Action,
  Expose,
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped,
  OperationContext,
  UuidModel
} from "@webda/core";

/**
 * @WebdaIgnore
 */
class DefaultTestModel extends UuidModel {
  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    if (ctx.getCurrentUserId() !== "test") {
      return "Only test user can access";
    }
    return true;
  }
}

@Expose()
class Student extends DefaultTestModel {
  email: string;
  firstName: string;
  lastName: string;
  order: number;
  friends: ModelLinksArray<Student, { email: string; firstName: string; lastName: string }>;
  teachers: ModelLinksSimpleArray<Teacher>;
  courses: ModelsMapped<Course, "students", "name">;
  // For cov
  constraints: null;

  getUuid(): string {
    return this.email;
  }

  static getUuidField(): string {
    // use email for uuid
    return "email";
  }
}

@Expose()
class Teacher extends DefaultTestModel {
  uuid: string;
  courses: ModelsMapped<Course, "teacher", "name">;
  students: ModelsMapped<Student, "teachers", "firstName" | "lastName" | "email">;
  name: string;
  senior: boolean;
  /**
   * Test that graphql can handle any[]
   */
  anyArray: any[];
}

@Expose()
class Course extends DefaultTestModel {
  uuid: string;
  name: string;
  classroom: ModelLink<Classroom>;
  teacher: ModelLink<Teacher>;
  students: ModelLinksMap<
    Student,
    {
      firstName: string;
      lastName?: string;
    }
  >;

  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
@Expose()
class Classroom extends DefaultTestModel {
  uuid: string;
  name: string;
  courses: ModelsMapped<Course, "classroom", "name">;
  hardwares: ModelRelated<Hardware, "classroom">;

  @Action()
  async test(context: OperationContext<{ test: string; id: string }>) {
    // Testing action is waited for
    await new Promise<void>(resolve => {
      setTimeout(() => {
        context.write({});
        resolve();
      }, 50);
    });
  }
}

@Expose({ root: true })
class Hardware extends DefaultTestModel {
  classroom: ModelParent<Classroom>;
  name: string;
  brands: ModelRelated<Brand, "name">;

  @Action()
  static async globalAction(context: OperationContext) {
    // Testing action is waited for
    await new Promise<void>(resolve => {
      setTimeout(() => {
        context.write({});
        resolve();
      }, 50);
    });
    return;
  }
}

export class ComputerScreen extends Hardware {
  modelId: string;
  serialNumber: string;
}

/**
 * Model not exposed on purpose
 */
export class Brand extends UuidModel {
  "name": string;
}

export { Classroom, Course, Hardware, Student, Teacher };
