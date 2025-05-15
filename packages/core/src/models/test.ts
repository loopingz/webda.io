import { Ident } from "./ident";
import { ModelLink, ModelMapLoader } from "./model";
import { SimpleUser } from "./simpleuser";

/**
 * @WebdaIgnore
 */
export class MyIdent extends Ident {
  toto: string;
  declare _user: ModelLink<MySimpleUser>;
}

/**
 * @WebdaIgnore
 */
export class MySimpleUser extends SimpleUser {
  declare idents: ModelMapLoader<MyIdent, "_type" | "uid" | "email">[];
}
