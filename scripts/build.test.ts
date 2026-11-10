import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { converter } from "culori";
import { compile } from "./zed.ts";
import { contrast, escapeHtml, renderPreview } from "./preview.ts";
import { isRecord, parseSource, resolveTokens } from "./tokens.ts";
import { colorResolver } from "./colors.ts";
import { compileVscode } from "./vscode.ts";
import { compileTerminal } from "./terminal.ts";
import { exportTokens } from "./web.ts";

const sourceInput: unknown = JSON.parse(
  await readFile(new URL("../design-system/tokens.json", import.meta.url), "utf8"),
);
const mappingInput: unknown = JSON.parse(
  await readFile(new URL("../design-system/zed.json", import.meta.url), "utf8"),
);
const source = parseSource(sourceInput);
const vscodeMapping: unknown = JSON.parse(
  await readFile(new URL("../design-system/vscode.json", import.meta.url), "utf8"),
);
const terminalMapping: unknown = JSON.parse(
  await readFile(new URL("../design-system/terminal.json", import.meta.url), "utf8"),
);

function sourceDefinitions() {
  assert(
    isRecord(sourceInput) &&
      isRecord(sourceInput.modes) &&
      isRecord(sourceInput.modes.light) &&
      isRecord(sourceInput.modes.dark),
  );
  return structuredClone({ light: sourceInput.modes.light, dark: sourceInput.modes.dark });
}

test("exports resolved web tokens without leaking source definitions or editor mappings", () => {
  const { json, css } = exportTokens(source);
  assert.deepEqual(Object.keys(json), ["typography", "grid", "modes"]);
  assert(!JSON.stringify(json).includes("{palette."));
  for (const mode of ["light", "dark"] as const) {
    assert.deepEqual(json.modes[mode], source.modes[mode]);
    for (const [name, token] of Object.entries({ ...source.typography, ...source.modes[mode] })) {
      if (name.startsWith("palette.")) continue;
      assert(css.includes(`--l10-${name.replace(/[._]/g, "-")}: ${token.value};`));
    }
  }
  assert(css.includes("@media (prefers-color-scheme: dark)"));
  assert(css.includes(":root:not([data-l10-theme])"));
  assert(css.indexOf('[data-l10-theme="light"]') > css.indexOf("@media"));
  assert(css.indexOf('[data-l10-theme="dark"]') > css.indexOf("@media"));
  const changed = structuredClone(source);
  changed.modes.light["code-structure"] = { type: "color", value: "#123456" };
  assert.throws(() => exportTokens(changed), /collision/);
  delete changed.modes.light["code-structure"];
  delete changed.modes.dark["code.structure"];
  assert.throws(() => exportTokens(changed), /same token names/);
});

