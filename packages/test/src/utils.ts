/**
 * Consume an async iterator and return an array
 *
 * Useful for testing but should not be used in production
 * @param iterator
 * @returns
 */
export async function consumeAsyncIterator<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const res = [];
  for await (const item of iterator) {
    // Consume the iterator
    res.push(item);
  }
  return res;
}

/**
 * Consume an iterator and return an array
 *
 * Useful for testing but should not be used in production
 * @param iterator
 * @returns
 */
export function consumeIterator<T>(iterator: Iterable<T>): T[] {
  const res = [];
  for (const item of iterator) {
    // Consume the iterator
    res.push(item);
  }
  return res;
}
