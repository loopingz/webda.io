import { useModel } from "../application/hook";
import { ModelClass, UnpackedConfiguration } from "../internal/iapplication";
import { Repository, UuidModel } from "@webda/models";
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

type TeacherType = UuidModel & { name: string; senior: boolean; uuid: string };
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
    const Teacher = useModel<TeacherType>("Teacher");
    const Course = useModel<UuidModel & { name: string; classroom: string; teacher: string; students: any[] }>("Course");
    const Classroom = useModel<UuidModel & { name: string; courses: any; hardwares: any }>("Classroom");
    const Student = useModel<UuidModel & { order: number; email: string; firstName: string; lastName: string }>("Student");
    const Hardware = useModel<UuidModel & { name: string; classroom: string }>("Hardware");
    const ComputerScreen = useModel<UuidModel & { name: string; classroom: string; modelId: string; serialNumber: string }>("ComputerScreen");
    const Company = useModel<UuidModel & { name: string; uuid: string }>("Company");
    const User = useModel<UuidModel & { name: string; _company: string }>("User");

    // 2 Companies
    const companies = [
      await Company.create({ name: "company 1" } as any),
      await Company.create({ name: "company 2" } as any)
    ];
    const users = [];
    for (const company of companies) {
      for (let i = 1; i < 6; i++) {
        // 2 User per company
        users.push(
          await User.create({
            name: `User ${users.length + 1}`,
            _company: company.uuid
          } as any)
        );
      }
    }

    // 2 Teachers
    const teachers = [
      await Teacher.create({ name: "test" } as any),
      await Teacher.create({ name: "test2", senior: true } as any)
    ];
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
        } as any)
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
        } as any)
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
        } as any)
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
          } as any)
        );
      } else {
        hardwares.push(
          await Hardware.create({
            classroom: classrooms[i % 3].uuid,
            name: `Hardware ${i}`
          } as any)
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