test("web materials are opt-in and fail the build on worst-case contrast", () => {
  const { css } = exportTokens(source);
  for (const rule of css.match(/^[^\n]*data-l10-material[^\n]*\{/gm)!)
    assert(rule.includes('[data-l10-texture="on"]'), rule);
  assert(css.includes("@media (prefers-contrast: more), (prefers-reduced-transparency: reduce)"));
  assert(
    css.includes("--l10-texture-blend: multiply;") && css.includes("--l10-texture-blend: overlay;"),
  );
  const failing = (mode: "light" | "dark", name: string, value: string, message: RegExp) => {
    const changed = structuredClone(source);
    changed.modes[mode][name] = { type: "color", value };
    assert.throws(() => exportTokens(changed), message);
  };
  const light = source.modes.light;
  failing("light", "texture.grain.matte", "#20211F40", /light text.muted on page/);
  failing(
    "light",
    "material.input.placeholder",
    String(light["text.placeholder"].value),
    /placeholder on input/,
  );
  failing("dark", "action.label", "#1C1D1B", /dark action.label on primary button/);
});

test("Ghostty output contains exactly 16 ordered ANSI colors and opaque readable selections", () => {
  for (const [index, theme] of compileTerminal(source, terminalMapping).entries()) {
    const mode = index === 0 ? "light" : "dark";
    const lines = theme.ghostty.trim().split("\n").slice(1);
    assert.equal(lines.length, 22);
    const palette = lines.filter((line) => line.startsWith("palette = "));
    assert.equal(palette.length, 16);
    palette.forEach((line, index) =>
      assert.match(line, new RegExp(`^palette = ${index}=#[A-F0-9]{6}$`)),
    );
    assert(lines.includes(`foreground = ${source.modes[mode]["terminal.foreground"].value}`));
    const tokens = source.modes[mode];
    assert(
      contrast(
        String(tokens["terminal.selection_foreground"].value),
        String(tokens["terminal.selection_background"].value),
      ) >= 4.5,
    );
    assert(
      contrast(
        String(tokens["terminal.cursor_text"].value),
        String(tokens["terminal.cursor"].value),
      ) >= 4.5,
    );
  }
  assert.throws(() => compileTerminal(source, {}), /Invalid terminal keys/);
  const shortPalette = { ...JSON.parse(JSON.stringify(terminalMapping)), palette: [] };
  assert.throws(() => compileTerminal(source, shortPalette), /exactly 16/);
  const changed = structuredClone(source);
  changed.modes.light["terminal.background"] = { type: "color", value: "#12345680" };
  assert.throws(() => compileTerminal(changed, terminalMapping), /opaque/);
});

test("iTerm2 and Ghostty exports contain the same sRGB colors without quantization loss", () => {
  const fieldNames: Record<string, string> = {
    "Background Color": "background",
    "Foreground Color": "foreground",
    "Cursor Color": "cursor-color",
    "Cursor Text Color": "cursor-text",
    "Selection Color": "selection-background",
    "Selected Text Color": "selection-foreground",
  };
  for (const theme of compileTerminal(source, terminalMapping)) {
    assert(theme.iterm.startsWith('<?xml version="1.0"'));
    assert(theme.iterm.endsWith("</plist>\n"));
    const ghostty = new Map(
      theme.ghostty
        .trim()
        .split("\n")
        .slice(1)
        .map((line): [string, string] => {
          const [key, value] = line.split(" = ");
          if (key !== "palette") return [key, value];
          const [index, color] = value.split("=");
          return [index, color];
        }),
    );
    const colors = [...theme.iterm.matchAll(/<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)];
    assert.equal(colors.length, 22);
    assert.equal(new Set(colors.map(([, key]) => key)).size, 22);
    for (const [, key, dictionary] of colors) {
      assert(dictionary.includes("<key>Color Space</key><string>sRGB</string>"));
      assert(dictionary.includes("<key>Alpha Component</key><real>1</real>"));
      const hex =
        "#" +
        ["Red", "Green", "Blue"]
          .map((channel) => {
            const component = Number(
              dictionary.match(
                new RegExp(`<key>${channel} Component</key><real>([^<]+)</real>`),
              )?.[1],
            );
            assert(Number.isFinite(component) && component >= 0 && component <= 1);
            return Math.round(component * 255)
              .toString(16)
              .padStart(2, "0")
              .toUpperCase();
          })
          .join("");
      const ansi = /^Ansi (\d+) Color$/.exec(key);
      assert.equal(hex, ghostty.get(ansi ? ansi[1] : fieldNames[key]), key);
    }
  }
});

test("all ANSI foregrounds meet 4.5:1 on their terminal background in both modes", () => {
  for (const mode of ["light", "dark"] as const) {
    const tokens = source.modes[mode];
    const background = String(tokens["terminal.background"].value);
    for (const [name, token] of Object.entries(tokens)) {
      if (name.startsWith("terminal.ansi.") && name !== "terminal.ansi.background") {
        assert(contrast(String(token.value), background) >= 4.5, `${mode} ${name}`);
      }
    }
    assert.notEqual(
      tokens["terminal.ansi.white"].value,
      tokens["terminal.ansi.bright_white"].value,
    );
    assert.notEqual(
      tokens["terminal.ansi.yellow"].value,
      tokens["terminal.ansi.bright_yellow"].value,
    );
  }
});

test("terminal contrast adjustments follow palette changes without changing commentary", () => {
  const definitions = sourceDefinitions();
  definitions.light["palette.blue"] = { type: "color", value: "oklch(0.6 0.13 260)" };
  const changed = parseSource({
    typography: source.typography,
    grid: source.grid,
    modes: definitions,
  });
  assert.notEqual(
    changed.modes.light["terminal.ansi.bright_blue"].value,
    source.modes.light["terminal.ansi.bright_blue"].value,
  );
  assert(
    contrast(
      String(changed.modes.light["terminal.ansi.bright_blue"].value),
      String(changed.modes.light["terminal.background"].value),
    ) >= 4.5,
  );
  assert.equal(changed.modes.light["code.comment"].value, source.modes.light["code.comment"].value);
  assert.deepEqual(changed.modes.dark, source.modes.dark);
});

test("VS Code exports accessible TextMate and semantic treatments for both modes", () => {
  for (const theme of compileVscode(source, vscodeMapping)) {
    assert.equal(
      theme.colors["editor.background"],
      source.modes[theme.type]["surface.editor"].value,
    );
    assert.equal(
      theme.semanticTokenColors.parameter.foreground,
      source.modes[theme.type]["code.input"].value,
    );
    assert.equal(
      theme.semanticTokenColors["type.documentation"].foreground,
      source.modes[theme.type]["documentation.structure"].value,
    );
    assert.equal(
      Object.keys(theme.colors).filter((key) => key.startsWith("terminal.ansi")).length,
      16,
    );
    assert(theme.semanticHighlighting);
    for (const foreground of [
      ...theme.tokenColors.flatMap((rule) =>
        rule.settings.foreground ? [rule.settings.foreground] : [],
      ),
      ...Object.values(theme.semanticTokenColors).map((style) => style.foreground),
    ])
      assert(contrast(foreground, theme.colors["editor.background"]) >= 4.5);
  }
  assert.throws(() => compileVscode(source, {}), /workbench color mappings/);
  const mapping = JSON.parse(JSON.stringify(vscodeMapping));
  mapping.colors["editor.backgrond"] = "{surface.editor}";
  assert.throws(() => compileVscode(source, mapping), /Unknown VS Code workbench/);
  delete mapping.colors["editor.backgrond"];
  mapping.tokenColors[0].settings.foreground = "{missing}";
  assert.throws(() => compileVscode(source, mapping), /Unknown token/);
});

test("one semantic role propagates to all exporters without crossing modes", () => {
  const changed = structuredClone(source);
  changed.modes.light["code.structure"] = { type: "color", value: "#123456" };
  assert.equal(
    compileVscode(changed, vscodeMapping)[0].semanticTokenColors.type.foreground,
    "#123456",
  );
  assert.equal(compile(changed, mappingInput).themes[0].syntax.type.color, "#123456");
  assert.equal(exportTokens(changed).json.modes.light["code.structure"].value, "#123456");
  assert.deepEqual(
    compileVscode(changed, vscodeMapping)[1],
    compileVscode(source, vscodeMapping)[1],
  );
  changed.modes.light["terminal.ansi.blue"] = { type: "color", value: "#234567" };
  assert(compileTerminal(changed, terminalMapping)[0].ghostty.includes("palette = 4=#234567"));
  assert.equal(compileVscode(changed, vscodeMapping)[0].colors["terminal.ansiBlue"], "#234567");
});

test("VS Code manifest points to both generated theme files", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../extensions/vscode/package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    manifest.contributes.themes.map((theme: { uiTheme: string }) => theme.uiTheme),
    ["vs", "vs-dark"],
  );
  assert.deepEqual(
    manifest.contributes.themes.map((theme: { path: string }) => theme.path),
    [
      "./themes/l10-instrument-light-color-theme.json",
      "./themes/l10-instrument-dark-color-theme.json",
    ],
  );
  assert(!manifest.main);
  assert.equal(manifest.publisher, "l10-local");
});

