/* eslint-disable jsdoc/require-jsdoc */
export default function Boom({ name }: { name?: string }) {
  return <p>Hi {name}</p>;
}

Boom.PreviewProps = { name: "Marie" };
// A throwing component does not fail the render: React falls back to client rendering, so the failure is in Subject
Boom.Subject = (p: { name?: string }): string => {
  throw new Error(`boom ${p.name}`);
};
