import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";
import { isRecord, isColor, resolveTokens } from "./tokens.ts";
import type { Source, Json } from "./tokens.ts";

export type Highlight = { color?: string; font_weight?: number; font_style?: string };
export type Theme = {
  name: string;
  appearance: "light" | "dark";
  style: Record<string, Json>;
  syntax: Record<string, Highlight>;
};
export type Family = {
  $schema: string;
  name: string;
  author: string;
  themes: Omit<Theme, "syntax">[];
};

const schema = "https://zed.dev/schema/themes/v0.2.0.json";
const root = new URL("../", import.meta.url);
const zedSchema = JSON.parse(
  await readFile(new URL("design-system/zed-schema.json", root), "utf8"),
);
// Zed tolerates unknown fields; authoring should catch typos rather than silently ignore them.
for (const definition of ["ThemeStyleContent", "HighlightStyleContent", "PlayerColorContent"]) {
  zedSchema.definitions[definition].additionalProperties = false;
}
const validator = new Ajv({ strict: false, allErrors: true });
const validateFamily = validator.compile(zedSchema);
export function compile(source: Source, mapping: unknown): { family: Family; themes: Theme[] } {
  assert(isRecord(mapping) && mapping.$schema === schema, "Expected the Zed v0.2.0 schema");
  assert(
    typeof mapping.name === "string" && typeof mapping.author === "string",
    "Missing family metadata",
  );
  assert(
    Array.isArray(mapping.themes) && mapping.themes.length === 2,
    "Expected light and dark themes",
  );
  const appearances = new Set<string>();
  const themes = mapping.themes.map((theme: unknown): Theme => {
    assert(isRecord(theme) && typeof theme.name === "string", "Missing theme name");
    const appearance = theme.appearance;
    assert(appearance === "light" || appearance === "dark", "Invalid theme appearance");
    assert(!appearances.has(appearance), `Duplicate theme appearance: ${appearance}`);
    appearances.add(appearance);
    const resolved = resolveTokens(theme.style, {
      ...source.typography,
      ...source.modes[appearance],
    });
    assert(isRecord(resolved) && isRecord(resolved.syntax), `Missing syntax in ${appearance}`);
    const syntax: Record<string, Highlight> = {};
    for (const [capture, treatment] of Object.entries(resolved.syntax)) {
      assert(isRecord(treatment), `Invalid syntax treatment: ${capture}`);
      assert(
        treatment.color === undefined || isColor(treatment.color),
        `Invalid syntax color: ${capture}`,
      );
      assert(
        treatment.font_weight === undefined ||
          (typeof treatment.font_weight === "number" &&
            Number.isInteger(treatment.font_weight / 100) &&
            treatment.font_weight >= 100 &&
            treatment.font_weight <= 900),
        `Invalid syntax weight: ${capture}`,
      );
      assert(
        treatment.font_style === undefined ||
          (typeof treatment.font_style === "string" &&
            ["normal", "italic", "oblique"].includes(treatment.font_style)),
        `Invalid syntax font style: ${capture}`,
      );
      syntax[capture] = treatment;
    }
    for (const [key, value] of Object.entries(resolved)) {
      if (key === "syntax") continue;
      if (key === "background.appearance") {
        assert(
          ["opaque", "transparent", "blurred"].includes(String(value)),
          "Invalid background appearance",
        );
      } else if (key === "accents") {
        assert(Array.isArray(value) && value.every(isColor), "Invalid accents");
      } else {
        assert(isColor(value), `Invalid style color: ${key}`);
      }
    }
    return { name: theme.name, appearance, style: resolved, syntax };
  });
  const family: Family = {
    $schema: schema,
    name: mapping.name,
    author: mapping.author,
    themes: themes.map(({ name, appearance, style }) => ({ name, appearance, style })),
  };
  assert(validateFamily(family), `Invalid Zed theme: ${JSON.stringify(validateFamily.errors)}`);
  return { family, themes };
}
