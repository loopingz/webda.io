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

export class Group extends UuidModel {
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
