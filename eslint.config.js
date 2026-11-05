import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "index.html", "extensions/**"] },
  ...tseslint.configs.recommended,
);
