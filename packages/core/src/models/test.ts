import { Ident } from "./ident";
import { ModelLink, ModelMapLoader } from "./relations";
import { SimpleUser } from "./simpleuser";

/**
 * @WebdaIgnore
 */
export class MyIdent extends Ident {
  toto: string;
  _user: ModelLink<MySimpleUser>;
}

/**
 * @WebdaIgnore
 */
export class MySimpleUser extends SimpleUser {
  _idents: ModelMapLoader<MyIdent, "_type" | "uuid" | "email">[];
}
