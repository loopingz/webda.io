/* eslint-disable jsdoc/require-jsdoc */
// Throws in its render body: React would fall back to client rendering and resolve
export default function Kaboom({ name }: { name?: string }): never {
  throw new Error(`kaboom ${name}`);
}

Kaboom.PreviewProps = { name: "Marie" };
Kaboom.Subject = "Kaboom";
