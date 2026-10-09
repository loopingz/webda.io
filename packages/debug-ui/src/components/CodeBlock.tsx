import React, { useMemo } from "react";

/** A token of the highlighter. */
export interface CodeToken {
  type: "comment" | "string" | "keyword" | "number" | "ident" | "punct";
  value: string;
}

const KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "from",
  "true",
  "false",
  "null",
  "undefined"
]);

/**
 * Lightweight JavaScript tokenizer: comments, strings, keywords, numbers, punctuation.
 *
 * @param code - the source
 * @returns the tokens
 */
export function highlightJS(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      tokens.push({ type: "comment", value: code.slice(i, end === -1 ? undefined : end) });
      i = end === -1 ? code.length : end;
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      tokens.push({ type: "comment", value: code.slice(i, end === -1 ? undefined : end + 2) });
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === "`") {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(code[i]) && (i === 0 || /[^a-zA-Z_$]/.test(code[i - 1]))) {
      let j = i;
      while (j < code.length && /[0-9a-fA-FxXoObBeE._n]/.test(code[j])) j++;
      tokens.push({ type: "number", value: code.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? "keyword" : "ident", value: word });
      i = j;
      continue;
    }
    tokens.push({ type: "punct", value: code[i] });
    i++;
  }
  return tokens;
}

/**
 * Syntax-highlighted code block without external dependencies.
 *
 * @param props - the source
 * @returns the preformatted element
 */
export function CodeBlock(props: { code: string }): React.JSX.Element {
  const tokens = useMemo(() => highlightJS(props.code), [props.code]);
  return (
    <pre className="wdbg-code">
      <code>
        {tokens.map((t, i) =>
          t.type === "ident" || t.type === "punct" ? (
            t.value
          ) : (
            <span key={i} className={`wdbg-hl-${t.type}`}>
              {t.value}
            </span>
          )
        )}
      </code>
    </pre>
  );
}
