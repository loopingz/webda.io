/* eslint-disable jsdoc/require-jsdoc */
import { Text } from "@react-email/components";

export let renders = 0;

export default function Counter() {
  renders++;
  // The module is loaded with a cache-busting query: expose the count globally for tests
  (globalThis as any).__emailRenders = ((globalThis as any).__emailRenders ?? 0) + 1;
  return <Text>Counter</Text>;
}

Counter.Subject = "Counter";
