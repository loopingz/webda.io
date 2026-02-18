import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Readable } from "stream";
import { streamToBuffer, sanitizeFilename } from "./stream";

@suite
export class StreamTest {
    @test
    async "should create a readable stream from a buffer"() {
        const buffer = Buffer.from("Hello World");
        const stream = Readable.from(buffer);
        assert.deepStrictEqual(await streamToBuffer(stream), buffer);
    }

    @test
    async "should handle stream errors"() {
        const stream = new Readable({
            read() {
                this.emit("error", new Error("Stream error"));
            }
        });

        await assert.rejects(
            () => streamToBuffer(stream),
            /Stream error/
        );
    }

    @test
    async "should handle empty streams"() {
        const stream = Readable.from([]);
        const buffer = await streamToBuffer(stream);
        assert.strictEqual(buffer.length, 0);
    }

    @test
    async "should sanitize filenames"() {
        assert.strictEqual(sanitizeFilename("hello world.txt"), "hello_world_txt");
        assert.strictEqual(sanitizeFilename("file@#$%^&*().pdf"), "file__________pdf");
        assert.strictEqual(sanitizeFilename("normal_file123.txt"), "normal_file123_txt");
        assert.strictEqual(sanitizeFilename("../../../etc/passwd"), "_________etc_passwd");
        assert.strictEqual(sanitizeFilename("file with spaces"), "file_with_spaces");
    }
}
