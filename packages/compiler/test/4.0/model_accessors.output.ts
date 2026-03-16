import { WEBDA_STORAGE } from "@webda/models";

// Inline base classes so the morpher can resolve the hierarchy without external deps
class Model {}
class UuidModel extends Model {}

class User extends UuidModel {
  name: string;
  age: number;

    get createdAt(): Date {
        return this[WEBDA_STORAGE]["createdAt"] as Date;
    }

    set createdAt(value: string | number | Date) {
        this[WEBDA_STORAGE]["createdAt"] = value !== undefined && value !== null ? new Date(value as string | number | Date) : value as any;
    }

    get updatedAt(): Date {
        return this[WEBDA_STORAGE]["updatedAt"] as Date;
    }

    set updatedAt(value: string | number | Date) {
        this[WEBDA_STORAGE]["updatedAt"] = value !== undefined && value !== null ? new Date(value as string | number | Date) : value as any;
    }
}

// createdAt should be transformed; publishedAt already has a getter/setter – morpher must skip it.
class Post extends UuidModel {
  title: string;

  get publishedAt(): Date {
    return new Date();
  }
  set publishedAt(value: Date) {}
  views: number;

    get createdAt(): Date {
        return this[WEBDA_STORAGE]["createdAt"] as Date;
    }

    set createdAt(value: string | number | Date) {
        this[WEBDA_STORAGE]["createdAt"] = value !== undefined && value !== null ? new Date(value as string | number | Date) : value as any;
    }
}

// No coercible fields – morpher must be a no-op
class Tag extends UuidModel {
  label: string;
  count: number;
}
Object.defineProperty(User.prototype, "createdAt", { ...Object.getOwnPropertyDescriptor(User.prototype, "createdAt"), enumerable: true });
Object.defineProperty(User.prototype, "updatedAt", { ...Object.getOwnPropertyDescriptor(User.prototype, "updatedAt"), enumerable: true });
Object.defineProperty(Post.prototype, "createdAt", { ...Object.getOwnPropertyDescriptor(Post.prototype, "createdAt"), enumerable: true });
