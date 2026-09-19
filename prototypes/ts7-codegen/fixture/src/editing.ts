import { User } from "./user.js";
const u = new User();
u.createdAt = "2020-01-01";
u.createdAt = 1577836800000;
const wrong: number = "definitely a string";
export const y = u.createdAt.getFullYear();
