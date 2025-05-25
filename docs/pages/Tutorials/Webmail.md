---
sidebar_position: 2 # Assuming it's the first tutorial after the index
title: Webmail Tutorial
---

# Building a Webmail Application with @webda

Welcome to the @webda Webmail tutorial! This guide will walk you through creating a basic webmail application.

## Prerequisites

*   Node.js (>= 16.0.0 recommended)
*   npm or yarn
*   Basic understanding of TypeScript and Node.js concepts.

## 1. Project Initialization

First, we'll create a new @webda project using the `@webda/shell`.

```bash
npx @webda/shell init webmail-app
cd webmail-app
```

This command initializes a new project in a directory named `webmail-app`. For our sample, this will correspond to the `samples/webmail/` directory in the repository.

*(More content will be added here for Models, Services, Configuration, etc.)*

## 2. Defining Core Models

For our webmail application, we'll need a few core models:

*   **User:** Represents a user account.
*   **Email:** Represents an email message.
*   **Folder:** Represents a mail folder (e.g., Inbox, Sent, Trash).

Let's define these in our `samples/webmail/src/models/` directory.

### a. User Model (`samples/webmail/src/models/User.ts`)

Create `User.ts` with the following content:

```typescript
import { CoreModel, OperationContext } from "@webda/core";

/**
 * @WebdaModel User
 * Represents a user in the webmail system.
 */
export class User extends CoreModel {
  email: string; // User's email address (unique identifier)
  name: string;  // User's display name
  // Add password handling in a real app (e.g., hashed password field)
  // For simplicity, we're omitting password complexity here.

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    // In a real application, implement proper access control.
    // For this tutorial, we allow all actions.
    return true;
  }
}
```

### b. Folder Model (`samples/webmail/src/models/Folder.ts`)

Create `Folder.ts` with the following content:

```typescript
import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { User } from "./User"; // Assuming User.ts is in the same directory

/**
 * @WebdaModel Folder
 * Represents a mail folder belonging to a user.
 */
export class Folder extends CoreModel {
  name: string; // Name of the folder (e.g., "Inbox", "Sent")
  userId: ModelLink<User>; // Link to the User who owns this folder

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true; // Keep it simple for the tutorial
  }
}
```

### c. Email Model (`samples/webmail/src/models/Email.ts`)

Create `Email.ts` with the following content:

```typescript
import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { User } from "./User";
import { Folder } from "./Folder";

/**
 * @WebdaModel Email
 * Represents an email message.
 */
export class Email extends CoreModel {
  subject: string;
  body: string;
  from: string; // Email address of the sender
  to: string[]; // Array of email addresses of recipients
  timestamp: Date;
  read: boolean;

  userId: ModelLink<User>; // Link to the User who owns this email
  folderId: ModelLink<Folder>; // Link to the Folder this email resides in

  // Consider adding cc, bcc, attachments etc. for a more complete model.

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true; // Keep it simple
  }
}
```

## 3. Setting up Stores

Now that we have our models, we need to tell @webda how to store them. We'll use `MemoryStore` for simplicity in this tutorial. This means data will be lost when the server stops, but it's great for development and testing.

Open `samples/webmail/webda.config.jsonc` and update the `services` section:

```jsonc
{
  // ... other configurations like $schema, version ...
  "services": {
    "users": {
      "model": "WebmailSample/User", // Ensure 'WebmailSample' matches your package.json webda.namespace
      "type": "MemoryStore",
      "expose": {
        "url": "/users" // Expose REST API at /users
      }
    },
    "folders": {
      "model": "WebmailSample/Folder",
      "type": "MemoryStore",
      "expose": {
        "url": "/folders"
      }
    },
    "emails": {
      "model": "WebmailSample/Email",
      "type": "MemoryStore",
      "expose": {
        "url": "/emails"
      }
    }
  },
  "parameters": {
    // ... existing parameters ...
  }
}
```
Make sure the `WebmailSample/User` (and others) correctly refers to the namespace you set in your `package.json` (`webda.namespace` field) followed by the model class name. If you used `"@webda/sample-webmail"` as name and didn't set a namespace, it might default differently. Check `samples/webmail/.webda-module-cache.json` after a build if unsure, or explicitly set `"webda.namespace": "WebmailSample"` in `package.json`. For this tutorial, we'll assume `WebmailSample` is the namespace.

*(Further sections will cover creating services for business logic, e.g., sending an email which might involve creating an Email record and placing it in the 'Sent' folder.)*

## 4. Creating a Service for Business Logic

While stores provide basic CRUD operations, most applications require more complex business logic. Let's create a `MailService` to handle the action of sending an email. For this tutorial, "sending" will mean creating appropriate `Email` records in the sender's "Sent" folder and the recipient's "Inbox".

### a. MailService (`samples/webmail/src/services/MailService.ts`)

Create a new file `MailService.ts` in `samples/webmail/src/services/` with the following content:

