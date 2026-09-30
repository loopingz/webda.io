const config = {
  roots: ["src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": "<rootDir>/jest.transform.mjs"
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@webda)/)"
  ],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
};

export default config;
