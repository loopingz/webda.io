/* eslint-disable jsdoc/require-jsdoc */
import { Text } from "@react-email/components";

export default function WithText({ firstName }: { firstName: string }) {
  return <Text>Hello {firstName}</Text>;
}

WithText.Text = (p: { firstName: string }) => `Plain ${p.firstName}`;
