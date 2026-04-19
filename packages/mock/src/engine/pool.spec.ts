import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { SessionPool } from "./pool.js";

class User {
  constructor(public id: string) {}
}
class Order {
  constructor(public id: string) {}
}

@suite("SessionPool")
class SessionPoolTest {
  @test({ name: "pickOne returns null on empty pool" })
  pickOneEmpty() {
    const pool = new SessionPool(() => 0.5);
    expect(pool.pickOne(User)).toBeNull();
  }

  @test({ name: "add + pickOne returns an instance of the requested class" })
  pickOneAfterAdd() {
    const pool = new SessionPool(() => 0.5);
    const u = new User("a");
    pool.add(u);
    expect(pool.pickOne(User)).toBe(u);
  }

  @test({ name: "pickOne by class only — Order in pool is not returned for User" })
  filtersByClass() {
    const pool = new SessionPool(() => 0.5);
    pool.add(new Order("o1"));
    expect(pool.pickOne(User)).toBeNull();
  }

  @test({ name: "pickMany returns unique subset of requested size" })
  pickManyUnique() {
    let i = 0;
    const rng = () => [0.1, 0.5, 0.9, 0.3, 0.7][i++ % 5];
    const pool = new SessionPool(rng);
    const us = [new User("a"), new User("b"), new User("c"), new User("d"), new User("e")];
    us.forEach(u => pool.add(u));
    const picked = pool.pickMany(User, 3);
    expect(picked.length).toBe(3);
    expect(new Set(picked).size).toBe(3);
  }

  @test({ name: "pickMany clamps at available pool size" })
  pickManyClamp() {
    const pool = new SessionPool(() => 0.1);
    pool.add(new User("a"));
    pool.add(new User("b"));
    expect(pool.pickMany(User, 10).length).toBe(2);
  }
}
