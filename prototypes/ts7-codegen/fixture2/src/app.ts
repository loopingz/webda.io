import { ManyToOne, ModelLink, OneToMany, Service, ServiceParameters, UuidModel } from "./runtime.js";

/** A model exercising all three accessor coercion kinds. */
export class Post extends UuidModel {
  /**
   * Title
   */
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

  /**
   * existing accessors must never be overwritten
   * @returns the slug
   */
  get slug(): string {
    return this.title.toLowerCase();
  }
}

/** Another model. */
export class Comment extends UuidModel {
  /**
   * Body
   */
  body: string = "";
  /**
   * Posted at
   */
  postedAt: Date;
}

/** A model. */
export class User extends UuidModel {
  /**
   * Name
   */
  name: string = "";
}

/** Not a model — must be left entirely alone. */
export class Helper {
  /**
   * Started at
   */
  startedAt: Date;
}

/** Parameters for MyService. */
export class MyServiceParameters extends ServiceParameters {
  /**
   * Endpoint
   */
  endpoint: string = "";
  /**
   * Retries
   */
  retries: number = 3;
}

/** A service that should get a generated loadParameters(). */
export class MyService extends Service<MyServiceParameters> {
  /**
   * does something
   * @returns the resulting string
   */
  run(): string {
    return this.parameters.endpoint;
  }
}

/** A service that already has loadParameters — must not be touched. */
export class ManualService extends Service<MyServiceParameters> {
  /**
   * Load parameters
   * @param data - the data
   * @returns the result
   */
  protected loadParameters(data: any): MyServiceParameters {
    return new MyServiceParameters().load({ ...data, retries: 99 });
  }
}
