import { Readable } from "node:stream";

/**
 * Replace every character in `name` that is not alphanumeric or `_` with `_`.
 *
 * @param name - The original string to sanitize.
 * @returns A filename-safe version of `name`.
 */
export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Collect all chunks from a Readable stream and concatenate them into a single Buffer.
 *
 * @param stream - The Readable stream to consume.
 * @returns A Promise that resolves with the concatenated Buffer, or rejects on stream error.
 */
export function streamToBuffer(stream: Readable): Promise<Buffer> {
  // codesnippet from https://stackoverflow.com/questions/14269233/node-js-how-to-read-a-stream-into-a-buffer
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
    stream.on("error", err => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