test("preview includes both target mapping tables, ANSI palettes and portable token links", () => {
  const { family, themes } = compile(source, mappingInput);
  const vscode = compileVscode(source, vscodeMapping);
  const html = renderPreview(source, family, themes, vscode);
  for (const mode of ["light", "dark"]) {
    assert(html.includes(`aria-label="${mode} ANSI terminal palette"`));
    assert(html.includes(`aria-label="${mode} VS Code semantic mappings"`));
  }
  assert(html.includes('href="dist/tokens/tokens.css"'));
  assert(renderPreview(source, family, themes, vscode, "").includes('href="tokens/tokens.json"'));
  assert(html.includes("15: bright white"));
  assert(html.includes('data-l10-theme="dark"'));
});

test("JSDoc mappings distinguish actual TypeScript tag, type and description scopes", () => {
  const theme = compileVscode(source, vscodeMapping)[0];
  const foreground = (scope: string) =>
    theme.tokenColors.find((rule) => rule.scope.includes(scope))?.settings.foreground;
  assert.equal(
    foreground("comment.block.documentation storage.type.class.jsdoc"),
    source.modes.light["documentation.control"].value,
  );
  assert.equal(
    foreground("comment.block.documentation entity.name.type.instance.jsdoc"),
    source.modes.light["documentation.structure"].value,
  );
  assert.equal(
    foreground("comment.block.documentation variable.other.description.jsdoc"),
    source.modes.light["code.comment"].value,
  );
  assert.equal(theme.semanticTokenColors["type.documentation"].bold, false);
});

