import { ManyToOne, Model, ModelLink, ModelRelated, OneToMany, Service, ServiceParameters, UuidModel } from "./runtime.js";

/** A model exercising all three accessor coercion kinds. */
export class Post extends UuidModel {
  title: string = "";

  /** builtin coercion (Date registry) */
  createdAt: Date;

  /** set-method coercion, via the ManyToOne alias -> ModelLink */
  author: ManyToOne<User>;

  /** set-method coercion, direct ModelLink */
  editor: ModelLink<User>;

  /** relation-initializer, via OneToMany alias -> ModelRelated */
  comments: OneToMany<Comment>;

  /** static members must be skipped */
  static epoch: Date;

  /** existing accessors must never be overwritten */
  get slug(): string {
    return this.title.toLowerCase();
  }
}

/** Another model. */
export class Comment extends UuidModel {
  body: string = "";
  postedAt: Date;
}

/** A model. */
export class User extends UuidModel {
  name: string = "";
}

/** Not a model — must be left entirely alone. */
export class Helper {
  startedAt: Date;
}

/** Parameters for MyService. */
export class MyServiceParameters extends ServiceParameters {
  endpoint: string = "";
  retries: number = 3;
}

/** A service that should get a generated loadParameters(). */
export class MyService extends Service<MyServiceParameters> {
  /** does something */
  run(): string {
    return this.parameters.endpoint;
  }
}

/** A service that already has loadParameters — must not be touched. */
export class ManualService extends Service<MyServiceParameters> {
  protected loadParameters(data: any): MyServiceParameters {
    return new MyServiceParameters().load({ ...data, retries: 99 });
  }
}
