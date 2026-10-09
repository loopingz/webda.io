# Tutorial - Contact list

For the purpose of the tutorial, we will build a small contact list application.

For a larger walkthrough (relations, services, REST, GraphQL and gRPC), see
[Tutorial-BlogSystem](./Tutorial-BlogSystem/00-Overview.md).

## First steps

Create the project with the Webda scaffolder (Node.js >= 22):

```bash
npm create @webda contacts -- --yes
cd contacts
```

Options go after `--` with npm: `--store memory|file|mongodb|postgres` (default `memory`),
`--transports rest,graphql,grpc,mcp` (default `rest`), `--namespace <PascalCase>` (default derived from the
directory name, here `Contacts`).

The project is created as follows:

```bash
├── AGENTS.md / CLAUDE.md     # instructions for coding agents, skills in .agents/skills/
├── package.json              # scripts: build, debug, serve, test
├── src
│   ├── models
│   │   ├── Project.model.ts  # example models
│   │   └── Task.model.ts
│   └── services
│       └── task.service.ts   # example service
├── test
│   └── app.spec.ts
├── tsconfig.json
├── vitest.config.ts
└── webda.config.json
```

The scripts of `package.json`:

```bash
npm run build   # webdac build: compile and generate webda.module.json and .webda/
npm run debug   # build, then webda debug: dev server on http://localhost:18080
npm run serve   # build, then webda serve
npm test        # build, then vitest run
```

The example `Project`, `Task` and `TaskService` can stay next to our contacts or be deleted (remove the `TaskService`
entry of `webda.config.json` and the test that uses it as well).

## The Contact model

A model is a class in `src/models/<Name>.model.ts` (the `.model.ts` suffix is required) extending `UuidModel` or
`Model` from `@webda/models`. Fields are class properties, validation comes from JSDoc tags.

Permissions are deny-by-default: a model without a `canAct` method is refused on every transport. For now, let's
authorize everything.

```typescript title="src/models/Contact.model.ts"
import type { IOperationContext } from "@webda/core";
import { UuidModel } from "@webda/models";

/**
 * A contact of our list
 */
export class Contact extends UuidModel {
  /**
   * First name of our contact
   * @minLength 1
   */
  firstName!: string;
  /**
   * Last name of our contact
   * @minLength 1
   */
  lastName!: string;
  /**
   * Emails collection
   */
  emails!: {
    /**
     * @format email
     */
    email: string;
    type: "PERSONAL" | "PROFESSIONAL";
  }[];
  /**
   * Notes
   */
  notes?: string;

  /**
   * Called to check if an action is available for the current caller
   * @param context - the caller context
   * @param action - the action ("create", "get", "update", "delete"...)
   * @returns true to allow, false or a reason string to refuse
   */
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    return true;
  }
}
```

Build the project: the compiler generates the JSON schema of the model and registers it in `webda.module.json`.

```bash
npm run build
```

## Expose the API

The generated `webda.config.json` already exposes every model over REST:

```json title="webda.config.json"
{
  "$schema": ".webda/config.schema.json",
  "version": 4,
  "parameters": {},
  "services": {
    "HttpServer": {
      "type": "Webda/HttpServer"
    },
    "DomainService": {
      "type": "Webda/DomainService"
    },
    "RESTService": {
      "type": "Webda/RESTOperationsTransport"
    },
    "TaskService": {
      "type": "TaskService"
    }
  }
}
```

`DomainService` registers the model operations (create, get, update, patch, delete, query) and `RESTService` exposes
them as routes: `/contacts`, `/contacts/{uuid}`... The data is stored in the default `Registry` store, an in-memory
store persisted to `.registry`.

Start the development server:

```bash
npm run debug
```

To browse the API, set `"exposeOpenAPI": true` on `RESTService`: the REST transport then serves its OpenAPI definition
with a Swagger UI on `http://localhost:18080/`.

To export the OpenAPI definition, for a client generator for example:

```bash
npx webda openapi                     # print it
npx webda openapi --output openapi.json
```

If you prefer `GraphQL`, add the module:

```bash
npm install @webda/graphql
```

And declare the service in `webda.config.json`, it adds a `/graphql` route:

