import { Model, registerRepository, UuidModel } from "../src/model";
import { ModelLink, ModelLinksArray, ModelLinksSimpleArray, ModelParent, ModelRelated } from "../src/relations";
import { MemoryRepository, Repository } from "../src/repository";
import { PrimaryKeyType, WEBDA_PRIMARY_KEY } from "../src/storable";

class WebdaDate extends Date {
  set(value: string | Date | number) {
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!isNaN(parsed)) {
        super.setTime(parsed);
      } else {
        throw new Error("Invalid date string");
      }
    } else if (value instanceof Date) {
      super.setTime(value.getTime());
    } else {
      super.setTime(value);
    }
  }
}
export class SlugModel extends Model {
  [WEBDA_PRIMARY_KEY]: readonly "slug"[] = ["slug"];
  slug: string;
  creator: ModelLink<User>;
  creationDate: Date;
  lastUpdate: WebdaDate;
  lastUpdater: ModelLink<User>;
}

export class Blog extends SlugModel {
  authors: ModelLinksSimpleArray<User>;
  approver: ModelLink<User>;
}

export class Section extends SlugModel {
  title: string;
  description: string;
}

export class Group extends Model {
  [WEBDA_PRIMARY_KEY] = ["name"] as const;
  name: string;
  members: ModelLinksArray<User, { permission: "admin" | "member" }>;
  parent: ModelParent<Group>;
  subgroups: ModelRelated<Group, "parent">;
}

export class User extends UuidModel {
  blogs: ModelRelated<Blog, "authors">;
  groups: ModelRelated<Group, "members">;
  friends: ModelLinksSimpleArray<User>;
  approvedBlogs: ModelRelated<Blog, "approver">;
  active: boolean;
  /**
   * One to one relation with profile
   */
  get profile(): Promise<Profile> {
    return Profile.ref((this as User).getPrimaryKey()).get();
  }
}

/**
 * One to one relation with user
 */
export class Profile extends Model {
  [WEBDA_PRIMARY_KEY]: readonly "user"[] = ["user"];
  user: PrimaryKeyType<User>;
  language: string;
  picture: string;
}

const profileRepository = new MemoryRepository(Profile, ["user"]);
const slugRepository = new MemoryRepository(SlugModel, ["slug"]);
registerRepository(Profile, profileRepository);
registerRepository(SlugModel, slugRepository);
registerRepository(Blog, slugRepository as unknown as Repository<Blog>);
registerRepository(Section, slugRepository);
registerRepository(Group, new MemoryRepository(Group, ["name"]));
registerRepository(User, new MemoryRepository(User, ["uuid"]));

(async () => {
  const user1 = await User.ref("user-1").create({
    active: true
  });
  const user2 = await User.ref("user-2").create({
    active: true
  });
  const user3 = await User.ref("user-3").create({
    active: true,
    friends: []
  });
  const user4 = await User.ref("user-4").create({
    active: true,
    friends: []
  });
  //   const profile = await Profile.ref("test").create({
  //     language: "en",
  //     picture: "/avatars/test.png"
  //   });
  //   const grp = await Group.ref("test").get();
  //   grp.members.add({
  //     uuid: "test",
  //     permission: "admin"
  //   });
  //   grp.members.remove("test");
  //   grp.members.remove(grp.members[0]);

  //   const usr = await User.ref("rete").get();
  //   Blog.ref("monblog").setAttribute("approver", "test");
  //   Blog.ref("monblog").setAttribute("approver", usr.getPrimaryKey());

  //   Blog.ref("monblog").upsertItemToCollection("authors", "test");

  //   new Blog().authors.add("test");
  //   new Blog().authors.add(usr);
  //   new Blog().authors.remove("test");
  // SlugModel
  await SlugModel.ref("page-1").create({
    creationDate: new Date("2023-01-01"),
    lastUpdate: new Date(),
    creator: user1,
    lastUpdater: user2.getPrimaryKey()
  });

  const page = await SlugModel.ref("page-1").get();
  console.log(page.slug);
  await page.creator.set(user1);
  page.creationDate = new WebdaDate("2023-01-01");
  page.lastUpdater.set(user2);
  page.lastUpdater = new ModelLink(user2.getPrimaryKey(), User.getRepository(), page);
  page.lastUpdate = new WebdaDate();
  page.lastUpdate.set(123);
  await page.save();

  // Blog
  const blog = await Blog.ref("tech-blog").get();
  blog.authors.push("user-1");
  blog.authors.add(await User.ref("user-2").get());
  blog.authors.remove("user-1");
  await blog.approver.set("user-3");
  console.log(await blog.authors[0].get()); // fetch all authors

  // Section
  const intro = new Section();
  intro.slug = "intro";
  intro.title = "Introduction";
  intro.description = "Getting started with the tutorial.";
  await intro.save();

  // Group
  const group = await Group.ref("group-123").get();
  group.members.add({ uuid: "user-4", permission: "admin" });
  group.members.remove("user-4");
  group.members.add({ uuid: (await User.ref("user-5").get()).getPrimaryKey(), permission: "member" });
  await group.parent.set("parent-group");
  const parentGroup = await group.parent.get();
  console.log(parentGroup.name);
  await group.save();

  await User.ref("user-100").create({
    active: true,
    friends: ["user-101", user1]
  });
  await User.ref("user-101").create({
    active: true,
    friends: ["user-100", user1]
  });
  // User
  const user = await User.ref("user-100").get();
  user.active = true;
  user.friends.add("user-101");
  user.friends.remove("user-101");
  const profile = await user.profile;
  console.log(profile.language);

  // Profile
  const newProfile = new Profile();
  newProfile.user = user.getPrimaryKey();
  newProfile.language = "en";
  newProfile.picture = "/avatars/user-100.png";
})();
