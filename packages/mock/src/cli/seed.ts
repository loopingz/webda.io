export type SeedParsed = {
  spec: Record<string, number>;
  specPath?: string;
  options: {
    seed?: number;
    mode?: "test" | "dev" | "demo" | "load" | "custom";
    disableAi?: boolean;
  };
};

/**
 * Parse `webda mock seed` argv. Recognises:
 *   --ModelName N         count for a model
 *   --seed N              deterministic seed
 *   --mode dev|demo|…
 *   --ai | --no-ai        enable / disable AI provider
 *   --spec ./file.json    alternate source for model counts
 */
export function parseSeedArgs(argv: string[]): SeedParsed {
  const out: SeedParsed = { spec: {}, options: {} };
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    if (flag === "--seed") {
      out.options.seed = Number(argv[++i]);
    } else if (flag === "--mode") {
      out.options.mode = argv[++i] as SeedParsed["options"]["mode"];
    } else if (flag === "--no-ai") {
      out.options.disableAi = true;
    } else if (flag === "--ai") {
      out.options.disableAi = false;
    } else if (flag === "--spec") {
      out.specPath = argv[++i];
    } else if (flag.startsWith("--")) {
      const name = flag.slice(2);
      const value = argv[++i];
      const n = Number(value);
      if (!Number.isNaN(n)) out.spec[name] = n;
    }
    i++;
  }
  return out;
}