```json title="webda.config.json"
{
  "services": {
    "GraphQLService": {
      "type": "Webda/GraphQLService"
    }
  }
}
```

Run `npm run debug` again to test the API. The same operations, with the same validation and permissions, are
available on both transports.

## Unit test

Modify the Contact model to only authorize an authenticated user to do anything.

```typescript title="src/models/Contact.model.ts"
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    // Require user to be authenticated to do anything on contact
    return context.getCurrentUserId() ? true : "Login required";
  }
```

Let's add a test to the generated `test/app.spec.ts`. Tests load the application from `lib/`, so get the model class
with `useModel("<Namespace>/<Model>")` rather than importing it from `src/`.

```typescript title="test/app.spec.ts"
  @test
  async contactRequiresLogin() {
    const Contact = useModel<any>("Contacts/Contact");
    const contact = await Contact.create({ firstName: "Ada", lastName: "Lovelace", emails: [] });
    const context = await this.newContext();
    await context.init();
    assert.notStrictEqual(await contact.canAct(context, "get"), true, "Refused when not logged in");
    context.getSession().login("user1", "user1:test");
    assert.strictEqual(await contact.canAct(context, "get"), true, "Allowed once logged in");
  }
```

We can then launch the tests with:

```bash
npm test
```

## Authentication

If you reload the application, no contacts are returned anymore, as it requires a logged user. Let's add a login with
`@webda/auth`:

```bash
npm install @webda/auth
```

The `Authentication` service holds the shared logic, each login method is a provider service. The email/password
provider needs a mailer to send its emails: `Webda/DebugMailer` only logs them (at DEBUG level) and keeps them in
memory. With `verification` set to `none`, accounts are created immediately without an email verification.

```json title="webda.config.json"
{
  "services": {
    "Mailer": {
      "type": "Webda/DebugMailer"
    },
    "Authentication": {
      "type": "Webda/Authentication"
    },
    "emailAuth": {
      "type": "Webda/EmailPasswordProvider",
      "verification": "none",
      "redirects": {
        "failure": "http://localhost:18080/",
        "recover": "http://localhost:18080/"
      }
    }
  }
}
```

The `redirects` are pages of your front-end, used by the links sent by email. Users and idents are the `Webda/User`
and `Webda/Ident` models, stored in the `Registry` store unless you map them to another store.

Some of the operations added:

- `POST /auth/email/register` with `email` and `password` to create an account
- `POST /auth/email/login` with `email` and `password` to log in
- `GET /auth/me` to get the current user
- `GET /auth/providers` to list the login methods
- `POST /auth/logout`

Once logged in, the contacts are back.

### Google Authentication

Install `@webda/google-auth` and declare a `Webda/GoogleAuthentication` service next to `Authentication`, with your
OAuth `client_id`, `client_secret` and `redirects.failure`. Users then log in by opening `/auth/google`.

See [Authentication](../Security/Authentication.md) for all the options: account linking, verification, password
recovery, tokens and OAuth providers.

## Restrict Contact to the current user

We can now restrict each contact to the user who created it, by extending `OwnerModel` from `@webda/core` instead of
`UuidModel` and removing our `canAct` method.

```typescript title="src/models/Contact.model.ts"
import { OwnerModel } from "@webda/core";

/**
 * A contact of our list, visible to its owner only
 */
export class Contact extends OwnerModel {
  /**
   * First name of our contact
   * @minLength 1
   */
  firstName!: string;
  /**
   * Last name of our contact
   * @minLength 1
   */
  lastName!: string;
  /**
   * Emails collection
   */
  emails!: {
    /**
     * @format email
     */
    email: string;
    type: "PERSONAL" | "PROFESSIONAL";
  }[];
  /**
   * Notes
   */
  notes?: string;
}
```

`OwnerModel` sets the owner (`_user`) to the caller on create, never from client input. Its `canAct` lets only the
owner act on the object (or anyone read it when `public` is true), and its `getPermissionQuery` makes the queries
return only the caller's objects and the public ones.

Now no contacts are showing, but if you create a new Contact it will show up. You can play with the application and
see that a contact is only visible to the user who created it. Update the unit test accordingly: a contact created
without a caller has no owner, so `canAct` refuses it even for a logged user.

