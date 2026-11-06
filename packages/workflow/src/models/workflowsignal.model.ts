import { CoreModel, type IOperationContext } from "@webda/core";

/**
 * A signal sent before any instance waited for it, kept until `expiresAt`
 *
 * The first wait on the same `(event, key)` whose instance accepts the sender consumes it.
 *
 * @WebdaModel
 * @WebdaPlural WorkflowSignals
 */
export default class WorkflowSignal extends CoreModel {
  /**
   * Event name
   */
  event: string;
  /**
   * Business key
   */
  key: string;
  /**
   * Payload, the result of the wait
   */
  payload?: any;
  /**
   * User id of the sender
   */
  senderId?: string;
  /**
   * Ident used by the sender
   */
  senderIdent?: string;
  /**
   * Sent by the system
   */
  system?: boolean;
  /**
   * When it was sent (ms)
   */
  createdAt: number;
  /**
   * When it can no longer be consumed (ms)
   */
  expiresAt: number;

  /**
   * Only the system: signals are written and consumed by the WorkflowService
   * @param context - the caller
   * @returns true for the system
   */
  canAct(context: IOperationContext): string | boolean {
    return context.isGlobalContext() || "Signals are handled by the WorkflowService only";
  }
}

export { WorkflowSignal };
