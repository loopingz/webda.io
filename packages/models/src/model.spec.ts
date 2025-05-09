import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Model, UuidModel } from "./model";
import {
    JSONed,
    PK,
    Pojo,
    Repository,
    Storable,
    StorableAttributes,
} from "./storable";
import { ArrayElement } from "@webda/tsc-esm";

class TestModel extends Model {
    PrimaryKey = ["id", "name"] as const;
    id: string;
    name: string;
    age: number;
    email: string;
    createdAt: Date;
    updatedAt: Date;

    constructor() {
        super();
        this.id = "";
        this.name = "";
        this.age = 0;
        this.email = "";
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }
}

class SubClassModel extends UuidModel {
    
    name: string;
    
    constructor() {
        super();
        this.name = "";
    }
}

class MemoryRepository<T extends Storable> implements Repository<T> {
    private storage = new Map<string, T>();
    private events = new Map<keyof T["Events"], Set<(data: any) => void>>();

    fromUUID(uuid: string): PK<T, T["PrimaryKey"][number]> {
        return uuid as unknown as PK<T, T["PrimaryKey"][number]>;
    }

    private makeKey(
        pk: PK<T, T["PrimaryKey"][number]>
    ): string {
        return typeof pk === "object" ? JSON.stringify(pk) : String(pk);
    }

    async get(
        primaryKey: PK<T, T["PrimaryKey"][number]>
    ): Promise<T> {
        const key = this.makeKey(primaryKey);
        const item = this.storage.get(key);
        if (!item) throw new Error(`Not found: ${key}`);
        return item;
    }

    getPrimaryKey(object: any): PK<T, T["PrimaryKey"][number]> {
        const pkFields = (object.constructor.PrimaryKey ||
            []) as Array<keyof T>;
        if (pkFields.length === 0) {
            throw new Error("No primary key defined on model");
        }
        if (pkFields.length === 1) {
            return object[pkFields[0]] as PK<T, any>;
        }
        // composite key
        return pkFields.reduce((acc, field) => {
            (acc as any)[field] = object[field];
            return acc;
        }, {} as any);
    }

    async create(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        data: Pojo<T>
    ): Promise<T> {
        const key = this.makeKey(primaryKey);
        if (this.storage.has(key)) {
            throw new Error(`Already exists: ${key}`);
        }
        const item = { ...(data as any) } as T;
        // if composite PK, caller must include PK fields in data
        this.storage.set(key, item);
        return item;
    }

    async upsert(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        data: Pojo<T>
    ): Promise<T> {
        const key = this.makeKey(primaryKey);
        if (this.storage.has(key)) {
            const existing = this.storage.get(key)!;
            Object.assign(existing, data as any);
            return existing;
        }
        return this.create(primaryKey, data);
    }

    async update<K extends StorableAttributes<T, any>>(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        data: Pojo<T>,
        _conditionField?: K | null,
        _condition?: T[K]
    ): Promise<void> {
        const item = await this.get(primaryKey);
        Object.assign(item, data as any);
    }

    async patch<K extends StorableAttributes<T, any>>(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        data: Partial<Pojo<T>>,
        _conditionField?: K | null,
        _condition?: any
    ): Promise<void> {
        const item = await this.get(primaryKey);
        Object.assign(item, data as any);
    }

    async query(_q: string): Promise<T[]> {
        return Array.from(this.storage.values());
    }

    async *iterate(_q: string): AsyncGenerator<T> {
        for (const item of this.storage.values()) {
            yield item;
        }
    }

    async delete<K extends StorableAttributes<T, any>>(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        _conditionField?: K | null,
        _condition?: any
    ): Promise<void> {
        this.storage.delete(this.makeKey(primaryKey));
    }

    async exists(
        primaryKey: PK<T, T["PrimaryKey"][number]>
    ): Promise<boolean> {
        return this.storage.has(this.makeKey(primaryKey));
    }

    async incrementAttributes<
        K extends StorableAttributes<T, any>,
        L extends StorableAttributes<T, number>
    >(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        info: (L | { property: L; value?: number })[] | Record<L, number>,
        _conditionField?: K | null,
        _condition?: any
    ): Promise<void> {
        const item = await this.get(primaryKey);
        if (Array.isArray(info)) {
            for (const entry of info) {
                const prop =
                    typeof entry === "string" ? entry : (entry as any).property;
                const inc = typeof entry === "string" ? 1 : (entry as any).value ?? 1;
                (item as any)[prop] = ((item as any)[prop] || 0) + inc;
            }
        } else {
            for (const prop in info) {
                (item as any)[prop] = ((item as any)[prop] || 0) + info[prop]!;
            }
        }
    }

