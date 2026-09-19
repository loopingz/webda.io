import { Service, ServiceParameters } from "@webda/core";

/** Parameters for the reusable service requiring a mandatory field. */
export class CustomReusableServiceParameters extends ServiceParameters {
  mandatoryField: string;
}

/**
 * Reusable service with JSDocs Modda
 *
 * @WebdaModda
 */
export default class CustomReusableService<
  T extends CustomReusableServiceParameters = CustomReusableServiceParameters
> extends Service<T> {}
