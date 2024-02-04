# Tutorial - Contact list

For the purpose of the tutorial, we will build a small contact list application.

## First steps

Let's initialize the project first:

```shell
# Create a folder
mkdir webda-contacts
# Init a git repo
cd webda-contacts
git init
# Launch the template
npx @webda/shell init webda:app
```

This is a default output

```bash
? Your module name webda-contacts
? Your module description My own contact list
? Version 1.0.0
? Keywords (separate by comma) webda-module
? Do you want to create a module? No
? Would you like to publish on GitHub? Yes
? Would you like to enable SonarCloud.io? No
? Would you like to enable codecov? No
? Would you like to use GitHub Action? No
? Would you like to publish on npm on tags? Yes
? Do you want to use prettier? Yes
? Do you want to use husky? Yes
? Do you want to use typedoc? Yes
? Do you want to use auto-version on push on main? No
? Your npm email loopingz@loopingz.com
? Repository (format: username/repo) loopingz/webda.io-tutorial
? Do you want to use github-pages for documentation Yes
```

The project should be created as follow:

```bash
├── LICENSE
├── README.md
├── package-lock.json
├── package.json
├── src
│   └── index.ts
├── tsconfig.json
├── typedoc.json
├── webda.config.json
└── webda.module.json
```

Now, let's create our contact model.

```bash
yarn new-model Contact
```

Now let's define our Contact model by editing the file `src/models/contact.ts`

This is our current file:

```typescript title="src/models/contact.ts"
import { CoreModel } from "@webda/core";

/**
 * Define here a model that can be used along with Store service
 */
export class Contact extends CoreModel {
  /**
   * Call to check if action is available for the current user
   * @param ctx the context of the request
   * @param {string} action the type of action
   * @returns {Promise<void>}
   * @throws Exception if the action is not available to the user
   */
  async canAct(ctx, action: string): Promise<string | boolean> {
    if (action === "myAction") {
      return "Not permitted";
    }
    return true;
  }
}
```

We want to add the fields for contact and for now, let's authorize everything.

```typescript title="src/models/contact.ts"
import { CoreModel } from "@webda/core";

/**
 * Define here a model that can be used along with Store service
 */
export class Contact extends CoreModel {
  /**
   * First name of our contact
   */
  firstName: string;
  /**
   * Last name of our contact
   */
  lastName: string;
  /**
   * Emails collection
   */
  emails: {
    email: string;
    type: "PERSONAL" | "PROFESSIONAL";
  }[];
  /**
   * Notes
   */
  notes: string;
  /**
   * Call to check if action is available for the current user
   * @param ctx the context of the request
   * @param {string} action the type of action
   * @returns {Promise<void>}
   * @throws Exception if the action is not available to the user
   */
  async canAct(ctx, action: string): Promise<string | boolean> {
    return true;
  }
}
```

If you build, the schema is generated for your model

```bash
yarn build
yarn run v1.22.19
$ webda build
error: malformed object name 'HEAD'
2023-04-20T22:27:01.683Z [ INFO] Compiling...
2023-04-20T22:27:02.957Z [ INFO] Analyzing...
2023-04-20T22:27:02.973Z [ INFO] Generating schema for Contact
```

Let's expose the model by adding `@Expose` annotation in `src/models/contact.ts`

```typescript title="src/models/contact.ts"
import { CoreModel, Expose } from "@webda/core";

/**
 * Define here a model that can be used along with Store service
 */
@Expose()
export class Contact extends CoreModel {
...
```

Now let's define the `RESTDomainService` to expose our domain.

Add inside `webda.config.json`

```js title="webda.config.json"
{
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "parameters": {},
  "services": {
    "DomainService": {
      "type": "RESTDomainService",
      "queryMethod": "GET"
    }
  },
  "module": {}
}
```

```js title="webda.config.json"
{
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "parameters": {},
  "services": {
    "DomainService": {
      "type": "RESTDomainService",
      "queryMethod": "GET"
    }
  },
  "module": {}
}
```

You can export the openapi definition:

