/**
 * This whole file play with relations definition
 */

import { ModelLink, ModelLinksArray, ModelLinksSimpleArray, ModelParent, ModelRelated, UuidModel } from "@webda/models";

import { CoreModel, OperationContext, Operation as Action } from "@webda/core";
/**
 * @WebdaIgnore
 */
class DefaultTestModel extends UuidModel {
  /** Only allow the "test" user to perform actions. */
  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    if (ctx.getCurrentUserId() !== "test") {
      return "Only test user can access";
    }
    return true;
  }
}

// @Expose()
/** Student with email-based UUID, linked to teachers and courses. */
class Student extends DefaultTestModel {
  email: string;
  firstName: string;
  lastName: string;
  order: number;
  friends: ModelLinksArray<Student, { email: string; firstName: string; lastName: string }>;
  teachers: ModelLinksSimpleArray<Teacher>;
  courses: ModelRelated<Course, Student, "students">;
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

/** Teacher with courses and student relations. */
class Teacher extends DefaultTestModel {
  uuid: string;
  courses: ModelRelated<Course, Teacher, "teacher">;
  students: ModelRelated<Student, Teacher, "teachers">;
  name: string;
  senior: boolean;
  /**
   * Test that graphql can handle any[]
   */
  anyArray: any[];
}

/** Course linking a teacher, students, and a classroom. */
class Course extends DefaultTestModel {
  uuid: string;
  name: string;
  classroom: ModelLink<Classroom>;
  teacher: ModelLink<Teacher>;
  students: ModelLinksArray<
    Student,
    {
      firstName: string;
      lastName?: string;
    }
  >;

  /** Allow all actions on courses. */
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

/** Physical classroom with courses and hardware inventory. */
class Classroom extends DefaultTestModel {
  uuid: string;
  name: string;
  courses: ModelRelated<Course, Classroom, "classroom">;
  hardwares: ModelRelated<Hardware, Classroom, "classroom">;

  /** Test action that writes an empty response after a short delay. */
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
/** Hardware item belonging to a classroom, with associated brands. */
class Hardware extends DefaultTestModel {
  classroom: ModelParent<Classroom>;
  name: string;
  brands: ModelRelated<Brand, Hardware>; //, "name">;

  /** Global static action that writes an empty response after a short delay. */
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

/** Computer screen hardware with model and serial number. */
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
