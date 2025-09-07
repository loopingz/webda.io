import { suite, test, consumeAsyncIterator, consumeIterator } from "./index.js";

import * as assert from "assert";

@suite
class AsyncIteratorTest {
    async *generator() {
        yield 1;
        yield 2;
        yield 3;
    }

    *syncGenerator() {
        yield 1;
        yield 2;
        yield 3;
    }

    @test
    async consumeAsync() {
        const results = await consumeAsyncIterator(this.generator());
        assert.deepStrictEqual(results, [1, 2, 3]);
    }

    @test
    consumeSync() {
        const results = consumeIterator(this.syncGenerator());
        assert.deepStrictEqual(results, [1, 2, 3]);
    }
}