test("shared typography maps to VS Code's supported syntax weights", () => {
  const changed = structuredClone(source);
  changed.typography["weight.structure"] = { type: "fontWeight", value: 400 };
  const theme = compileVscode(changed, vscodeMapping)[0];
  assert.equal(theme.semanticTokenColors.type.bold, false);
  assert.equal(
    theme.tokenColors.find((rule) => rule.scope.includes("entity.name.type"))?.settings.fontStyle,
    "",
  );
  assert.equal(
    theme.tokenColors.find((rule) => rule.scope.includes("comment.block.documentation"))?.settings
      .fontStyle,
    source.typography["style.annotation"].value,
  );
});

test("resolves tokens in objects and arrays without changing literal settings", () => {
  const tokens = {
    ink: { type: "color" as const, value: "#20211F" },
    weight: { type: "fontWeight" as const, value: 600 },
  };
  assert.deepEqual(
    resolveTokens({ color: "{ink}", weights: ["{weight}"], appearance: "opaque" }, tokens),
    { color: "#20211F", weights: [600], appearance: "opaque" },
  );
  assert.throws(() => resolveTokens("{missing}", tokens), /Unknown token/);
  assert.throws(() => resolveTokens("{toString}", tokens), /Unknown token/);
  assert.throws(() => resolveTokens("prefix {ink}", tokens), /Malformed token/);
  assert.throws(() => resolveTokens("#20211F", tokens), /Use a token/);
});

test("rejects malformed token sources", () => {
  const invalidSources = [
    { ...source, typography: { invalid: { type: "color", value: "#xyz" } } },
    { ...source, typography: { invalid: { type: "fontWeight", value: 650 } } },
    { ...source, typography: { invalid: { type: "fontStyle", value: "bold" } } },
    { ...source, modes: { light: source.modes.light } },
    { ...source, typography: { "surface.canvas": { type: "color", value: "#20211F" } } },
    { ...source, grid: { ...source.grid, columns: 8 } },
  ];
  for (const invalid of invalidSources) assert.throws(() => parseSource(invalid));
});

test("compiles both variants with all original capture treatments", () => {
  const { family, themes } = compile(source, mappingInput);
  assert.deepEqual(
    themes.map((theme) => theme.appearance),
    ["light", "dark"],
  );
  for (const theme of themes) {
    assert.equal(theme.syntax.type.font_weight, 600);
    assert.equal(theme.syntax["comment.doc"].font_style, "italic");
    assert.equal(
      theme.syntax.function.color,
      source.modes[theme.appearance]["code.behaviour"].value,
    );
    assert.equal(
      theme.style["editor.background"],
      source.modes[theme.appearance]["surface.editor"].value,
    );
  }
  assert(!JSON.stringify(family).includes("{syntax."));
});

test("a semantic token change reaches every mapped capture in only its own mode", () => {
  const changed = structuredClone(source);
  changed.modes.light["code.structure"] = { type: "color", value: "#123456" };
  const { themes } = compile(changed, mappingInput);
  const light = themes.find((theme) => theme.appearance === "light")!;
  const dark = themes.find((theme) => theme.appearance === "dark")!;
  for (const capture of ["type", "constructor", "enum"]) {
    assert.equal(light.syntax[capture].color, "#123456");
    assert.equal(dark.syntax[capture].color, source.modes.dark["code.structure"].value);
  }
});

test("rejects missing variants and mismatched token types in style mappings", () => {
  const { family } = compile(source, mappingInput);
  assert.throws(() => compile(source, { ...family, themes: [] }), /Expected light and dark/);
  assert.throws(
    () =>
      compile(source, {
        ...family,
        themes: [
          {
            name: "Light",
            appearance: "light",
            style: { background: "{weight.structure}", syntax: {} },
          },
          { name: "Dark", appearance: "dark", style: { syntax: {} } },
        ],
      }),
    /Invalid style color/,
  );
});

