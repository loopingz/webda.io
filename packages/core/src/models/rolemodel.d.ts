import { Model } from "@webda/models";
import type { IOperationContext } from "../contexts/icontext.js";
declare abstract class RoleModel extends Model {
    abstract getRolesMap(): {
        [key: string]: string;
    };
    isPermissive(): boolean;
    getRoles(ctx: IOperationContext): Promise<any>;
    canAct(context: IOperationContext, action: string): Promise<string | boolean>;
}
export { RoleModel };
//# sourceMappingURL=rolemodel.d.ts.map