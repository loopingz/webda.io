import { Service, ServiceParameters } from "@webda/core";

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