test("computes WCAG contrast including transparent foregrounds", () => {
  assert.equal(contrast("#000000", "#FFFFFF"), 21);
  assert.equal(contrast("#20211F", "#20211F"), 1);
  assert.equal(contrast("#00000000", "#F4F2EC"), 1);
  assert.equal(contrast("#000000", "#FFFFFFff"), 21);
  assert.equal(contrast("#20211F", "#20211FFF"), 1);
  assert(Math.abs(contrast("#00000080", "#FFFFFF") - 4.0) < 0.02);
  assert.throws(() => contrast("#xyz", "#FFFFFF"), /hex colors/);
  assert.throws(() => contrast("#000000", "#FFFFFF80"), /opaque background/);
});

test("UI roles have independent tokens with the same names in both modes", () => {
  const roles = (mode: "light" | "dark") =>
    Object.keys(source.modes[mode])
      .filter((name) => !name.startsWith("palette."))
      .sort();
  assert.deepEqual(roles("light"), roles("dark"));
  for (const mode of ["light", "dark"] as const) {
    const baseline = compile(source, mappingInput).themes.find(
      (theme) => theme.appearance === mode,
    )!;
    for (const name of ["border.disabled", "surface.elevated", "text.accent"]) {
      const changed = structuredClone(source);
      changed.modes[mode][name] = { type: "color", value: "#123456" };
      const updated = compile(changed, mappingInput).themes.find(
        (theme) => theme.appearance === mode,
      )!;
      const changedKeys = Object.keys(updated.style).filter(
        (key) => JSON.stringify(updated.style[key]) !== JSON.stringify(baseline.style[key]),
      );
      assert.deepEqual(changedKeys, [
        name === "surface.elevated" ? "elevated_surface.background" : name,
      ]);
    }
  }
});

test("rejects unknown UI and syntax style keys but accepts new capture names", () => {
  const { family } = compile(source, mappingInput);
  const mapping = structuredClone(family);
  // compile accepts token mappings, not already-resolved colors.
  mapping.themes = mapping.themes.map((theme) => ({
    ...theme,
    style: { background: "{surface.canvas}", syntax: {} },
  }));
  mapping.themes[0].style["editor.backgrond"] = "{surface.editor}";
  assert.throws(() => compile(source, mapping), /editor.backgrond/);
  delete mapping.themes[0].style["editor.backgrond"];
  mapping.themes[0].style.syntax = { type: { font_weigth: "{weight.structure}" } };
  assert.throws(() => compile(source, mapping), /font_weigth/);
  mapping.themes[0].style.syntax = { "custom.capture": { color: "{code.structure}" } };
  assert.doesNotThrow(() => compile(source, mapping));
});

test("preview permits removing captures and adding new ones", () => {
  const compiled = compile(source, mappingInput);
  const light = compiled.themes.find((theme) => theme.appearance === "light")!;
  delete light.syntax.function;
  delete light.syntax["type.builtin"];
  light.syntax["custom.capture"] = { color: "#123456" };
  const html = renderPreview(source, compiled.family, compiled.themes);
  assert(html.includes('style="color:var(--l10-'));
  assert(html.includes(';font-weight:400;font-style:normal" title="function">calibrate</span>'));
  assert(html.includes(';font-weight:600;font-style:normal" title="type.builtin">string</span>'));
  assert(html.includes("<code>custom.capture</code>"));
  assert(html.includes("not live highlighting"));
});

test("social responsibility statement matches the README without adding licence restrictions", async () => {
  const { family, themes } = compile(source, mappingInput);
  const html = renderPreview(source, family, themes);
  const footer = html.split("<footer>")[1];
  const readme = (await readFile(new URL("../README.md", import.meta.url), "utf8")).replace(
    /\s+/g,
    " ",
  );
  for (const statement of [
    "Build tools that help people. Respect privacy, support accessibility and consider the effects of your work on people and the environment.",
    "Do not use this work to harm, exploit or discriminate against others.",
    "This statement expresses the project's values. It does not add restrictions to the MIT licence.",
  ]) {
    assert(footer.includes(statement));
    assert(readme.includes(statement));
  }
});

