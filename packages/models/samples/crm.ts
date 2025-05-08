import { Actionable, ActionsEnum, ActionWrapper, DeactivateActions } from "../src/actionable";
import { Model, ModelEvents, UuidModel } from "../src/model";
import { ModelLinksArray, ModelLinksMap, ModelLinksSimpleArray, ModelParent, ModelRelated } from "../src/relations";
import { JSONed, JSONedAttributes, PrimaryKeyType } from "../src/storable";

class Customer extends Model {
  // Define the primary key for the Customer model
  PrimaryKey = ["country", "identifier"] as const;

  // Delare events
  declare Events: ModelEvents<this> & {
    Created: { customer: Customer };
    Updated: { customer: Customer };
  };

  // Define the attributes of the Customer model
  country: string;
  identifier: string;
  name: string;
  email: PrimaryKeyType<Email>;
  categories: string[];

  // Define the relations of the Customer model
  invoices: ModelRelated<Invoice>;
}

class Invoice extends UuidModel {
  amount: number;
  customer: ModelParent<Customer>;
  items: ModelLinksMap<
    Product,
    {
      quantity: number;
      price: number;
    },
    "name" | "description"
  >;
  items2: ModelLinksMap<Product, { quantity: number; price: number }>;
  items3: ModelLinksArray<Product, { name: string; description: string }>;
  items4: ModelLinksSimpleArray<Product>;
}

new Invoice().items.add({
  name: "test",
  description: "test",
  quantity: 1,
  price: 10,
  uuid: "1234"
});
new Invoice().items2.add({
  price: 10,
  quantity: 1,
  uuid: "1234"
});

const ref = Invoice.ref("1234");
ref.incrementAttribute("amount", 10);
ref.incrementAttributes(["amount"]);
ref.incrementAttributes([{ property: "amount", value: 5 }]);
ref.incrementAttributes({
  amount: 5
});
ref.setAttribute("amount", 12);

const testJsoned: JSONed<Invoice> = {
  uuid: "1234",
  amount: 10,
  customer: {
    country: "fr",
    identifier: "1234"
  },
  items: {
    "1234": {
      quantity: 1,
      price: 10,
      name: "test",
      description: "test"
    }
  },
  items2: {
    "1234": {
      quantity: 1,
      price: 10
    }
  },
  items3: [
    {
      uuid: "1234",
      name: "test",
      description: "test"
    }
  ],
  items4: ["1234", "5678"]
};

export class Product extends UuidModel {
  name: string;
  price: number;
  description: string;
  inStock: number;
  totalSold: number;
}

class Contact extends Model {
  PrimaryKey = ["email"] as const;
  name: string;
  email: string;
}

class Email extends UuidModel {
  recipents: string[];
  contacts: ModelLinksArray<Contact, "email">;
}

export class MFA implements Actionable {
  secret: string;
  verify = ActionWrapper(async (code: string) => {
    return true;
  }, "Verify a MFA code");
  confirm = ActionWrapper(async (code: string, code2: string, secret: string) => {
    return true;
  }, "Set a MFA secret");

  toDTO() {
    return {
      enabled: this.secret !== undefined
    };
  }

  fromDTO(dto: any): void {}
}

class User extends UuidModel {
  declare Events: ModelEvents<this> & {
    Login: { user: User };
    Logout: { user: User };
  };

  name: string;
  email: string;
  mfa: MFA;
  readonly_mfa: DeactivateActions<MFA, "confirm">;
  loginCount: number;

  logout = ActionWrapper(async () => {
    return true;
  }, "Logout the user");

  async canAct(action: ActionsEnum<User>): Promise<boolean | string> {
    if (action === "mfa.confirm") {
      return true;
    } else if (action === "mfa.verify" || action === "readonly_mfa.verify") {
      return true;
    } else if (action === "logout") {
      return true;
    }
    return super.canAct(action);
  }
}

const userRepo = User.getRepository();
userRepo.incrementAttribute("myUser", "loginCount");
userRepo.on("Saved", model => {});
userRepo.on("Login", model => {});
const user = await userRepo.get("myUser");

const invoice = new Invoice();
const customerId = invoice.customer.getPrimaryKey();
const customer = await invoice.customer.get();
customer.invoices.query("");
Invoice.ref("1234");
Customer.ref({
  country: "fr",
  identifier: "1234"
}).create({
  name: "John Doe",
  email: "",
  categories: []
});

class GithubIssue extends Model {
  id: number;
  public PrimaryKey = ["id"] as const;

  toJSON(): JSONedAttributes<this> {
    return <JSONedAttributes<this>>this;
  }
  /*
  toJSON(): {
    toto: number;
  } {
    return {
      toto: this.id
    };
  }
  

  toDTO() {
    return {};
  }
    */
}

const jsoned: JSONed<GithubIssue> = {
  id: 1
};

const test2 = new GithubIssue().getPrimaryKey();
