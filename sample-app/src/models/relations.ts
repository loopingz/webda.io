/**
 * This whole file play with relations definition
 */

import {
  Action,
  CoreModel,
  Expose,
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped,
  OperationContext
} from "@webda/core";

@Expose()
class Student extends CoreModel {
  email: string;
  firstName: string;
  lastName: string;
  friends: ModelLinksMap<Student, { email: string; firstName: string; lastName: string }>;
  teachers: ModelLinksSimpleArray<Teacher>;

  getUuid(): string {
    return this.email;
  }
}

@Expose()
class Teacher extends CoreModel {
  courses: ModelsMapped<Course, "name">;
  name: string;
}

@Expose()
class Course extends CoreModel {
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
class Classroom extends CoreModel {
  uuid: string;
  name: string;
  courses: ModelsMapped<Course, "name">;
  hardwares: ModelRelated<Hardware, "classroom">;

  @Action()
  test(context: OperationContext<{ test: string; id: string }>) {}
}

@Expose()
class Hardware extends CoreModel {
  classroom: ModelParent<Classroom>;

  @Action()
  static globalAction(context: OperationContext) {
    return;
  }

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<this> {
    return this;
  }
}

export class ComputerScreen extends Hardware {
  modelId: string;
  serialNumber: string;
}

export { Student, Teacher, Course, Classroom, Hardware };