test("preview accepts opaque eight-digit editor backgrounds", () => {
  const changed = structuredClone(source);
  changed.modes.light["surface.editor"] = { type: "color", value: "#F4F2ECFF" };
  const { family, themes } = compile(changed, mappingInput);
  assert.doesNotThrow(() => renderPreview(changed, family, themes));
});

test("renders every token and capture in a self-contained accessible preview", () => {
  const { family, themes } = compile(source, mappingInput);
  const html = renderPreview(source, family, themes);
  assert(html.startsWith("<!doctype html>"));
  for (const theme of themes) {
    assert(html.includes(`id="${theme.appearance}"`));
    for (const capture of Object.keys(theme.syntax))
      assert(html.includes(`<code>${capture}</code>`));
  }
  assert(html.includes("grid-template-columns:repeat(var(--grid-columns),minmax(0,1fr))"));
  assert(html.includes("grid-column:span 6"));
  assert(html.includes('<table class="syntax-treatments">'));
  assert(
    html.includes(
      ".syntax-treatments th:last-child,.syntax-treatments td:last-child{text-align:center}",
    ),
  );
  assert(!html.includes("<details>"));
  assert(html.includes('scope="row"'));
  assert(html.includes('tabindex="0"'));
  assert(html.includes(":focus-visible"));
  assert(html.includes("td{white-space:normal}td code{overflow-wrap:anywhere}"));
  assert(html.includes("verify actual scopes and semantic tokens in your editor"));
  assert(html.includes('<link rel="stylesheet" href="dist/tokens/tokens.css">'));
  assert(html.includes('data-l10-theme="light"'));
  assert(html.includes('data-l10-theme="dark"'));
  assert(!/<script|<[^>]+\bsrc=/.test(html));
  assert(
    !/href="https?:/.test(
      html.replace('href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"', ""),
    ),
  );
  assert(html.includes('href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"'));
  assert(html.includes('font-family:"IBM Plex Sans"'));
  assert(html.includes('font-family:"IBM Plex Sans",system-ui,sans-serif'));
  assert(html.includes("font-weight:400 600"));
  assert(
    html.includes(
      "width:1.75rem;height:1.75rem;padding:0;border:1px solid currentColor;border-radius:50%",
    ),
  );
  assert(
    html.includes(
      ".syntax-color{display:inline-flex;align-items:center;gap:.5rem;white-space:nowrap;overflow-wrap:normal}",
    ),
  );
});

test("preview leads with code and presents contrast as accessible status pills", () => {
  const { family, themes } = compile(source, mappingInput);
  const html = renderPreview(source, family, themes);
  const header = html.split('<header id="top">')[1].split("</header>")[0];
  assert(!header.includes("<nav"));
  assert(!header.includes("download"));
  assert(!header.includes("Fira Code"));
  assert(html.indexOf('id="dark"') < html.indexOf('id="usage"'));
  assert(html.indexOf('id="dark"') < html.indexOf('id="light-tokens"'));
  for (const mode of ["light", "dark"]) {
    const preview = html.split(`<section id="${mode}"`)[1].split("</section>")[0];
    assert(!preview.includes("<p>"));
    assert(preview.includes('<div class="instrument"'));
    const section = html.split(`<section id="${mode}-tokens"`)[1].split("</section>")[0];
    assert(
      section.indexOf('aria-label="' + mode + ' code and documentation relationships"') <
        section.indexOf("<caption>Syntax and type treatments</caption>"),
    );
    assert(section.includes("Contrast"));
    assert(section.includes('class="contrast-pill pass"'));
    assert(section.includes('aria-hidden="true">&#10003;'));
    assert(section.includes("meets the 4.5:1 target"));
    assert(section.includes("semantic annotations retain quieter forms"));
  }
  const light = themes.find((theme) => theme.appearance === "light")!;
  light.syntax.comment.color = String(light.style["editor.background"]);
  const failing = renderPreview(source, family, themes);
  assert(
    failing.includes('class="contrast-pill fail" aria-label="1.00:1 is below the 4.5:1 target"'),
  );
  assert(failing.includes('aria-hidden="true">!</span>'));
  assert(failing.includes('<th scope="col">Contrast</th>'));
});

