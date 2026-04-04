const config = {
  roots: ["src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          target: "es2022",
          module: "nodenext",
          moduleResolution: "nodenext",
          experimentalDecorators: false,
          esModuleInterop: true,
          verbatimModuleSyntax: false
        }
      }
    ]
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@webda)/)"
  ],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
};

export default config;
