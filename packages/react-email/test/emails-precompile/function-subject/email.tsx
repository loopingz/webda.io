/* eslint-disable jsdoc/require-jsdoc */
export default function FunctionSubject({ firstName }: { firstName?: string }) {
  return <p>Hi {firstName}</p>;
}

FunctionSubject.PreviewProps = { firstName: "Marie" };
FunctionSubject.Subject = (p: { firstName?: string }) => `Hi ${p.firstName}`;