test("TypeScript reference has generics and numbered lines using matching theme UI tokens", () => {
  const { family, themes } = compile(source, mappingInput);
  const html = renderPreview(source, family, themes);
  for (const theme of themes) {
    const section = html.split(`<section id="${theme.appearance}"`)[1].split("</section>")[0];
    assert(section.includes('data-l10-theme="' + theme.appearance + '"'));
    const editor = section.split('<div class="instrument"')[1].split("</code></pre>")[0];
    for (const token of [
      "toolbar.background",
      "editor.foreground",
      "editor.gutter.background",
      "editor.line_number",
    ])
      assert(html.includes(`var(--l10-${token.replace(/[._]/g, "-")})`));
    const numbers = editor
      .match(/class="line-numbers" aria-hidden="true">([\d\n]+)<\/pre>/)![1]
      .split("\n")
      .map(Number);
    const sourceHtml = editor.split('<pre class="source-code"><code>')[1];
    assert.equal(numbers.length, sourceHtml.split("\n").length);
    assert.deepEqual(
      numbers,
      numbers.map((_, index) => index + 1),
    );
    assert(sourceHtml.includes('title="type">T</span>'));
    assert(sourceHtml.includes('title="keyword"> extends </span>'));
    assert(!sourceHtml.includes("jsdoc"));
    assert(!sourceHtml.includes("/**"));
  }
});

test("syntax table uses readable hex labels with original color swatches", () => {
  const { family, themes } = compile(source, mappingInput);
  const html = renderPreview(source, family, themes);
  assert(!html.includes('<th scope="col">Specimen</th>'));
  for (const theme of themes) {
    const foreground = theme.syntax.type.color;
    assert(
      html.includes(
        `<code class="syntax-color"><span class="color-dot" style="background:var(--l10-`,
      ),
    );
    assert(html.includes(`>${foreground}</code>`));
    assert(!html.includes('class="syntax-color" style="color:'));
  }
  assert(html.includes('font-family:"Fira Code"'));
  assert(html.includes("font-weight:300 700"));
});

test("bundled Fira Code is a WOFF2 font accompanied by its licence", async () => {
  const font = await readFile(new URL("../assets/fonts/FiraCode-VF.woff2", import.meta.url));
  assert.equal(font.subarray(0, 4).toString(), "wOF2");
  const license = await readFile(
    new URL("../assets/fonts/FiraCode-LICENSE.txt", import.meta.url),
    "utf8",
  );
  assert(license.includes("SIL OPEN FONT LICENSE Version 1.1"));
});

test("bundled IBM Plex Sans is WOFF2 and accompanied by its OFL licence", async () => {
  for (const subset of ["latin", "latin-ext"]) {
    const font = await readFile(
      new URL(`../assets/fonts/IBMPlexSans-${subset}.woff2`, import.meta.url),
    );
    assert.equal(font.subarray(0, 4).toString(), "wOF2");
  }
  const license = await readFile(
    new URL("../assets/fonts/IBMPlexSans-LICENSE.txt", import.meta.url),
    "utf8",
  );
  assert(license.includes("SIL OPEN FONT LICENSE Version 1.1"));
});

test("escapes source text before putting it into preview HTML", () => {
  assert.equal(
    escapeHtml(`<script title="x">&'</script>`),
    "&lt;script title=&quot;x&quot;&gt;&amp;&#39;&lt;/script&gt;",
  );
  const { family, themes } = compile(source, mappingInput);
  assert(
    renderPreview(source, { ...family, name: "<instrument>" }, themes).includes(
      "&lt;instrument&gt;",
    ),
  );
});

test("semantic legends use each mode's resolved roles and derived annotation colors", () => {
  const { family, themes } = compile(source, mappingInput);
  const html = renderPreview(source, family, themes);
  for (const mode of ["light", "dark"] as const) {
    const section = html.split(`<section id="${mode}-tokens"`)[1].split("</section>")[0];
    assert(section.includes(`aria-label="${mode} semantic colour language"`));
    for (const role of [
      "control",
      "structure",
      "behaviour",
      "input",
      "property",
      "literal",
      "scalar",
      "variable",
      "comment",
    ]) {
      assert(section.includes(`style="background:var(--l10-code-${role})"`));
      assert(section.includes(`<code>code.${role}</code>`));
    }
    for (const role of ["control", "structure", "variable"]) {
      assert(
        section.includes(`style="color:var(--l10-documentation-${role})">JSDoc ${role}</span>`),
      );
    }
    assert(section.includes("supported by non-colour cues"));
  }
});

