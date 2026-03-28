import { Model, RelationAttributes, ManyToMany, ModelLinker, OneToMany, Storable, UuidModel, WEBDA_PRIMARY_KEY } from "@webda/models";
import { FilterAttributes } from "@webda/tsc-esm";




type RevertRelation<T extends Storable,
  L extends Storable,
  K extends FilterAttributes<T, ModelLinker<L>>> = OneToMany<T, K, L>;
  
type RevertMany<T extends Storable,
  L extends Storable,
  K extends FilterAttributes<T, ModelLinker<L>>> = ManyToMany<T, T[K][typeof RelationAttributes]>;

class Order extends UuidModel {
  products!: ManyToMany<Product, {
    price: number;
    quantity: number;
    yann: boolean;
  }>;
}

class Product extends UuidModel {
  orders!: RevertMany<Order, Product, "products">;
}

const p = new Product();
p.orders[0].get();


class OrderProduct extends Model {
    order!: ModelLinker<Order>;
    product!: ModelLinker<Product>;
    price: number
    quantity: number;
    yann: boolean;
    [WEBDA_PRIMARY_KEY] = ["order", "product"] as const;

}

class Order2 extends UuidModel {
    products!: OneToMany<OrderProduct, Order, "order">;
}

class Product2 extends UuidModel {
    orders!: OneToMany<OrderProduct, Product, "product">;
}