    async incrementAttribute<
        K extends StorableAttributes<T, any>,
        L extends StorableAttributes<T, number>
    >(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        info: L | { property: L; value?: number },
        _conditionField?: K | null,
        _condition?: any
    ): Promise<void> {
        await this.incrementAttributes(primaryKey, [info as any]);
    }

    async upsertItemToCollection<
        K extends StorableAttributes<T, any[]>,
        L extends keyof ArrayElement<T[K]>
    >(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        collection: K,
        item: ArrayElement<T[K]> | JSONed<ArrayElement<T[K]>>,
        index?: number,
        _itemWriteConditionField?: any,
        _itemWriteCondition?: any
    ): Promise<void> {
        const obj = await this.get(primaryKey);
        if (!(obj as any)[collection]) {
            (obj as any)[collection] = [];
        }
        const arr = (obj as any)[collection] as Array<any>;
        if (typeof index === "number") {
            arr[index] = item;
        } else {
            arr.push(item);
        }
    }

    async deleteItemFromCollection<
        K extends StorableAttributes<T, any[]>,
        L extends keyof ArrayElement<T[K]>
    >(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        collection: K,
        index: number,
        _itemWriteConditionField?: any,
        _itemWriteCondition?: any
    ): Promise<void> {
        const obj = await this.get(primaryKey);
        const arr = (obj as any)[collection] as Array<any>;
        if (Array.isArray(arr) && index >= 0 && index < arr.length) {
            arr.splice(index, 1);
        }
    }

    async removeAttribute<
        L extends StorableAttributes<T, any>,
        K extends StorableAttributes<T, any>
    >(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        attribute: K,
        _conditionField?: L | null,
        _condition?: any
    ): Promise<void> {
        const obj = await this.get(primaryKey);
        delete (obj as any)[attribute as string];
    }

    async setAttribute<
        K extends StorableAttributes<T, any>,
        L extends StorableAttributes<T, any>
    >(
        primaryKey: PK<T, T["PrimaryKey"][number]>,
        attribute: K,
        value: T[K],
        _conditionField?: L | null,
        _condition?: any
    ): Promise<void> {
        const obj = await this.get(primaryKey);
        (obj as any)[attribute as string] = value;
    }

    on<K extends keyof T["Events"]>(
        event: K,
        listener: (data: T["Events"][K]) => void
    ): void {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event)!.add(listener as any);
    }

    once<K extends keyof T["Events"]>(
        event: K,
        listener: (data: T["Events"][K]) => void
    ): void {
        const wrapper = (d: any) => {
            listener(d);
            this.off(event, wrapper as any);
        };
        this.on(event, wrapper as any);
    }

    off<K extends keyof T["Events"]>(
        event: K,
        listener: (data: T["Events"][K]) => void
    ): void {
        this.events.get(event)?.delete(listener as any);
    }

    // Optional: trigger events internally
    private emit<K extends keyof T["Events"]>(
        event: K,
        data: T["Events"][K]
    ): void {
        this.events.get(event)?.forEach((fn) => fn(data));
    }
}

@suite
class ModelTest {
    @test
    async repositories() {
        // Ensuring that the repositories are registered correctly
        const repo1 = new MemoryRepository<UuidModel>();
        const repo2 = new MemoryRepository<TestModel>();
        assert.throws(() => UuidModel.getRepository(), /No repository found/);
        UuidModel.registerRepository(repo1);
        TestModel.registerRepository(repo2);
        assert.strictEqual(UuidModel.getRepository(), repo1);
        assert.strictEqual(TestModel.getRepository(), repo2);
        assert.strictEqual(SubClassModel.getRepository(), repo1);
        assert.strictEqual(new SubClassModel().getRepository(), repo1);
        assert.strictEqual(new UuidModel().getRepository(), repo1);
        assert.strictEqual(new TestModel().getRepository(), repo2);
    }

    @test
    async basicMethods() {
        // Ensuring that the primary keys are set correctly
        const model = new TestModel();
        model.id = "123";
        model.name = "Test";
        const pk = model.getPrimaryKey();
        assert.strictEqual(pk.id, "123");
        assert.strictEqual(pk.name, "Test");
        assert.strictEqual(pk.toString(), "123_Test");
    
        const model2 = new UuidModel();
        model2.uuid = "456";
        assert.strictEqual(model2.getPrimaryKey(), "456");
        assert.strictEqual(await model2.canAct("" as never), false);
        assert.strictEqual(model2.toProxy(), model2);
    }
}