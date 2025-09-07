import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Readable } from "stream";
import { streamToBuffer } from "../lib";

@suite
class ReadableFrom {
    @test
    async "should create a readable stream from a buffer"() {
        const buffer = Buffer.from("Hello World");
        const stream = Readable.from(buffer);
        assert.deepStrictEqual(await streamToBuffer(stream), buffer);
    }
}