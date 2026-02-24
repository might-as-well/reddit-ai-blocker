/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  watchman: false,
  testMatch: ["**/test/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^preact$": "<rootDir>/node_modules/preact/dist/preact.js",
    "^preact/hooks$": "<rootDir>/node_modules/preact/hooks/dist/hooks.js",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};
