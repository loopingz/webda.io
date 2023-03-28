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
  friends: ModelLinksMap<Student, { email: string; firstName: string; lastName: string }>;
  teachers: ModelLinksSimpleArray<Teacher>;
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
  courses: ModelsMapped<Course, "name">;
  name: string;
  senior: boolean;
}

@Expose()
class Course extends DefaultTestModel {
  uuid: string;
  name: string;
  classroom: ModelLink<Classroom>;
  teacher: ModelLink<Teacher>;
  students: ModelLinksArray<
    Student,
    {
      email: string;
      firstName: string;
      lastName?: string;
    }
  >;
}
@Expose()
class Classroom extends DefaultTestModel {
  uuid: string;
  name: string;
  courses: ModelsMapped<Course, "name">;
  hardwares: ModelRelated<Hardware, "classroom">;

  @Action()
  test(context: OperationContext<{ test: string; id: string }>) {}
}

@Expose({ root: true })
class Hardware extends DefaultTestModel {
  classroom: ModelParent<Classroom>;
  name: string;
  brands: ModelRelated<Brand, "name">;

  @Action()
  static globalAction(context: OperationContext) {
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

export { Student, Teacher, Course, Classroom, Hardware };
