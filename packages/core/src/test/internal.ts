import { useModel } from "../application/hook";
import { ModelDefinition, UnpackedConfiguration } from "../internal/iapplication";
import { UuidModel } from "../models/uuid";
import { FileUtils } from "@webda/utils";
import { TestApplication } from "./objects";
import { WebdaApplicationTest } from "./test";

export class TestInternalApplication extends TestApplication {
  loadProjectInformation() {
    const info = super.loadProjectInformation();
    delete info.webda.workspaces;
    return info;
  }
}

export class WebdaInternalTest extends WebdaApplicationTest {
  static getApplication(): TestApplication {
    let cfg = this.getTestConfiguration();
    if (typeof cfg === "string") {
      cfg = FileUtils.load(cfg);
    }
    return new TestInternalApplication(cfg);
  }

  /**
   * Create a graph of objets from sample-app to be able to test graph
   */
  async createGraphObjects() {
    const Teacher = <ModelDefinition<UuidModel & { name: string; senior: boolean; uuid: string }>>useModel("Teacher");
    const Course = <ModelDefinition<UuidModel & { name: string; classroom: string; teacher: string; students: any[] }>>(
      useModel("Course")
    );
    const Classroom = <ModelDefinition<UuidModel & { name: string; courses: any; hardwares: any }>>(
      useModel("Classroom")
    );
    const Student = <
      ModelDefinition<UuidModel & { order: number; email: string; firstName: string; lastName: string }>
    >useModel("Student");
    const Hardware = <ModelDefinition<UuidModel & { name: string; classroom: string }>>useModel("Hardware");
    const ComputerScreen = <
      ModelDefinition<UuidModel & { name: string; classroom: string; modelId: string; serialNumber: string }>
    >useModel("ComputerScreen");
    const Company = <ModelDefinition<UuidModel & { name: string; uuid: string }>>useModel("Company");
    const User = <ModelDefinition<UuidModel & { name: string; _company: string }>>useModel("User");

    // 2 Companies
    const companies = [await Company.create({ name: "company 1" }), await Company.create({ name: "company 2" })];
    const users = [];
    for (const company of companies) {
      for (let i = 1; i < 6; i++) {
        // 2 User per company
        users.push(
          await User.create({
            name: `User ${users.length + 1}`,
            _company: company.uuid
          })
        );
      }
    }

    // 2 Teachers
    const teachers = [await Teacher.create({ name: "test" }), await Teacher.create({ name: "test2", senior: true })];
    const students = [];
    const courses = [];

    // 10 Students
    for (let i = 1; i < 11; i++) {
      students.push(
        await Student.create({
          email: `student${i}@webda.io`,
          firstName: `Student ${i}`,
          lastName: `Lastname ${i}`,
          order: i
        })
      );
    }

    // 10 Topics
    const topics = ["Math", "French", "English", "Physics", "Computer Science"];
    for (let i = 1; i < 13; i++) {
      const courseStudents = [];
      for (let j = i; j < i + 6; j++) {
        const s = students[j % 10];
        courseStudents.push({
          uuid: s.getUuid(),
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName
        });
      }
      courses.push(
        await Course.create({
          name: `${topics[i % 5]} ${i}`,
          teacher: teachers[i % 2].uuid,
          students: courseStudents
        })
      );
    }

    // 3 classrooms
    const classrooms = [];
    for (let i = 1; i < 4; i++) {
      const classCourses = [];
      classCourses.push({ uuid: courses[i].uuid, name: courses[i].name });
      classCourses.push({ uuid: courses[i * 2].uuid, name: courses[i * 2].name });
      classCourses.push({ uuid: courses[i * 3].uuid, name: courses[i * 3].name });
      classrooms.push(
        await Classroom.create({
          name: `Classroom ${i}`,
          courses: classCourses
        })
      );
    }

    let count = 1;
    for (const course of courses) {
      course.classroom.set(classrooms[count++ % 3].uuid);
      await course.save();
    }

    // 12 Hardware
    const hardwares = [];
    for (let i = 1; i < 12; i++) {
      if (i % 2) {
        hardwares.push(
          await ComputerScreen.create({
            classroom: classrooms[i % 3].uuid,
            name: `Computer Screen ${i}`
          })
        );
      } else {
        hardwares.push(
          await Hardware.create({
            classroom: classrooms[i % 3].uuid,
            name: `Hardware ${i}`
          })
        );
      }
    }

    count = 1;
    for (const classroom of classrooms) {
      const classCourses = [];
      for (let i = 0; i < 3; i++) {
        classCourses.push({
          uuid: courses[count++ % 12].uuid,
          name: courses[count % 12].name
        });
      }
      await classroom.patch({
        courses: classCourses
      });
    }
  }
}

/**
 * Empty application
 */
export class WebdaInternalSimpleTest extends WebdaInternalTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      }
    };
  }
}
