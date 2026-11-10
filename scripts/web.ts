import assert from "node:assert/strict";
import { wcagContrast } from "culori";
import type { Source, Tokens } from "./tokens.ts";

type Mode = "light" | "dark";
const grainBlend = { light: "multiply", dark: "overlay" } as const;

// Composite a #RRGGBBAA layer over an opaque backdrop, as CSS background-blend-mode does.
function composite(backdrop: string, layer: string, mode: "normal" | "multiply" | "overlay") {
  const channel = (hex: string, index: number) =>
    parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  const alpha = layer.length === 9 ? channel(layer, 3) : 1;
  const mixed = [0, 1, 2].map((index) => {
    const b = channel(backdrop, index);
    const s = channel(layer, index);
    const blended =
      mode === "multiply"
        ? b * s
        : mode === "overlay"
          ? b <= 0.5
            ? 2 * b * s
            : 1 - 2 * (1 - b) * (1 - s)
          : s;
    return Math.round((b * (1 - alpha) + blended * alpha) * 255)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${mixed.join("")}`;
}

// Worst case for text: every surface a foreground can sit on, at each layer's extreme.
function assertMaterialContrast(tokens: Tokens, mode: Mode) {
  const color = (name: string) => {
    const token = tokens[name];
    assert(token?.type === "color", `Missing material color: ${mode} ${name}`);
    return token.value;
  };
  const grained = (base: string, grain: string) => [
    color(base),
    composite(color(base), color(grain), grainBlend[mode]),
  ];
  const page = grained("material.page", "texture.grain.matte").flatMap((background) => [
    background,
    composite(background, color("depth.falloff.light"), "normal"),
    composite(background, color("depth.falloff.shade"), "normal"),
  ]);
  const card = color("material.card");
  const checks: [string, string[], string][] = [
    ["text.primary", page, "page"],
    ["text.muted", page, "page"],
    ["text.primary", grained("material.card", "texture.grain.paper"), "card"],
    ["text.muted", grained("material.card", "texture.grain.paper"), "card"],
    ["text.primary", [color("material.recessed")], "recessed"],
    ["text.muted", [color("material.recessed")], "recessed"],
    ["text.primary", [color("material.input")], "input"],
    ["material.input.placeholder", [color("material.input")], "input"],
    [
      "text.primary",
      [
        card,
        composite(card, color("depth.sheen"), "normal"),
        composite(card, color("depth.shade"), "normal"),
      ],
      "button",
    ],
    // Primary sheen ends inside the top padding, so only the shade can reach the label.
    [
      "action.label",
      [color("action.fill"), composite(color("action.fill"), color("depth.shade"), "normal")],
      "primary button",
    ],
  ];
  for (const [foreground, backgrounds, surface] of checks)
    for (const background of backgrounds) {
      const ratio = wcagContrast(color(foreground), background);
      assert(
        ratio >= 4.5,
        `${mode} ${foreground} on ${surface} material ${background}: ${ratio.toFixed(2)}:1`,
      );
    }
}

// fractalNoise (not turbulence) gives soft, centred tooth rather than veins; stitchTiles keeps
// the tile seamless. Noise drives alpha only, so the grain stays the palette colour and never
// adds chroma. Paper adds a low, anisotropic mottle for fibre direction.
function grain(color: string, paper: boolean) {
  const fine =
    "<feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' seed='3' stitchTiles='stitch' result='f'/>";
  const fibre = paper
    ? "<feTurbulence type='fractalNoise' baseFrequency='.015 .06' numOctaves='3' seed='9' stitchTiles='stitch'/><feComposite in='f' operator='arithmetic' k2='.7' k3='.3'/>"
    : "";
  const [r, g, b] = [1, 3, 5].map((index) =>
    (parseInt(color.slice(index, index + 2), 16) / 255).toFixed(3),
  );
  const opacity = (parseInt(color.slice(7, 9) || "ff", 16) / 255).toFixed(3);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g' x='0' y='0' width='1' height='1'>${fine}${fibre}<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 2.5 0 0 0 -.75'/></filter><rect width='200' height='200' opacity='${opacity}' filter='url(#g)'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")}")`;
}

const textures = (tokens: Tokens, mode: Mode) => {
  assertMaterialContrast(tokens, mode);
  return `
  --l10-texture-blend: ${grainBlend[mode]};
  --l10-texture-grain-matte-image: ${grain(String(tokens["texture.grain.matte"].value), false)};
  --l10-texture-grain-paper-image: ${grain(String(tokens["texture.grain.paper"].value), true)};`;
};

// Opt-in only: without data-l10-texture="on" nothing below matches, so flat output is unchanged.
const materials = `
[data-l10-texture="on"] [data-l10-material="page"] {
  background-color: var(--l10-material-page);
  color: var(--l10-text-primary);
  background-image: radial-gradient(ellipse 90% 45% at 50% 0%, var(--l10-depth-falloff-light), transparent), linear-gradient(to bottom, transparent 50%, var(--l10-depth-falloff-shade)), var(--l10-texture-grain-matte-image);
  background-blend-mode: normal, normal, var(--l10-texture-blend);
}
[data-l10-texture="on"] [data-l10-material="card"] {
  background-color: var(--l10-material-card);
  background-image: var(--l10-texture-grain-paper-image);
  background-blend-mode: var(--l10-texture-blend);
  box-shadow: inset 0 1px 0 var(--l10-depth-highlight), 0 0 0 1px var(--l10-depth-edge), 0 1px 2px var(--l10-depth-shadow-1), 0 6px 16px var(--l10-depth-shadow-2);
}
[data-l10-texture="on"] [data-l10-material="recessed"] {
  background-color: var(--l10-material-recessed);
  box-shadow: inset 0 2px 4px var(--l10-depth-inset), inset 0 -1px 0 var(--l10-depth-highlight);
}
[data-l10-texture="on"] [data-l10-material="input"] {
  background-color: var(--l10-material-input);
  color: var(--l10-text-primary);
  border: 1px solid var(--l10-border);
  box-shadow: inset 0 1px 2px var(--l10-depth-shadow-1), 0 1px 0 var(--l10-depth-highlight);
}
[data-l10-texture="on"] [data-l10-material="input"]::placeholder { color: var(--l10-material-input-placeholder); }
[data-l10-texture="on"] [data-l10-material~="button"] {
  background-color: var(--l10-material-card);
  color: var(--l10-text-primary);
  border: 1px solid var(--l10-border);
  /* ponytail: sheen stops at min(26%, padding), so it never sits under the label. Keep padding-block. */
  padding-block: 0.75rem;
  background-image: linear-gradient(to bottom, var(--l10-depth-sheen), transparent min(26%, 0.75rem), transparent 52%, var(--l10-depth-shade));
  box-shadow: inset 0 1px 0 var(--l10-depth-highlight), inset 0 -2px 0 var(--l10-depth-edge), 0 1px 2px var(--l10-depth-shadow-1);
}
[data-l10-texture="on"] [data-l10-material~="primary"] {
  background-color: var(--l10-action-fill);
  color: var(--l10-action-label);
  border-color: var(--l10-action-fill);
}
[data-l10-texture="on"] [data-l10-material~="button"]:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: inset 0 2px 3px var(--l10-depth-inset);
}
@media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
  [data-l10-texture="on"] [data-l10-material] {
    background-image: none !important;
    box-shadow: none !important;
    transform: none !important;
  }
}
`;

export function exportTokens(source: Source) {
  const declarations = (tokens: Tokens) => {
    const names = new Set<string>();
    return Object.entries(tokens)
      .filter(([name]) => !name.startsWith("palette."))
      .map(([name, token]) => {
        const property = `--l10-${name.replace(/[._]/g, "-")}`;
        assert(!names.has(property), `CSS token name collision: ${property}`);
        names.add(property);
        return `  ${property}: ${token.value};`;
      })
      .join("\n");
  };
  const light =
    declarations({ ...source.typography, ...source.modes.light }) +
    textures(source.modes.light, "light");
  const dark =
    declarations({ ...source.typography, ...source.modes.dark }) +
    textures(source.modes.dark, "dark");
  const roles = (tokens: Tokens) =>
    Object.keys(tokens)
      .filter((name) => !name.startsWith("palette."))
      .sort();
  assert.deepEqual(
    roles(source.modes.light),
    roles(source.modes.dark),
    "CSS modes must expose the same token names",
  );
  return {
    json: { typography: source.typography, grid: source.grid, modes: source.modes },
    css: `/* Generated by npm run build. Do not edit. */
:root {
  color-scheme: light;
${light}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-l10-theme]) {
    color-scheme: dark;
${dark}
  }
}
:root[data-l10-theme="light"], [data-l10-theme="light"] {
  color-scheme: light;
${light}
}
:root[data-l10-theme="dark"], [data-l10-theme="dark"] {
  color-scheme: dark;
${dark}
}
${materials}`,
  };
}