```

yarn build
yarn webda openapi openapi.yaml

```

You can serve your API already:

```

yarn webda debug

```

You have a frontend available to test the API hosted on https://loopingz.github.io/webda.io-tutorial/
Because of cookie security we need to expose the UI on the same host, or expose the API through https, as it is easier to expose the UI on the same host with our `ProxyService` let's add this to our webda.config.json

```js title="webda.config.json"
{
    "services": {
        ...
        "Proxy": {
            "type": "ProxyService",
            "backend": "https://loopingz.github.io/webda.io-tutorial/",
            "url": "/"
        },
        ...
    }
}

```

Go to our application `http://localhost:18080/`

If you prefer `GraphQL`, you can use our module:

```bash
yarn add @webda/graphql
```

And just define the service by adding to your `webda.config.json`, it will add a route `/graphql`

```js title="webda.config.json"
{
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "parameters": {},
  "services": {
    "DomainService": {
      "type": "RESTDomainService"
    },
    "GraphQLService": {
      "type": "Webda/GraphQLService"
    }
  },
  "module": {}
}
```

Now, you can run the application and test the API:

```bash
yarn webda debug
```

## Unit test

Modify the Contact model to only authorize an authenticated user to do anything.

```typescript title="src/models/contact.ts"
...
    async canAct(ctx, action: string): Promise<string | boolean> {
        // Require user to be authenticated to do anything on contact
        return ctx.getCurrentUserId() !== undefined;
    }
...
```

Let's add a unit test for our model, edit the file `src/models/contact.spec.ts`

```js title="src/models/contact.spec.ts"
import { suite, test } from "@testdeck/mocha";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { Contact } from "./contact";

@suite
class ContactTest extends WebdaSimpleTest {
  @test
  async canAct() {
    const contact = new Contact();
    const ctx = await this.newContext();
    assert.ok((await contact.canAct(ctx, "")) !== true, "Can act should return false if not logged");
    ctx.getSession().login("test", "test");
    assert.ok(await contact.canAct(ctx, ""), "Can act should return false if not logged");
  }
}
```

We can then launch the unit test with:

```bash
yarn test
```

## Authentication

If you reload the application, no contacts are displayed now, as it requires a logged user.

Now that our Contact only authorizes logged user, we need to be able to login.

If you refresh the application, now the API is called but no results are returned because there is no current user.

We have several choices for authentication:

- OAuth
- Login/Password

### Login/Password

The login/password authentication relies on 2 model types: `User` and `Ident`

The `User` model is the one that will be used to store the user information, it is the one that will be returned by the authentication service.
The `Ident` model is the different types of idents: emails, or others that are linked to a user.

We will use the default models for now, but you can create your own by extending the `User` and `Ident` models.

Add an authentication service, by editing the `webda.config.json`
The authentication service requires a mailer service to send emails to users.
By setting the `postValidation` to `true` we allow the user to login before validating his email.

```js title="webda.config.json"
{
  "services": {
    ...
    "Mailer": {
      "type": "DebugMailer"
    },
    "Authentication": {
      "type": "Authentication",
      "email": {
        "postValidation": true
      }
    }
    ...
  }
}
```

Routes added by the authentication service:

- `GET /auth/me` route is added to get the current user.
- `GET /auth` route is added to list the type of authentication available.
- `POST /auth` route is added to login with a specific type of authentication.

You can reload the application and create your user. You will see the contacts back.

### Google Authentication

You can add Google Authentication, by adding the following configuration to your `webda.config.json`

```js title="webda.config.json"
{
    "services": {
        ...
        "GoogleAuth": {
            "url": "/auth/google",
            "no_referer": true,
            "access_type": "offline",
            "scope": [
            "email",
            ],
            "type": "Webda/GoogleAuthentication",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [
            "http://localhost:18080/auth/google/callback",
            ],
            "javascript_origins": ["http://localhost:3000"],
            "client_id": "...",
            "project_id": "...",
            "client_secret": "..."
        },
        ...
    }
}
```

You also need to add the google-auth module with `npmn install @webda/google-auth`

