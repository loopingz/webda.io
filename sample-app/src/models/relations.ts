/**
 * This whole file play with relations definition
 */

import {
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped,
  UuidModel
} from "@webda/models";

import { CoreModel, OperationContext, Operation as Action } from "@webda/core";
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

// @Expose()
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

  /**
   * @Frontend
   */
  getUuid(): string {
    return this.email;
  }

  /**
   * @Frontend
   */
  static getUuidField(): string {
    // use email for uuid
    return "email";
  }
}

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

  /**
   * Use for graphql eventing system
   * @param _client
   * @param event
   * @returns
   */
  static getClientEvents(): (string | { name: string; global: boolean })[] {
    return [
      "test",
      {
        name: "test2",
        global: true
      },
      "test3",
      "test4"
    ];
  }

  /**
   * Use for graphql eventing system
   * @param _client
   * @param event
   * @returns
   */
  static authorizeClientEvent(event: string, _context: OperationContext<any, any>, _model?: CoreModel): boolean {
    return event !== "test3";
  }
}

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

// @Expose({ root: true })
class Hardware extends DefaultTestModel {
  classroom: ModelParent<Classroom>;
  name: string;
  brands: ModelRelated<Brand>; //, "name">;

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
  name: string;
}

export { Classroom, Course, Hardware, Student, Teacher };
