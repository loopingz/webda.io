import { Readable } from "node:stream";

/**
 * Replace name by a sanitized version
 * @param name
 * @returns
 */
export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Convert a stream to a buffer
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