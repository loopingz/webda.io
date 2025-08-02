# @webda/models

`@webda/models` is a powerful TypeScript library for data modeling, providing a flexible and extensible foundation for building data-centric applications. It is inspired by ORM/ODM patterns and designed to be highly customizable, allowing you to define complex data structures, relationships, and business logic with ease.

This package provides a set of classes and interfaces to create models, manage their persistence through repositories, and define relationships between them.

## Installation

You can install the package using npm or yarn:

```bash
npm install @webda/models
# or
yarn add @webda/models
```

## Core Concepts

### Models

Models are the cornerstone of `@webda/models`. They are classes that represent your data structures. You can define a model by extending the `Model` class or the `UuidModel` for models with a single `uuid` primary key.

**Key Features:**

*   **Typed Attributes:** Define your model's properties with TypeScript types.
*   **Primary Keys:** Support for single and composite primary keys.
*   **Lifecycle Events:** Models can emit events for `Create`, `Update`, and `Delete` operations.
*   **Persistence:** Models can be saved, refreshed, and deleted through repositories.

**Example: A simple User model**

```typescript
import { UuidModel } from '@webda/models';

export class User extends UuidModel {
    name: string;
    email: string;
    active: boolean;
}
```

### Repositories

Repositories are responsible for the persistence of your models. They provide an abstraction layer for your data storage, whether it's a database, a remote API, or in-memory storage. The `Repository` interface defines a standard set of methods for CRUD operations (`get`, `create`, `update`, `delete`, `query`, etc.).

You associate a repository with a model using `registerRepository`, and you can retrieve it using `useRepository` or `model.getRepository()`.

**Example: Registering a MemoryRepository for testing**

```typescript
import { User } from './models';
import { MemoryRepository, registerRepository } from '@webda/models';

// Register the repository for the User model
registerRepository(User, new MemoryRepository(User, ['uuid']));

// Now you can get the repository for the User model
const userRepository = User.getRepository();
```

### Primary Keys

A primary key uniquely identifies a model instance. `@webda/models` supports both single and composite primary keys. You define the primary key by setting the `PrimaryKey` property on your model.

**Example: A model with a composite primary key**

```typescript
import { Model } from '@webda/models';

export class Customer extends Model {
    // Composite primary key
    public PrimaryKey = ['country', 'identifier'] as const;

    country: string;
    identifier: string;
    name: string;
}
```

## Usage

### Defining Models and Relationships

`@webda/models` provides a rich set of tools for defining relationships between models.

*   **`ModelLink<T>`**: For one-to-one or many-to-one relationships.
*   **`ModelRelated<T>`**: For one-to-many relationships (the "many" side).
*   **`ModelLinksSimpleArray<T>`**: For many-to-many relationships storing an array of model references.
*   **`ModelLinksArray<T, K>`**: For many-to-many relationships with additional data in the relation.

Here is a complete example of a simple blog system:

```typescript
import { Model, UuidModel } from '@webda/models';
import { ModelLink, ModelLinksSimpleArray, ModelRelated } from '@webda/models';

// A User model with a UUID primary key
export class User extends UuidModel {
    name: string;
    // A user can have many posts (one-to-many)
    posts: ModelRelated<Post, 'author'>;
}

// A Post model
export class Post extends UuidModel {
    title: string;
    content: string;
    // A post has one author (many-to-one)
    author: ModelLink<User>;
    // A post can have many categories (many-to-many)
    categories: ModelLinksSimpleArray<Category>;
}

// A Category model
export class Category extends UuidModel {
    name: string;
    // A category can have many posts (many-to-many)
    posts: ModelRelated<Post, 'categories'>;
}
```

### CRUD Operations

Once you have registered a repository for your models, you can perform CRUD operations.

```typescript
import { User } from './models';
import { MemoryRepository, registerRepository } from '@webda/models';

// Register a repository for the User model
registerRepository(User, new MemoryRepository(User, ['uuid']));

// Get the repository
const userRepository = User.getRepository();

async function main() {
    // Create a user
    const user = await userRepository.create('user-1', { name: 'John Doe', email: 'john@example.com', active: true });
    console.log('Created user:', user);

    // Get a user
    const fetchedUser = await userRepository.get('user-1');
    console.log('Fetched user:', fetchedUser.name);

    // Update a user
    await userRepository.patch('user-1', { active: false });
    const updatedUser = await userRepository.get('user-1');
    console.log('Updated user is active:', updatedUser.active);

    // Delete a user
    await userRepository.delete('user-1');
    const exists = await userRepository.exists('user-1');
    console.log('User exists:', exists); // false
}

main();
```

### Working with Relationships

You can easily manipulate relationships.

```typescript
// Assuming repositories are registered for Post and Category
const postRepo = Post.getRepository();
const categoryRepo = Category.getRepository();

// Create a post and a category
const post = await postRepo.create('post-1', { title: 'My First Post', content: '...' });
const category = await categoryRepo.create('cat-1', { name: 'Technology' });

// Link the post to the author (user-1)
post.author.set('user-1');
await post.save();

// Add a category to the post
post.categories.add(category);
await post.save();

// Get the author of the post
const author = await post.author.get();
console.log('Post author:', author.name);
```

## Advanced Concepts

### Actions

You can define "actions" on your models, which are methods that can be exposed, for example, in an API. Use the `ActionWrapper` to mark a method as an action.

```typescript
import { ActionWrapper } from '@webda/models';

class User extends UuidModel {
    // ...
    changePassword = ActionWrapper(async (newPassword: string) => {
        // ... logic to change password
        return true;
    }, 'Change the user password');
}
```

### Exposing Models for APIs

The `Exposable` interface allows you to control how models are exposed, for example, through an API. You can implement `canAct` to define access control rules for actions.

```typescript
import { ActionsEnum, ExposableModel } from '@webda/models';

class User extends UuidModel implements ExposableModel {
    // ...
    async canAct(action: ActionsEnum<this>): Promise<boolean | string> {
        if (action === 'changePassword') {
            // Add your logic here, e.g., check if the user is an admin
            return true;
        }
        return false;
    }
    // ...
}
```

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This package is licensed under the [LGPL-3.0-only](https://www.gnu.org/licenses/lgpl-3.0.en.html).
