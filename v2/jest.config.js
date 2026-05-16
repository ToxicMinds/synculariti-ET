const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "jsdom",
  transform: {
    ...tsJestTransformCfg,
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/src/lib/mocks/styleMock.js"
  },
  projects: [
    {
      displayName: "frontend",
      testEnvironment: "jsdom",
      testMatch: [
        "<rootDir>/src/components/**/*.test.ts*", 
        "<rootDir>/src/modules/**/components/**/*.test.ts*", 
        "<rootDir>/src/modules/**/hooks/**/*.test.ts*",
        "<rootDir>/src/hooks/**/*.test.ts*"
      ],
      moduleNameMapper: { 
        "^@/(.*)$": "<rootDir>/src/$1",
        "\\.css$": "<rootDir>/src/lib/mocks/styleMock.js"
      },
      transform: { ...tsJestTransformCfg }
    },
    {
      displayName: "backend",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/app/api/**/*.test.ts*", "<rootDir>/src/lib/**/*.test.ts*"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
      transform: { ...tsJestTransformCfg }
    }
  ]
};