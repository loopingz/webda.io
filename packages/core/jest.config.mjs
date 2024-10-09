const config = {
  roots: ["src"],
  preset: "ts-jest/presets/default-esm",
  testMatch: ["**/?(*.)+(spec|test).+(ts|tsx|js)"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
        isolatedModules: true,
        useESM: true
      }
    ]
  },
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts"],
  coverageReporters: ["json", "html", "text"],
  extensionsToTreatAsEsm: [".ts"]
};

export default config;
