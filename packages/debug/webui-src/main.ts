// Entry of the bundled dashboard served by `webda debug --web --local`.
// Everything is inlined by Vite: no CDN, no web font, works offline.
import "@webda/debug-ui/tokens.css";
import "@webda/debug-ui/styles.css";
import { mountStandalone } from "@webda/debug-ui/standalone";

mountStandalone();
