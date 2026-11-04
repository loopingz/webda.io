/* eslint-disable jsdoc/require-jsdoc */
import { Text } from "@react-email/components";

export default function Welcome({ name }: { name?: string }) {
  return <Text>Welcome {name}</Text>;
}
