import { pretty, render, toPlainText } from "@react-email/render";

/**
 * The littlefrenchies `email-renderer.ts` loop body as a function, used as the test oracle.
 *
 * It works on a `structuredClone` of `PreviewProps` (the legacy script mutates it in place).
 *
 * @param emailTemplate - the email component (default export)
 * @returns the rendered html, text and subject
 */
export async function legacyRender(emailTemplate: any): Promise<{ html: string; text: string; subject: string }> {
  const props = structuredClone(emailTemplate.PreviewProps || {});
  for (const key in props) {
    props[key] = `{{{${key}}}}`;
  }
  const res = emailTemplate(props);
  const html = await render(res);
  const text = toPlainText(html);
  const prettyHtml = (await pretty(html)).replaceAll("&#x27;", "'");
  return { html: prettyHtml, text, subject: emailTemplate.Subject || "No Subject" };
}
