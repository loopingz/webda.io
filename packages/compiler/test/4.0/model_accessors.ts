// Inline base classes so the morpher can resolve the hierarchy without external deps
class Model {}
class UuidModel extends Model {}

class User extends UuidModel {
  name: string;
  createdAt: Date;
  age: number;
  updatedAt: Date;
}

// createdAt should be transformed; publishedAt already has a getter/setter – morpher must skip it.
class Post extends UuidModel {
  title: string;
  createdAt: Date;
  get publishedAt(): Date {
    return new Date();
  }
  set publishedAt(value: Date) {}
  views: number;
}

// No coercible fields – morpher must be a no-op
class Tag extends UuidModel {
  label: string;
  count: number;
}
