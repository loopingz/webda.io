/* eslint-disable jsdoc/require-jsdoc */
import { Text } from "@react-email/components";

interface ConditionalProps {
  firstName: string;
  vip?: boolean;
  items: string[];
  locale?: string;
}

export default function Conditional({ firstName, vip, items, locale }: ConditionalProps) {
  return (
    <div>
      <Text>Hi {firstName}</Text>
      {vip && <Text>VIP</Text>}
      {items.map(i => (
        <Text key={i}>Item {i}</Text>
      ))}
      <Text>Locale: {locale}</Text>
    </div>
  );
}

Conditional.Subject = (p: ConditionalProps) => `Hello ${p.firstName}`;
