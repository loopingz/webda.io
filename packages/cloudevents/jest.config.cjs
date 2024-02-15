module.exports = {
  roots: ["src"],
  preset: "ts-jest/presets/default-esm",
  testMatch: ["**/?(*.)+(spec|test).+(ts|tsx|js)"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
        useESM: true
      }
    ]
  },
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.ts", "!src/models/filters/sql/CESQL*.ts"],
  coverageReporters: ["json", "html", "text"],
  extensionsToTreatAsEsm: [".ts"]
};
