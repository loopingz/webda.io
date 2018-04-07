"use strict";
import { CoreModel } from './coremodel';

/**
 * First basic model for Ident
 * @class
 */
class User extends CoreModel {

  __password: string;
  _lastPasswordRecovery: number;	

}

export { User };
