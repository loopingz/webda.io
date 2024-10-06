import { OpenAPIWebdaDefinition } from "../rest/irest";

/**
 * Interface to specify the Service parameters
 */
export class ServiceParameters {
  /**
   * Type of the service
   */
  type: string;
  /**
   * URL on which to serve the content
   */
  url?: string;
  /**
   * OpenAPI override
   * @SchemaIgnore
   */
  openapi?: OpenAPIWebdaDefinition;

  /**
   * Copy all parameters into the object by default
   *
   * @param params from webda.config.json
   */
  constructor(params: any) {
    Object.assign(this, params);
  }
}
