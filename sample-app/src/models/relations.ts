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
  UuidModel,
  WebdaError
} from "@webda/core";

@Expose()
class Student extends UuidModel {
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

  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<this> {
    if (ctx.getCurrentUserId() === "test") {
      return this;
    }
    throw new WebdaError.Forbidden("Only test user can access");
  }
}

@Expose()
class Teacher extends UuidModel {
  uuid: string;
  courses: ModelsMapped<Course, "name">;
  name: string;
  senior: boolean;

  async canAct(ctx: OperationContext, action: string): Promise<this> {
    if (ctx.getCurrentUserId() === "test") {
      return this;
    }
    throw new WebdaError.Forbidden("Only test user can access");
  }
}

@Expose()
class Course extends UuidModel {
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

  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<this> {
    if (ctx.getCurrentUserId() === "test") {
      return this;
    }
    throw new WebdaError.Forbidden("Only test user can access");
  }
}
@Expose()
class Classroom extends UuidModel {
  uuid: string;
  name: string;
  courses: ModelsMapped<Course, "name">;
  hardwares: ModelRelated<Hardware, "classroom">;

  @Action()
  test(context: OperationContext<{ test: string; id: string }>) {}

  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<this> {
    if (ctx.getCurrentUserId() === "test") {
      return this;
    }
    throw new WebdaError.Forbidden("Only test user can access");
  }
}

@Expose({ root: true })
class Hardware extends UuidModel {
  classroom: ModelParent<Classroom>;
  name: string;
  brands: ModelRelated<Brand, "name">;

  @Action()
  static globalAction(context: OperationContext) {
    return;
  }

  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<this> {
    if (ctx.getCurrentUserId() === "test") {
      return this;
    }
    throw new WebdaError.Forbidden("Only test user can access");
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
