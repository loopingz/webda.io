/* eslint-disable jsdoc/require-jsdoc */
export default function Greeting({ firstName, locale }: { firstName?: string; locale?: string }) {
  return (
    <p>
      Salut {firstName} ({locale})
    </p>
  );
}

Greeting.PreviewProps = { firstName: "Marie" };
Greeting.Subject = "Salut";
