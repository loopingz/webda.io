import { UuidModel } from "@webda/models";

/**
 * Root model of the legacy types fixture: shares its table with {@link V3Plant}
 *
 * @WebdaIgnore
 */
export class V3Animal extends UuidModel {
  /**
   * Label
   */
  name: string;
}

/**
 * Subclass of the legacy types fixture
 *
 * @WebdaIgnore
 */
export class V3Dog extends V3Animal {}

/**
 * Second-level subclass of the legacy types fixture
 *
 * @WebdaIgnore
 */
export class V3Puppy extends V3Dog {}

/**
 * Second model of the shared table, renamed from `Webda/Flora`
 *
 * @WebdaIgnore
 */
export class V3Plant extends UuidModel {
  /**
   * Label
   */
  name: string;
}
