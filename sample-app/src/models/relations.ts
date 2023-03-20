/**
 * This whole file play with relations definition
 */

import {
  CoreModel,
  Expose,
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped
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

  test() {}
}

@Expose()
class Hardware extends CoreModel {
  classroom: ModelParent<Classroom>;
}

export class ComputerScreen extends Hardware {
  modelId: string;
  serialNumber: string;
}

export { Student, Teacher, Course, Classroom, Hardware };