## Binaries and files

Let's add `photos` to our contact model, it will allow us to attach binary files to each contact.

For this we will need a binary service, which stores the files and maintains the references with the models. It also
deduplicates files: a file already stored is not stored twice.

Install `@webda/fs` and add the `Webda/FileBinary` service to your `webda.config.json`:

```bash
npm install @webda/fs
```

```json title="webda.config.json"
{
  "services": {
    "Binary": {
      "type": "Webda/FileBinary",
      "folder": "./binaries",
      "models": { "*": ["*"] }
    }
  }
}
```

`models` maps the models and attributes this service handles; `{ "*": ["*"] }` (the default) means all of them.

Then add the attribute to the `Contact` model:

```typescript title="src/models/Contact.model.ts"
import { Binaries, OwnerModel } from "@webda/core";

export class Contact extends OwnerModel {
  // ...
  /**
   * Photos of the contact
   */
  photos!: Binaries;
}
```

If you want to only store one file, use `Binary` instead of `Binaries`. Uploaded photos are stored in the `binaries`
folder.

We now have new routes to manage the upload and download of the photos:

- `PUT /contacts/{uuid}/photos`: announce a file by its hashes (challenge)
- `POST /contacts/{uuid}/photos`: upload a file
- `GET /contacts/{uuid}/photos/{index}`: download a photo
- `GET /contacts/{uuid}/photos/{index}/url`: get a download url
- `DELETE /contacts/{uuid}/photos/{index}/{hash}`: remove a photo

Webda uses a challenge mechanism for uploads: the client first announces the file with its hashes, then uploads the
content only when the server asks for it. With a cloud binary service, the upload can go directly to AWS S3 or Google
Cloud Storage.

The `canAct` of the model also decides who may read or change the photos: the actions are named after the attribute,
like `photos.attach` or `photos.get`.

## Deploy

Install the deployer package, then describe each environment in `deployments/<name>.json`. A deployment overrides
`parameters` and `services` of `webda.config.json` and lists its deployers in `units`.

Our application stores its data in memory, so a deployment should replace the `Registry` store.

### AWS

```bash
npm install @webda/aws
```

```json title="deployments/aws.json"
{
  "$schema": "../.webda/deployment.schema.json",
  "services": {
    "Registry": {
      "type": "Webda/DynamoStore",
      "table": "contacts-application"
    }
  },
  "units": [
    {
      "name": "stack",
      "type": "Webda/CloudFormationDeployer",
      "AssetsBucket": "my-artifacts",
      "Lambda": {},
      "APIGateway": {}
    }
  ]
}
```

```bash
npm run build
npx webda -d aws deploy
```

### Kubernetes

Build a container image with `@webda/oci`, then run it in your cluster. Here the data goes to MongoDB, its url comes
from the `WEBDA_MONGO_URL` environment variable of the container:

```bash
npm install @webda/oci @webda/mongo
```

```json title="deployments/kubernetes.json"
{
  "$schema": "../.webda/deployment.schema.json",
  "services": {
    "Registry": {
      "type": "Webda/MongoStore",
      "collection": "contacts"
    }
  },
  "units": [
    {
      "name": "image",
      "type": "Webda/ContainerDeployer",
      "image": "ghcr.io/my-org/contacts",
      "tags": ["${package.version}", "latest"]
    }
  ]
}
```

```bash
npm run build
npx webda -d kubernetes container push
```

`-d <name>` must be placed before the command name. See [Deployments](../Deployments/Deployments.md) and
[Kubernetes](../Deployments/Kubernetes/Kubernetes.md).

## Conclusion

You can continue by adding a more secure API with `@webda/hawk`, or metrics for your application. You can also add
full-text search with `@webda/elasticsearch`.

### Prometheus metrics

```json title="webda.config.json"
{
  "services": {
    "PrometheusService": {
      "type": "Webda/PrometheusService",
      "portNumber": 9090
    }
  }
}
```

The metrics are served on `/metrics`, on a dedicated HTTP server when `portNumber` is set.

## Next tutorials

- Add thumbnails generation via asynchronous tasks
- Add a send email feature
- Serve the ui
- Add websockets
