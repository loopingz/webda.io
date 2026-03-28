export type Ace = {
    action: string;
    type: "GROUP" | "USER";
    allow: boolean;
};
/**
 * Allow to define ACLs for the object
 *
 * It is used as an attribute in the model so
 * you can add it later on to existing models
 *
 */
export declare class ResourceAcl extends Array<Ace> {
    toDto(): Ace[];
    fromDto(dto: Ace[]): void;
    /**
     * ACLs for the object
     */
    canAct(action: string, user?: any): Promise<string | boolean>;
}
//# sourceMappingURL=aclmodel.d.ts.map