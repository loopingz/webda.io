/* eslint-disable jsdoc/require-jsdoc */
export default function Boom({ name }: { name?: string }) {
  return <p>Hi {name}</p>;
}

Boom.PreviewProps = { name: "Marie" };
// The failure is in Subject, see test/emails-throwing for a component throwing in its render body
Boom.Subject = (p: { name?: string }): string => {
  throw new Error(`boom ${p.name}`);
};
