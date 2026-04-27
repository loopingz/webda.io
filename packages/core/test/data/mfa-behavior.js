"use strict";
/**
 * Test fixture: a minimal Behavior class used by application.spec.ts
 * to verify Application.loadModule() loads behavior classes from
 * webda.module.json's `behaviors` map.
 */
class MFA {
  async verify() {
    return true;
  }
}
module.exports = { MFA };