```typescript
import { Service, ServiceContext, Route, Inject, OperationContext } from '@webda/core';
import { User } from '../models/User';
import { Email } from '../models/Email';
import { Folder } from '../models/Folder';
import { MemoryStore } from '@webda/core'; // Assuming MemoryStore is used for direct access if needed

// A simple interface for our send email payload
interface ISendEmailPayload {
  fromUserId: string;
  toUserEmail: string; // For simplicity, we'll find the recipient by email
  subject: string;
  body: string;
}

export class MailService extends Service {
  @Inject('users') // Inject the 'users' store
  usersStore: MemoryStore<User>;

  @Inject('emails') // Inject the 'emails' store
  emailsStore: MemoryStore<Email>;

  @Inject('folders') // Inject the 'folders' store
  foldersStore: MemoryStore<Folder>;

  // Helper to find or create a folder
  private async findOrCreateFolder(userId: string, folderName: string): Promise<Folder> {
    let folder = await this.foldersStore.findOne({ userId, name: folderName });
    if (!folder) {
      // Folder names should ideally be constants or an enum
      const newFolderData: Partial<Folder> = { name: folderName, userId };
      folder = await this.foldersStore.create(newFolderData as Folder);
    }
    return folder;
  }

  @Route('/sendEmail', ['POST'])
  async sendEmailRoute(ctx: ServiceContext<ISendEmailPayload>) {
    const { fromUserId, toUserEmail, subject, body } = ctx.payload;

    if (!fromUserId || !toUserEmail || !subject || !body) {
      ctx.throw(400, 'Missing required fields for sending email.');
      return;
    }

    const fromUser = await this.usersStore.findById(fromUserId);
    if (!fromUser) {
      ctx.throw(404, `Sender user with ID ${fromUserId} not found.`);
      return;
    }

    const toUser = await this.usersStore.findOne({ email: toUserEmail });
    if (!toUser) {
      ctx.throw(404, `Recipient user with email ${toUserEmail} not found.`);
      return;
    }

    // 1. Get/Create Sent folder for sender
    const sentFolder = await this.findOrCreateFolder(fromUser.uuid, 'Sent');

    // 2. Get/Create Inbox folder for recipient
    const inboxFolder = await this.findOrCreateFolder(toUser.uuid, 'Inbox');

    // 3. Create Email record for sender (in Sent folder)
    const sentEmailData: Partial<Email> = {
      subject,
      body,
      from: fromUser.email,
      to: [toUser.email],
      timestamp: new Date(),
      read: true, // Sender's copy is read
      userId: fromUser.uuid,
      folderId: sentFolder.uuid,
    };
    const sentEmail = await this.emailsStore.create(sentEmailData as Email);

    // 4. Create Email record for recipient (in Inbox folder)
    const receivedEmailData: Partial<Email> = {
      subject,
      body,
      from: fromUser.email,
      to: [toUser.email],
      timestamp: new Date(),
      read: false, // Recipient's copy is unread
      userId: toUser.uuid,
      folderId: inboxFolder.uuid,
    };
    await this.emailsStore.create(receivedEmailData as Email);

    ctx.send({ message: 'Email sent successfully!', sentEmailId: sentEmail.uuid });
  }

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true; // Keep it simple
  }
}
```
This service does the following:
- Injects the stores for Users, Emails, and Folders.
- Provides a `findOrCreateFolder` helper.
- Defines a `/sendEmail` route that takes a payload with sender/recipient info and email content.
- Creates two email records: one for the sender's "Sent" folder and one for the recipient's "Inbox".

**Note:** This is a simplified implementation. A real application would have more robust error handling, user authentication/authorization, and potentially manage emails for users not yet in the system, etc.

### b. Registering the MailService

Now, let's add our new `MailService` to the `webda.config.jsonc` file in the `services` section:

```jsonc
{
  // ... $schema, version ...
  "services": {
    "users": { /* ...existing user store config... */ },
    "folders": { /* ...existing folder store config... */ },
    "emails": { /* ...existing email store config... */ },

    "mailService": { // Add this block
      "type": "WebmailSample/MailService" // Namespace/ClassName
    }
  },
  "parameters": { /* ...existing parameters... */ }
}
```
With this, @webda will instantiate and make our `MailService` available, including its `/sendEmail` route.

## 5. Running and Testing (Brief Overview)

To run your @webda application:

```bash
# From within the samples/webmail/ directory
npm start 
# or if you don't have a start script, use webda serve
# npx webda serve (if @webda/shell is global or in project devDependencies)
# ./node_modules/.bin/webda serve (if @webda/shell is local)
```

You would then use a tool like Postman or curl to:
1. Create a couple of users via the `POST /users` endpoint (e.g., userA, userB).
2. Call the `POST /sendEmail` endpoint provided by `MailService` with payload like:
   `{ "fromUserId": "<userA_uuid>", "toUserEmail": "<userB_email>", "subject": "Hello", "body": "World" }`
3. Check `GET /emails?userId=<userA_uuid>&folderId=<userA_sent_folder_uuid>`
4. Check `GET /emails?userId=<userB_uuid>&folderId=<userB_inbox_folder_uuid>`

*(This concludes the basic structure of the Webmail tutorial. Further enhancements could include user authentication, more complex email operations, UI integration etc.)*
