import { Session } from "../session/session.js";
import { OperationContext } from "./operationcontext.js";
/**
 * Simple Operation Context with custom input
 */
export declare class SimpleOperationContext extends OperationContext {
    input: Buffer;
    /**
     * Create another context from an existing one
     * @param context
     * @returns
     */
    static fromContext(context: OperationContext): Promise<SimpleOperationContext>;
    /**
     * Set the input
     */
    setInput(input: Buffer): this;
    /**
     * Set the session
     * @param session
     * @returns
     */
    setSession(session: Session): this;
    /**
     * @override
     */
    getRawInput(limit?: number, _timeout?: number): Promise<Buffer>;
}
//# sourceMappingURL=simplecontext.d.ts.map