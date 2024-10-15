/**
 * Interface to specify the Service parameters
 */
export class ServiceParameters {
  /**
   * Type of the service
   */
  type: string;

  /**
   * Copy all parameters into the object by default
   *
   * @param params from webda.config.json
   */
  constructor() {}

  load(params) {
    Object.assign(this, params);
    this.default();
    return this;
  }

  default() {}
}