Then you should be able to login with Google by accessing `http://localhost:18080/auth/google`

## Restrict Contact to the current user

We can now restrict the contact to the current user, by extending the `OwnerModel` instead of `CoreModel` and removing the `canAct` method.

```typescript title="src/models/contact.ts"
import { Expose, OwnerModel } from "@webda/core";

/**

- Define here a model that can be used along with Store service
  */
@Expose()
export class Contact extends OwnerModel {
  /**
   * First name of our contact
   */
  firstName: string;
  /**
   * Last name of our contact
   */
  lastName: string;
  /**
   * Emails collection
   */
  emails: {
    email: string;
    type: "PERSONAL" | "PROFESSIONAL";
  }[];
  /**
   * Notes
   */
  notes: string;
}
```

Now no models are showing, but if you create a new Contact it will show up.
You can play with the application and see that the contact is only visible to the user that created it.

## Binaries and files

Let's add `photos` to our contact model, it will allow us to save binary files to each model.

For this we will need to use a `BinaryService`, that will store the binary files and maintain reference with the model.
It will also deduplicate files so if someone had the same file, it will not be duplicated.

Add the following configuration to your `webda.config.json`

```js title="webda.config.json"
{
    "services": {
        ...
        "Binary": {
            "type": "FileBinary",
            "folder": "./binaries",
            "models": {
            "_": ["_"]
            },
            "url": "/"
        },
        ...
    }
}
```

Then add the following to your `Contact` model:

```typescript title="src/models/contact.ts"
import { Binaries, Expose, OwnerModel } from "@webda/core";
...
export class Contact extends OwnerModel {
  ...
  /**
   * Photos of the contact
   */
  photos: Binaries;
}
```

If you want to only store one file, you can use `Binary` instead of `Binaries`.
You can now upload a photo to your contact, it will be stored in the `binaries` folder.

We now have new routes:

- `/contacts/{uuid}/photos`
- `/contacts/{uuid}/photos/{index}`
- `/contacts/{uuid}/photos/{index}/{hash}`

These are the route to manage upload and download of the photos.

Webda uses a challenge mechanism to upload files, so you need to call the `/contacts/{uuid}/photos` route to get a challenge.
Then you can upload the file with the challenge, or not if the file is already on our servers.
It also allows direct upload to AWS S3 or Google Cloud Storage.

To allow the frontend application to know that we now have photos available, let's add a route /contacts/version that will return the version of the model.

```js title="src/models/contact.ts"
import { Action, Binaries, Expose, OwnerModel, WebContext } from "@webda/core";
...

export class Contact extends OwnerModel {
  ...
  @Action({
    methods: ["GET"],
  })
  static async version(context: WebContext): Promise<void> {
    context.write({
      version: 2,
      photos: true
    });
  }
  ...
}
```

Refresh the app, it should now display the photos upload form and the photos.

## Deploy

Let's deploy our application.

### AWS

Currently our application stores all data within the memory, so we need to switch to DynamoDB.

Create a deployment `deployments/aws.json`:

```js title="deployments/aws.json"
{
  "services": {
    "Registry": {
      "type": "Webda/DynamoDB",
      "table": "contacts-application"
    }
  }
}
```

### Kubernetes

Let's deploy our application within Kubernetes

Create a deployment `deployments/kubernetes.json`:

```js title="deployments/kubernetes.json"
{
  "services": {
    "Registry": {
      "type": "Webda/DynamoDB",
      "table": "contacts-application"
    }
  }
}
```

## Conclusion

You can continue this by adding a more secure API with `@webda/hawk`, add metrics for your application.
You can also add elasticsearch to your application to allow full-text search with `@webda/elasticsearch`.

### Prometheus metrics

```js title="webda.config.json"
{
    "services": {
        ...
        "PrometheusService": {
            "type": "Webda/PrometheusService",
            "portNumber": "9090"
        }
        ...
    }
}
```

## Next tutorials

- Add thumbnails generation via asynchronous tasks
- Add a send email feature
- Serve the ui
- Add websockets
