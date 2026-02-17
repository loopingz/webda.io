//import { Model, ModelLink, User as WebdaUser } from "@webda/core";
import { CoreEvents, ModelEvents } from "@webda/core";
import { Model, ModelLink, ModelLinksSimpleArray } from "./webda";

class WebdaUser extends Model {
  email: string;
  password: string;
  declare Events: ModelEvents & {
    Login: {
      user: WebdaUser;
    };
  };
}

class Article extends Model {
  declare PrimaryKey: "slug";
  categories: ModelLinksSimpleArray<Category>;
  slug: string;
}

class User extends WebdaUser {
  role: "EDITOR" | "ADMIN";
}

class Category extends Model {
  declare PrimaryKey: "name";
  name: string;
}

class CategoryRole extends Model {
  declare PrimaryKey: "user" | "category";
  role: "EDITOR" | "ADMIN";
  user: ModelLink<User>;
  category: ModelLink<Category>;
}

(async () => {
  const article = await Article.create({
    slug: "test"
  });
  article.categories.add(await Category.create({}));
  article.categories.add(await Category.create({}));

  const art = await article.categories[0].get();
  article.categories[0].getUuid();

  const categoryRole = await CategoryRole.create({
    user: article.categories[0],
    category: article.categories[1],
    role: "EDITOR"
  });

  Article.on("Create", ({ object }) => {
    console.log(object.slug);
  });
  Article.create({
    slug: "test"
  });

  Article.on("PartialUpdate", ({ model }) => {
    console.log(model.slug);
  });
  User.on("Login", ({ user }) => {
    console.log(user.email);
  });

  await User.create({
    email: ""
  });
})();
