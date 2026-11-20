import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/*
 * eslint-config-next already registers the jsx-a11y plugin with a handful of
 * its rules. We reuse that registration (declaring the plugin twice would
 * clash) and turn on the full recommended set: errors in the shared design
 * layer, warnings in pages so no team is blocked while it catches up.
 */
const a11yRecommended = jsxA11y.flatConfigs.recommended.rules;
const isOff = (setting) => (Array.isArray(setting) ? setting[0] : setting) === "off";
const a11yAsWarnings = Object.fromEntries(
  Object.entries(a11yRecommended)
    // Rules the recommended set switches off (label-has-for, control-has-associated-label,
    // anchor-ambiguous-text) stay off: label-has-for is deprecated and would flag every
    // <label htmlFor> around an <Input>.
    .filter(([, setting]) => !isOff(setting))
    .map(([rule, setting]) => [
      rule,
      Array.isArray(setting) ? ["warn", ...setting.slice(1)] : "warn",
    ]),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    // Separate workspace packages with their own tooling.
    "contracts/**",
    "verifier/**",
    ".claude/**",
  ]),
  {
    files: ["src/**/*.tsx"],
    rules: a11yAsWarnings,
  },
  {
    // The design foundation must be clean: everything else is built from it.
    files: [
      "src/components/ui/**/*.tsx",
      "src/components/media/**/*.tsx",
      "src/components/chrome.tsx",
      "src/app/layout.tsx",
    ],
    rules: a11yRecommended,
  },
  {
    // Shared contracts must stay dependency-free of any team's implementation.
    files: ["src/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/app/*",
            "@/components/*",
            "@/server/*",
            "@/blockchain/*",
            "next",
            "next/*",
            "react",
          ],
        },
      ],
    },
  },
  {
    // UI must never reach into server or chain code; it goes through the HTTP API.
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/server/*", "@/blockchain/*"] }],
    },
  },
]);

export default eslintConfig;
