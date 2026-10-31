/* eslint-disable jsdoc/require-jsdoc */
export default function ObjectProps({ items }: { items?: string[] }) {
  return (
    <ul>
      {(items || []).map(i => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

ObjectProps.PreviewProps = { items: ["a"] };
ObjectProps.Subject = "Object props";
