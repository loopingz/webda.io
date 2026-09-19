import { User } from "./user.model.js";

const u = new User();
// Accepted only because the generated setter is widened.
u.createdAt = "2020-01-01";
// The getter stays narrow, so this must still be an error when checked negatively.
export const when: Date = u.createdAt;
