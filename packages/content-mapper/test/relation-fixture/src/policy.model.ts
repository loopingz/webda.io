import type {
  BelongTo,
  Contains,
  ManyToMany,
  ManyToOne,
  ModelLinksSimpleArray,
  ModelParent,
  ModelsMapped,
  RelateTo
} from "../models/index.js";
import { UuidModel } from "../models/index.js";
import type * as models from "../models/index.js";

/** An application alias of an alias: resolved through the chain */
type OwnedBy<T> = BelongTo<T>;

/** @WebdaModel */
export class Company extends UuidModel {
  /** @CascadeDelete */
  staff: ModelsMapped<Member, "employer", "uuid">;
}

/** @WebdaModel */
export class Project extends UuidModel {
  company: ModelParent<Company>;
}

/** @WebdaModel */
export class SubProject extends Project {}

/** @WebdaModel */
export class SubTask extends UuidModel {
  project: OwnedBy<Project>;
}

/** @WebdaModel */
export class Member extends UuidModel {
  /** @OnDelete RESTRICT */
  company: BelongTo<Company>;
  /** @OnDelete SET_NULL */
  mentor: RelateTo<Member>;
  /** @OnDelete SET_NULL */
  projects: ModelLinksSimpleArray<Project>;
  /** @CascadeDelete */
  team: ManyToOne<Company>;
  employer: ManyToOne<Company>;
  /** @OnDelete NONE */
  watched: ManyToMany<Project>;
  /**
   * A qualified type name, and an empty tag: the default policy
   * @OnDelete
   */
  qualified: models.ManyToOne<Company>;
}

/** @WebdaModel */
export class Folder extends UuidModel {
  parent: ModelParent<Folder>;
  files: Contains<SubTask>;
  /** @OnDelete RESTRICT */
  pinned: Contains<Project>;
}
