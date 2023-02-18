/**
 * This whole file play with relations definition
 */

import {
  CoreModel,
  ModelLink,
  ModelLinksArray,
  ModelLinksMap,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  ModelsMapped
} from "@webda/core";

class Student extends CoreModel {
  email: string;
  firstName: string;
  lastName: string;
  friends: ModelLinksMap<Student, "email" | "firstName" | "lastName">;
  teachers: ModelLinksSimpleArray<Teacher>;

  getUuid(): string {
    return this.email;
  }
}

class Teacher extends CoreModel {
  courses: ModelsMapped<Course, "name">;
}

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

class Classroom extends CoreModel {
  uuid: string;
  name: string;
  courses: ModelsMapped<Course, "name">;
  hardware: ModelRelated<Hardware, "classroom">;
}

class Hardware extends CoreModel {
  classroom: ModelParent<Classroom>;
}

export class ComputerScreen extends Hardware {
  modelId: string;
  serialNumber: string;
}

export { Student, Teacher, Course, Classroom, Hardware };