test("resolves OKLCH anchors, aliases, neutral mixes and alpha derivations", () => {
  const resolve = colorResolver({
    ink: { type: "color", value: "oklch(0.25 0 0)" },
    paper: { type: "color", value: "oklch(0.95 0 0)" },
    alias: { type: "color", value: "{ink}" },
    middle: { type: "color", value: { from: "{ink}", toward: "{paper}", amount: 0.5 } },
    overlay: { type: "color", value: { from: "{ink}", alpha: 0.1 } },
    saturated: { type: "color", value: "oklch(0.6 0.5 30)" },
  });
  assert.equal(resolve("ink"), "#222222");
  assert.equal(resolve("alias"), resolve("ink"));
  const middle = converter("oklch")(resolve("middle"))!;
  assert(Math.abs(middle.l - 0.6) < 0.003);
  assert(resolve("overlay").endsWith("1A"));
  const mapped = converter("oklch")(resolve("saturated"))!;
  assert(mapped.c < 0.5);
  assert(Math.abs(mapped.l - 0.6) < 0.003);
  assert(Math.abs(mapped.h! - 30) < 1);
});

test("rejects cyclic, missing, malformed and non-material color definitions", () => {
  const invalid = [
    { a: "{a}" },
    { a: "{b}", b: "{a}" },
    { a: "{missing}" },
    { a: "#000000" },
    { a: "#00000080" },
    { a: "#FFFFFF80" },
    { a: "#FFFFFF" },
    { a: "oklch(NaN 0.1 30)" },
    { a: { from: "{b}", amount: 0.5 }, b: "#20211F" },
    { a: { from: "{b}", chroma: -1 }, b: "#20211F" },
    { a: { from: "{b}", opacity: 0.5 }, b: "#20211F" },
    { a: { from: "{b}", against: "{b}", minContrast: 22 }, b: "#20211F" },
    { a: { from: "{b}", against: "{b}", minContrast: 4.5, alpha: 0.5 }, b: "#20211F" },
  ];
  for (const values of invalid) {
    const resolve = colorResolver(
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [name, { type: "color", value }]),
      ),
    );
    assert.throws(() => resolve("a"));
  }
  assert.equal(
    colorResolver({ transparent: { type: "color", value: "#00000000" } })("transparent"),
    "#00000000",
  );
});

test("palette changes propagate through semantic aliases and documentation without crossing modes", () => {
  const definitions = sourceDefinitions();
  definitions.light["palette.blue"] = { type: "color", value: "oklch(0.50 0.10 250)" };
  const changed = parseSource({
    typography: source.typography,
    grid: source.grid,
    modes: definitions,
  });
  assert.notEqual(
    changed.modes.light["code.structure"].value,
    source.modes.light["code.structure"].value,
  );
  assert.notEqual(
    changed.modes.light["documentation.structure"].value,
    source.modes.light["documentation.structure"].value,
  );
  assert.deepEqual(changed.modes.dark, source.modes.dark);
});

test("comments are grey and documentation is muted but readable in both modes", () => {
  const oklch = converter("oklch");
  for (const theme of compile(source, mappingInput).themes) {
    const tokens = source.modes[theme.appearance];
    const background = String(theme.style["editor.background"]);
    const comment = String(tokens["code.comment"].value);
    assert.match(comment, /^#([\dA-F]{2})\1\1$/);
    assert(contrast(comment, background) >= 4.5);
    for (const role of ["control", "structure", "variable"]) {
      const code = String(tokens[`code.${role}`].value);
      const documentation = String(tokens[`documentation.${role}`].value);
      assert(contrast(documentation, background) >= 4.5);
      assert(contrast(documentation, background) < contrast(code, background));
      assert(oklch(documentation)!.c < oklch(code)!.c);
    }
    for (const [capture, treatment] of Object.entries(theme.syntax)) {
      if (capture !== "predictive" && treatment.color)
        assert(contrast(treatment.color, background) >= 4.5, capture);
    }
    for (const token of Object.values(tokens)) {
      assert(!String(token.value).startsWith("#FFFFFF"));
      assert(!String(token.value).startsWith("#000000") || token.value === "#00000000");
    }
  }
});
