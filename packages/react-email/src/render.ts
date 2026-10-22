import { pretty as prettify, toPlainText } from "@react-email/render";
import { Suspense, createElement, type ReactElement } from "react";
import type { EmailComponent } from "./loader.js";

/**
 * The part of `react-dom/server` used here (react-dom ships no typings)
 */
interface ReactDomServer {
  renderToReadableStream(
    element: ReactElement,
    options: { progressiveChunkSize: number; onError: (error: unknown) => void }
  ): Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }>;
}

const REACT_DOM_SERVER = "react-dom/server";

/**
 * The doctype `@react-email/render` puts in front of the html
 */
const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/**
 * Render a React element to html like `render` of `@react-email/render`, but failing on a render error
 *
 * `@react-email/render` does not pass `onError`: a component throwing in its body makes React fall back to
 * client rendering, so the render resolves with an empty boundary and only logs the error. Here the first
 * error is thrown instead, and nothing is logged.
 *
 * @param element - the element
 * @returns the html document
 */
export async function renderToHtml(element: ReactElement): Promise<string> {
  const server: ReactDomServer = await import(REACT_DOM_SERVER);
  const errors: unknown[] = [];
  const stream = await server.renderToReadableStream(createElement(Suspense, null, element), {
    progressiveChunkSize: Number.POSITIVE_INFINITY,
    onError: function onError(error: unknown) {
      errors.push(error);
    }
  });
  await stream.allReady;
  let html = "";
  const decoder = new TextDecoder("utf-8");
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    html += decoder.decode(chunk, { stream: true });
  }
  html += decoder.decode();
  if (errors.length > 0) {
    throw errors[0];
  }
  return `${DOCTYPE}${html.replace(/<!DOCTYPE.*?>/, "")}`;
}

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
  const raw = await renderToHtml(createElement(component, props));
  const text = component.Text ? component.Text(props) : toPlainText(raw);
  let html = options.pretty ? await prettify(raw) : raw;
  if (options.fixApostrophes !== false) {
    html = html.replaceAll("&#x27;", "'");
  }
  const subject = typeof component.Subject === "function" ? component.Subject(props) : component.Subject;
  return { html, text, subject };
}
