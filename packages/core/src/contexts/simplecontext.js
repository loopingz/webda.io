import { streamToBuffer } from "@webda/utils";
import { OperationContext } from "./operationcontext.js";
/**
 * Simple Operation Context with custom input
 */
export class SimpleOperationContext extends OperationContext {
    /**
     * Create another context from an existing one
     * @param context
     * @returns
     */
    static async fromContext(context) {
        const ctx = new SimpleOperationContext(context["_webda"]);
        ctx.setSession(context.getSession());
        const stream = context.getRawStream();
        ctx.setInput(await streamToBuffer(stream));
        return ctx;
    }
    /**
     * Set the input
     */
    setInput(input) {
        this.input = input;
        return this;
    }
    /**
     * Set the session
     * @param session
     * @returns
     */
    setSession(session) {
        this.session = session;
        return this;
    }
    /**
     * @override
     */
    async getRawInput(limit = 1024 * 1024 * 10, _timeout = 60000) {
        return this.input.subarray(0, limit);
    }
}
//# sourceMappingURL=simplecontext.js.map