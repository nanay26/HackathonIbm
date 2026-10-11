/** @type {import("eslint").Linter.Config} */
const config = {
  extends: ["next/core-web-vitals", "next/typescript"],
  rules: {
    // Enforce no dangerouslySetInnerHTML (SDD §5.5 / Prinsip 6)
    "react/no-danger": "error",
  },
};

module.exports = config;
