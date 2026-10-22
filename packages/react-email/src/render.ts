import { pretty as prettify, render, toPlainText } from "@react-email/render";
import { createElement } from "react";
import type { EmailComponent } from "./loader.js";

/**
 * Options of {@link renderEmail}
 */
export interface RenderEmailOptions {
  /**
   * Pretty print the html
   * @default false
   */
  pretty?: boolean;
  /**
   * Replace `&#x27;` by `'` in the html
   * @default true
   */
  fixApostrophes?: boolean;
}

/**
 * A rendered email
 */
export interface RenderedEmail {
  html: string;
  text: string;
  subject?: string;
}

/**
 * Render an email component into html, text and subject
 *
 * @param component - the email component
 * @param props - the component props
 * @param options - render options
 * @returns the rendered email
 */
export async function renderEmail(
  component: EmailComponent,
  props: any,
  options: RenderEmailOptions = {}
): Promise<RenderedEmail> {
  const raw = await render(createElement(component, props));
  const text = component.Text ? component.Text(props) : toPlainText(raw);
  let html = options.pretty ? await prettify(raw) : raw;
  if (options.fixApostrophes !== false) {
    html = html.replaceAll("&#x27;", "'");
  }
  const subject = typeof component.Subject === "function" ? component.Subject(props) : component.Subject;
  return { html, text, subject };
}
