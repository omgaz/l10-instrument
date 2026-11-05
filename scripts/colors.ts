import assert from "node:assert/strict";
import { clampChroma, converter, formatHex, formatHex8, interpolate, wcagContrast } from "culori";
import type { Oklch } from "culori";

const oklch = converter("oklch");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const reference = (value: unknown): string => {
  assert(
    typeof value === "string" && /^\{[a-z][a-z0-9_.-]*\}$/.test(value),
    `Expected a color token reference: ${String(value)}`,
  );
  return value.slice(1, -1);
};
const unit = (value: unknown, label: string): number => {
  assert(
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1,
    `${label} must be between 0 and 1`,
  );
  return value;
};
const toHex = (color: Oklch): string => {
  const mapped = clampChroma(color, "oklch", "rgb");
  return (
    color.alpha !== undefined && color.alpha < 1 ? formatHex8(mapped) : formatHex(mapped)
  ).toUpperCase();
};

export function colorResolver(tokens: Record<string, unknown>): (name: string) => string {
  const resolved = new Map<string, string>();
  const active = new Set<string>();
  const resolve = (name: string): string => {
    const cached = resolved.get(name);
    if (cached) return cached;
    assert(!active.has(name), `Circular color reference: ${[...active, name].join(" -> ")}`);
    const token = Object.hasOwn(tokens, name) ? tokens[name] : undefined;
    assert(isRecord(token) && token.type === "color", `Unknown or non-color token: ${name}`);
    active.add(name);
    const value = token.value;
    let color;
    if (typeof value === "string") {
      if (value.startsWith("{")) {
        color = oklch(resolve(reference(value)));
      } else {
        assert(
          /^#[\da-f]{6}([\da-f]{2})?$/i.test(value) || /^oklch\(/.test(value),
          `Expected hex or OKLCH color: ${name}`,
        );
        color = oklch(value);
      }
    } else {
      assert(isRecord(value), `Invalid color expression: ${name}`);
      assert(
        Object.keys(value).every((key) =>
          [
            "from",
            "toward",
            "amount",
            "chroma",
            "lightness",
            "alpha",
            "against",
            "minContrast",
          ].includes(key),
        ),
        `Unknown color expression field: ${name}`,
      );
      const base = resolve(reference(value.from));
      assert(
        (value.toward === undefined) === (value.amount === undefined),
        `Mix requires both toward and amount: ${name}`,
      );
      color = oklch(
        value.toward === undefined
          ? base
          : interpolate(
              [base, resolve(reference(value.toward))],
              "oklab",
            )(unit(value.amount, `${name}.amount`)),
      );
      assert(color, `Invalid base color: ${name}`);
      if (value.lightness !== undefined) color.l = unit(value.lightness, `${name}.lightness`);
      if (value.chroma !== undefined) color.c *= unit(value.chroma, `${name}.chroma`);
      if (value.alpha !== undefined) color.alpha = unit(value.alpha, `${name}.alpha`);
      assert(
        (value.against === undefined) === (value.minContrast === undefined),
        `Contrast requires both against and minContrast: ${name}`,
      );
      if (value.against !== undefined) {
        const background = resolve(reference(value.against));
        const backdrop = oklch(background)!;
        const minimum = value.minContrast;
        assert(
          typeof minimum === "number" && Number.isFinite(minimum) && minimum >= 1 && minimum <= 21,
          `Invalid minimum contrast: ${name}`,
        );
        assert(
          (color.alpha ?? 1) === 1 && (backdrop.alpha ?? 1) === 1,
          `Contrast-constrained colors must be opaque: ${name}`,
        );
        if (wcagContrast(toHex(color), background) < minimum) {
          let failing = color.l;
          let passing = backdrop.l > color.l ? 0.04 : 0.96;
          assert(
            wcagContrast(toHex({ ...color, l: passing }), background) >= minimum,
            `Unreachable contrast target: ${name}`,
          );
          // Check quantized, gamut-mapped output, not the unrounded OKLCH candidate.
          for (let step = 0; step < 24; step++) {
            const middle = (failing + passing) / 2;
            if (wcagContrast(toHex({ ...color, l: middle }), background) >= minimum)
              passing = middle;
            else failing = middle;
          }
          color.l = passing;
        }
      }
    }
    assert(
      color &&
        Number.isFinite(color.l) &&
        Number.isFinite(color.c) &&
        (color.h === undefined || Number.isFinite(color.h)) &&
        color.l >= 0 &&
        color.l <= 1 &&
        color.c >= 0 &&
        (color.alpha === undefined || (color.alpha >= 0 && color.alpha <= 1)),
      `Invalid color: ${name}`,
    );
    const hex = toHex(color);
    assert(
      !hex.startsWith("#FFFFFF") && (!hex.startsWith("#000000") || hex === "#00000000"),
      `Pure black/white is not a material color: ${name}`,
    );
    active.delete(name);
    resolved.set(name, hex);
    return hex;
  };
  return resolve;
}
