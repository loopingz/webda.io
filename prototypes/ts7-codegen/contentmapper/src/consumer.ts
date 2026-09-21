import { User } from "./user.wts";
const u = new User();
u.createdAt = "2020-01-01";
const bad: number = u.createdAt;
