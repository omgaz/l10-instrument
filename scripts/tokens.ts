import assert from "node:assert/strict";
import { colorResolver } from "./colors.ts";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Token =
  | { type: "color"; value: string }
  | { type: "fontWeight"; value: number }
  | { type: "fontStyle"; value: string };
export type Tokens = Record<string, Token>;
export type Source = {
  typography: Tokens;
  grid: {
    columns: number;
    gutter: string;
    pageMargin: string;
    maxWidth: string;
    breakpoint: string;
  };
  modes: Record<"light" | "dark", Tokens>;
};
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value);

function parseTokens(value: unknown): Tokens {
  assert(isRecord(value), "Expected a token dictionary");
  const resolveColor = colorResolver(value);
  return Object.fromEntries(
    Object.entries(value).map(([name, token]) => {
      assert(/^[a-z][a-z0-9_.-]*$/.test(name), `Invalid token name: ${name}`);
      assert(isRecord(token), `Invalid token: ${name}`);
      if (token.type === "color") {
        return [name, { type: "color", value: resolveColor(name) }];
      }
      if (token.type === "fontWeight") {
        assert(
          typeof token.value === "number" &&
            Number.isInteger(token.value / 100) &&
            token.value >= 100 &&
            token.value <= 900,
          `Invalid font weight: ${name}`,
        );
        return [name, { type: "fontWeight", value: token.value }];
      }
      assert(
        token.type === "fontStyle" &&
          typeof token.value === "string" &&
          ["normal", "italic", "oblique"].includes(token.value),
        `Invalid font style: ${name}`,
      );
      return [name, { type: "fontStyle", value: token.value }];
    }),
  );
}

export function parseSource(value: unknown): Source {
  assert(isRecord(value) && isRecord(value.modes), "Expected typography and light/dark modes");
  assert(isRecord(value.grid), "Expected grid tokens");
  const grid = value.grid;
  assert(
    grid.columns === 12 &&
      typeof grid.gutter === "string" &&
      grid.gutter.length > 0 &&
      typeof grid.pageMargin === "string" &&
      grid.pageMargin.length > 0 &&
      typeof grid.maxWidth === "string" &&
      grid.maxWidth.length > 0 &&
      typeof grid.breakpoint === "string" &&
      grid.breakpoint.length > 0,
    "Invalid 12-column grid tokens",
  );
  assert(
    isRecord(value.modes.light) && isRecord(value.modes.dark),
    "Expected light and dark token dictionaries",
  );
  const typography = parseTokens(value.typography);
  const modes = { light: parseTokens(value.modes.light), dark: parseTokens(value.modes.dark) };
  for (const [mode, tokens] of Object.entries(modes)) {
    for (const name of Object.keys(typography)) {
      assert(!(name in tokens), `Duplicate typography token in ${mode}: ${name}`);
    }
  }
  return {
    typography,
    grid: {
      columns: 12,
      gutter: grid.gutter,
      pageMargin: grid.pageMargin,
      maxWidth: grid.maxWidth,
      breakpoint: grid.breakpoint,
    },
    modes,
  };
}

export function resolveTokens(value: unknown, tokens: Tokens): Json {
  if (typeof value === "string") {
    const reference = /^\{([^{}]+)\}$/.exec(value);
    if (reference) {
      const token = Object.hasOwn(tokens, reference[1]) ? tokens[reference[1]] : undefined;
      assert(token, `Unknown token: ${reference[1]}`);
      return token.value;
    }
    assert(!/[{}]/.test(value), `Malformed token reference: ${value}`);
    assert(!value.startsWith("#"), `Use a token instead of a literal color: ${value}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveTokens(item, tokens));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveTokens(item, tokens)]),
    );
  }
  assert(
    value === null || typeof value === "number" || typeof value === "boolean",
    "Invalid mapping value",
  );
  return value;
}
