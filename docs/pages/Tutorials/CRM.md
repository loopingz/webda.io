---
sidebar_position: 3 # Assuming it's the second tutorial
title: CRM Tutorial
---

# Building a CRM with @webda

Welcome to the @webda CRM (Customer Relationship Management) tutorial! This guide will walk you through creating a basic CRM application to manage contacts, companies, and opportunities.

## Prerequisites

*   Node.js (>= 16.0.0 recommended)
*   npm or yarn
*   Basic understanding of TypeScript and Node.js concepts.

## 1. Project Initialization

Similar to other @webda projects, we would typically use `npx @webda/shell init crm-app`.
For our sample project (`samples/crm/`), we will manually scaffold it based on the `sample-app` due to limitations with the `init` command in some environments. This process involves copying `sample-app`, cleaning it up, and tailoring it for the CRM.

*(More content will be added here for Models, Services, Configuration, etc.)*

## 2. Defining Core Models

For our CRM, we'll focus on these core entities:

*   **User:** Represents a CRM user (e.g., sales representative).
*   **Company:** Represents a company that is a client or prospect.
*   **Contact:** Represents an individual associated with a company or as an independent contact.
*   **Opportunity:** Represents a potential sales deal.

Let's define these in `samples/crm/src/models/`.

### a. User Model (`samples/crm/src/models/User.ts`)
(Similar to the Webmail tutorial User, for simplicity, or could be more CRM-specific if needed)

Create `User.ts`:
```typescript
import { CoreModel, OperationContext } from "@webda/core";

/**
 * @WebdaModel User
 * Represents a user in the CRM system.
 */
export class User extends CoreModel {
  email: string;
  name: string;

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
```

### b. Company Model (`samples/crm/src/models/Company.ts`)
(Adapted from the existing `sample-app` Company model)

Create `Company.ts`:
```typescript
import { CoreModel, OperationContext, ModelRelated } from "@webda/core";
import { Contact } from './Contact'; // Forward declaration
import { Opportunity } from './Opportunity'; // Forward declaration

/**
 * @WebdaModel Company
 * @WebdaPlural Companies
 * Represents a company in the CRM.
 */
export class Company extends CoreModel {
  name: string;
  address?: string;
  website?: string;
  phone?: string;

  // Relationships
  // contacts: ModelRelated<Contact, "companyId">; // A company can have multiple contacts
  // opportunities: ModelRelated<Opportunity, "companyId">; // A company can have multiple opportunities


  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
```
*Note: `ModelRelated` typically requires the foreign key to be on the other model. We'll define `companyId` on Contact and Opportunity.*

### c. Contact Model (`samples/crm/src/models/Contact.ts`)
(Adapted from the existing `sample-app` Contact model)

Create `Contact.ts`:
```typescript
import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { Company } from "./Company";
import { User } from "./User";

/**
 * @WebdaModel Contact
 * Represents an individual contact in the CRM.
 */
export class Contact extends CoreModel {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string; // Job title

  companyId?: ModelLink<Company>; // Link to the company this contact belongs to
  assignedToUserId?: ModelLink<User>; // Link to the CRM user responsible for this contact

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
```

### d. Opportunity Model (`samples/crm/src/models/Opportunity.ts`)

Create `Opportunity.ts`:
```typescript
import { CoreModel, ModelLink, OperationContext } from "@webda/core";
import { Company } from "./Company";
import { User } from "./User";
import { Contact }from "./Contact";

export type OpportunityStage = "Prospecting" | "Qualification" | "Proposal" | "Closing" | "Won" | "Lost";

/**
 * @WebdaModel Opportunity
 * Represents a sales opportunity.
 */
export class Opportunity extends CoreModel {
  name: string;
  stage: OpportunityStage;
  amount: number;
  closeDate: Date; // Expected close date

  companyId: ModelLink<Company>; // Link to the company this opportunity is for
  primaryContactId?: ModelLink<Contact>; // Optional: main contact for this opportunity
  assignedToUserId: ModelLink<User>; // Link to the CRM user responsible

  async canAct(_ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
    return true;
  }
}
```

## 3. Setting up Stores

Configure `MemoryStore` for these models in `samples/crm/webda.config.jsonc`:

```jsonc
{
  // ... other configurations ...
  "services": {
    "users": {
      "model": "CRMSample/User",
      "type": "MemoryStore",
      "expose": { "url": "/users" }
    },
    "companies": {
      "model": "CRMSample/Company",
      "type": "MemoryStore",
      "expose": { "url": "/companies" }
    },
    "contacts": {
      "model": "CRMSample/Contact",
      "type": "MemoryStore",
      "expose": { "url": "/contacts" }
    },
    "opportunities": {
      "model": "CRMSample/Opportunity",
      "type": "MemoryStore",
      "expose": { "url": "/opportunities" }
    }
  },
  "parameters": {
    // ... existing parameters ...
  }
}
```
Ensure `CRMSample/User` (and others) matches your `package.json`'s `webda.namespace`.

*(Further sections can cover business logic, like linking a new contact to a company, or advancing an opportunity's stage.)*
