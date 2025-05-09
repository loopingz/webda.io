import { Model, UuidModel } from "../src/model";
import { ModelLink, ModelLinksArray, ModelLinksSimpleArray, ModelParent, ModelRelated } from "../src/relations";
import { PrimaryKey, PrimaryKeyType } from "../src/storable";


export class SlugModel extends Model {
  public PrimaryKey: readonly "slug"[] = ["slug"];
  slug: string;
  creator: ModelLink<User>;
  creationDate: Date;
  lastUpdate: Date;
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
    PrimaryKey = ["name"] as const;
    name: string;
    members: ModelLinksArray<User, {"permission": "admin" | "member"}>;
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
    public PrimaryKey: readonly "user"[] = ["user"];
    user: PrimaryKeyType<User>;
    language: string;
    picture: string;
}

const profile = Profile.ref("test").get();
const grp = await Group.ref("test").get();
grp.members.add({
    uuid: "test",
    permission: "admin",
});
grp.members.remove("test");
grp.members.remove(grp.members[0]);

const usr = await User.ref("rete").get();
Blog.ref("monblog").setAttribute("approver", "test");
Blog.ref("monblog").setAttribute("approver", usr.getPrimaryKey());

Blog.ref("monblog").upsertItemToCollection("authors", "test")

new Blog().authors.add("test");
new Blog().authors.add(usr);
new Blog().authors.remove("test");

(async () => {
    // SlugModel
    const page = await SlugModel.ref("page-1").get();
    console.log(page.slug);
    await page.creator.set("user-1");
    page.creationDate = new Date("2023-01-01");
    page.lastUpdater.set("user-2");
    page.lastUpdate = new Date();
    await page.save();

    // Blog
    const blog = await Blog.ref("tech-blog").get();
    blog.authors.add("user-1");
    blog.authors.add(await User.ref("user-2").get());
    blog.authors.remove("user-1");
    await blog.approver.set("user-3");
    console.log(await blog.authors[0].get()); // fetch all authors

    // Section
    const intro = new Section();
    intro.slug        = "intro";
    intro.title       = "Introduction";
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

    // User
    const user = await User.ref("user-100").get();
    user.active = true;
    user.friends.add("user-101");
    user.friends.remove("user-101");
    const profile = await user.profile;
    console.log(profile.language);

    // Profile
    const newProfile = new Profile();
    newProfile.user     = user.getPrimaryKey();
    newProfile.language = "en";
    newProfile.picture  = "/avatars/user-100.png";
})();