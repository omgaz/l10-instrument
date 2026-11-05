import assert from "node:assert/strict";
import { isColor } from "./tokens.ts";
import type { Source } from "./tokens.ts";
import type { Family, Theme, Highlight } from "./zed.ts";
import type { compileVscode } from "./vscode.ts";

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export function contrast(foreground: string, background: string): number {
  assert(isColor(foreground) && isColor(background), "Contrast requires hex colors");
  assert(
    background.length === 7 || background.slice(7).toLowerCase() === "ff",
    "Contrast requires an opaque background",
  );
  const channels = (color: string) =>
    [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const backdrop = channels(background);
  const alpha = foreground.length === 9 ? parseInt(foreground.slice(7), 16) / 255 : 1;
  const composite = channels(foreground).map(
    (channel, index) => channel * alpha + backdrop[index] * (1 - alpha),
  );
  const luminance = (rgb: number[]) =>
    rgb
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const light = luminance(composite);
  const dark = luminance(backdrop);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

// Explicit Zed capture labels keep the specimen offline, not a live highlighting engine.
const specimen: [string, string][] = [
  ["keyword", "interface "],
  ["type", "Instrument"],
  ["punctuation.bracket", " {\n  "],
  ["property", "name"],
  ["punctuation", ": "],
  ["type.builtin", "string"],
  ["punctuation", ";\n  "],
  ["property", "gain"],
  ["punctuation", ": "],
  ["type.builtin", "number"],
  ["punctuation", ";\n"],
  ["punctuation.bracket", "}\n\n"],
  ["keyword", "function "],
  ["function", "calibrate"],
  ["punctuation.bracket", "<"],
  ["type", "T"],
  ["keyword", " extends "],
  ["type", "Instrument"],
  ["punctuation.bracket", ">"],
  ["punctuation.bracket", "("],
  ["variable.parameter", "input"],
  ["punctuation", ": "],
  ["type", "T"],
  ["punctuation.bracket", ")"],
  ["punctuation", ": "],
  ["type", "T"],
  ["punctuation.bracket", " {\n  "],
  ["keyword", "const "],
  ["variable", "label"],
  ["operator", " = "],
  ["string", '"L10"'],
  ["punctuation", ";\n  "],
  ["comment", "// Preserve the input's specific type.\n  "],
  ["keyword", "return "],
  ["punctuation.bracket", "{ "],
  ["operator", "..."],
  ["variable.parameter", "input"],
  ["punctuation", ", "],
  ["property", "name"],
  ["punctuation", ": "],
  ["variable", "label"],
  ["punctuation", ", "],
  ["property", "gain"],
  ["punctuation", ": "],
  ["variable.parameter", "input"],
  ["punctuation", "."],
  ["property", "gain"],
  ["operator", " * "],
  ["number", "1.25"],
  ["punctuation.bracket", " }"],
  ["punctuation", ";\n"],
  ["punctuation.bracket", "}\n\n"],
  ["keyword", "const "],
  ["variable", "instrument"],
  ["operator", " = "],
  ["function", "calibrate"],
  ["punctuation.bracket", "({ "],
  ["property", "name"],
  ["punctuation", ": "],
  ["string", '"L10"'],
  ["punctuation", ", "],
  ["property", "gain"],
  ["punctuation", ": "],
  ["number", "1"],
  ["punctuation", ", "],
  ["property", "active"],
  ["punctuation", ": "],
  ["boolean", "true"],
  ["punctuation.bracket", " })"],
  ["punctuation", ";"],
];

export function renderPreview(
  source: Source,
  family: Family,
  themes: Theme[],
  vscode: ReturnType<typeof compileVscode> = [],
  downloadPrefix = "dist/",
): string {
  const semanticRoles = [
    ["code.control", "Coral / rust", "Control", "Language, control flow and high-attention syntax"],
    ["code.structure", "TypeScript blue", "Structure", "Types, interfaces, constructors and enums"],
    ["code.behaviour", "Petrol / cyan", "Behaviour", "Functions, methods and executable behaviour"],
    ["code.input", "Ochre / amber", "Input", "Parameters, inputs and special values"],
    ["code.property", "Sage", "Attributes", "Properties and named attributes across languages"],
    ["code.literal", "Ink / navy", "Literal data", "Strings and written data"],
    ["code.scalar", "Violet", "Scalar values", "Numbers and booleans"],
    [
      "code.variable",
      "Warm charcoal / cool neutral",
      "Identifiers",
      "Ordinary working identifiers",
    ],
    ["code.comment", "Grey", "Commentary", "Opaque grey prose; readable but subordinate to code"],
    [
      "error",
      "Diagnostic red",
      "Errors",
      "Errors and destructive states, supported by non-colour cues",
    ],
  ] as const;
  const sections = themes.map((theme) => {
    const mode = theme.appearance;
    const color = (key: string): string => {
      const value = theme.style[key];
      assert(isColor(value), `Preview requires color: ${key}`);
      return value;
    };
    const cssColor = (value: string, preferredName?: string): string => {
      const tokens = { ...source.typography, ...source.modes[mode] };
      const preferred = preferredName ? tokens[preferredName] : undefined;
      if (preferredName && preferred?.type === "color" && preferred.value === value) {
        return `var(--l10-${preferredName.replace(/[._]/g, "-")})`;
      }
      const token = Object.entries(tokens).find(
        ([name, candidate]) =>
          !name.startsWith("palette.") && candidate.type === "color" && candidate.value === value,
      );
      return token ? `var(--l10-${token[0].replace(/[._]/g, "-")})` : value;
    };
    const background = color("editor.background");
    const roleRows = semanticRoles
      .map(([name, familyName, label, meaning]) => {
        const token = source.modes[mode][name];
        assert(token?.type === "color", `Semantic legend requires color: ${name}`);
        return `<tr><th scope="row">${label}</th><td><span class="swatch" style="background:${cssColor(token.value, name)}" aria-hidden="true"></span>${familyName}</td><td>${meaning}<br><code>${name}</code></td></tr>`;
      })
      .join("\n");
    const annotationRows = ["control", "structure", "variable"]
      .map((role) => {
        const code = source.modes[mode][`code.${role}`];
        const annotation = source.modes[mode][`documentation.${role}`];
        assert(
          code?.type === "color" && annotation?.type === "color",
          `Annotation legend requires color roles: ${role}`,
        );
        return `<tr><th scope="row">${role}</th><td><span style="color:${cssColor(code.value, `code.${role}`)}">Code ${role}</span><br><code>code.${role}</code></td><td><span style="color:${cssColor(annotation.value, `documentation.${role}`)}">JSDoc ${role}</span><br><code>documentation.${role}</code></td></tr>`;
      })
      .join("\n");
    const treatmentFor = (capture: string): Highlight => {
      let candidate = capture;
      while (candidate) {
        if (Object.hasOwn(theme.syntax, candidate)) return theme.syntax[candidate];
        candidate = candidate.includes(".") ? candidate.slice(0, candidate.lastIndexOf(".")) : "";
      }
      return {};
    };
    const highlight = (capture: string, text: string) => {
      const style = treatmentFor(capture);
      const treatment = [
        `color:${cssColor(style.color ?? color("editor.foreground"))}`,
        `font-weight:${style.font_weight ?? 400}`,
        `font-style:${style.font_style ?? "normal"}`,
      ].join(";");
      return `<span style="${treatment}" title="${escapeHtml(capture)}">${escapeHtml(text)}</span>`;
    };
    const captures = Object.entries(theme.syntax)
      .map(([capture, style]) => {
        const ratio = contrast(style.color ?? color("editor.foreground"), background);
        const meets = ratio >= 4.5;
        const label = `${ratio.toFixed(2)}:1 ${meets ? "meets" : "is below"} the 4.5:1 target`;
        const foreground = style.color ?? color("editor.foreground");
        return `<tr><th scope="row"><code>${escapeHtml(capture)}</code></th><td><code class="syntax-color"><span class="color-dot" style="background:${cssColor(foreground)}" aria-hidden="true"></span>${foreground}</code>${style.color === undefined ? " (inherited)" : ""}</td><td>${style.font_weight ?? "inherited"} / ${style.font_style ?? "normal"}</td><td><span class="contrast-pill ${meets ? "pass" : "fail"}" aria-label="${label}" title="${label}" style="color:${cssColor(color(meets ? "success" : "warning"))}"><span aria-hidden="true">${meets ? "&#10003;" : "!"}</span></span></td></tr>`;
      })
      .join("\n");
    const lineNumbers = specimen
      .map(([, text]) => text)
      .join("")
      .split("\n")
      .map((_, index) => index + 1)
      .join("\n");
    const terminalColor = (name: string) => {
      const token = source.modes[mode][`terminal.${name}`];
      assert(token?.type === "color", `Terminal preview requires color: ${name}`);
      return cssColor(token.value, `terminal.${name}`);
    };
    const ansiNames = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
    const ansi = [...ansiNames, ...ansiNames.map((name) => `bright_${name}`)]
      .map(
        (name, index) =>
          `<span style="color:${terminalColor(`ansi.${name}`)}">${index}: ${name.replace("_", " ")} </span>`,
      )
      .join("\n");
    const vscodeTheme = vscode.find((candidate) => candidate.type === mode);
    const mappingRows = vscodeTheme
      ? Object.entries(vscodeTheme.semanticTokenColors)
          .map(
            ([capture, style]) =>
              `<tr><th scope="row"><code>${escapeHtml(capture)}</code></th><td><code style="color:${cssColor(style.foreground)}">${style.foreground}</code></td><td>${style.bold ? "bold" : "normal"}</td></tr>`,
          )
          .join("\n")
      : "";
    return {
      preview: `<section id="${mode}" data-l10-theme="${mode}">
<h2>${mode === "light" ? "Light" : "Dark"}</h2>
<div class="instrument"><div class="toolbar">instrument.ts &middot; TypeScript reference</div><div class="editor-preview" tabindex="0" role="region" aria-label="${mode} TypeScript reference"><pre class="line-numbers" aria-hidden="true">${lineNumbers}</pre><pre class="source-code"><code>${specimen.map(([capture, text]) => highlight(capture, text)).join("")}</code></pre></div></div>
</section>`,
      reference: `<section id="${mode}-tokens" data-l10-theme="${mode}">
<h2>${mode === "light" ? "Light" : "Dark"} tokens</h2>
<h3>Terminal palette</h3>
<p>Download: <a href="${downloadPrefix}ghostty/L10%20Instrument%20${mode === "light" ? "Light" : "Dark"}" download>Ghostty</a> &middot; <a href="${downloadPrefix}iterm/L10%20Instrument%20${mode === "light" ? "Light" : "Dark"}.itermcolors" download>iTerm2</a>.</p>
<pre class="terminal-preview" tabindex="0" role="region" aria-label="${mode} ANSI terminal palette"><code>L10 Instrument / ANSI colour indices
${ansi}
<span style="color:${terminalColor("selection_foreground")};background:${terminalColor("selection_background")}"> Selected text </span> <span style="color:${terminalColor("cursor_text")};background:${terminalColor("cursor")}">Cursor</span></code></pre>
<h3>Semantic colour language</h3>
<div class="table-scroll" tabindex="0" role="region" aria-label="${mode} semantic colour language"><table><caption>Colour families and developer meaning</caption><thead><tr><th scope="col">Role</th><th scope="col">Family</th><th scope="col">Meaning / token</th></tr></thead><tbody>${roleRows}</tbody></table></div>
<h3>Documentation</h3>
<p>Grey prose; semantic annotations retain quieter forms of their code colours.</p>
<div class="table-scroll" tabindex="0" role="region" aria-label="${mode} code and documentation relationships"><table><caption>Code roles and their muted JSDoc counterparts</caption><thead><tr><th scope="col">Role</th><th scope="col">Executable code</th><th scope="col">Derived annotation</th></tr></thead><tbody>${annotationRows}</tbody></table></div>
<div class="table-scroll" tabindex="0" role="region" aria-label="${mode} syntax treatments"><table class="syntax-treatments"><caption>Syntax and type treatments</caption><thead><tr><th scope="col">Capture</th><th scope="col">Color</th><th scope="col">Weight / style</th><th scope="col">Contrast</th></tr></thead><tbody>${captures}</tbody></table></div>
${vscodeTheme ? `<h3>VS Code semantic mappings</h3><div class="table-scroll" tabindex="0" role="region" aria-label="${mode} VS Code semantic mappings"><table><caption>Semantic token rules</caption><thead><tr><th scope="col">Selector</th><th scope="col">Colour</th><th scope="col">Weight</th></tr></thead><tbody>${mappingRows}</tbody></table></div>` : ""}
</section>`,
    };
  });
  return `<!doctype html>
<!-- Generated by npm run build. Edit design-system/ and scripts/preview.ts, not this file. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(family.name)} &mdash; design system</title>
<link rel="stylesheet" href="${downloadPrefix}tokens/tokens.css">
<style>
@font-face{font-family:"Fira Code";src:url("assets/fonts/FiraCode-VF.woff2") format("woff2");font-weight:300 700;font-style:normal;font-display:swap}
@font-face{font-family:"IBM Plex Sans";src:url("assets/fonts/IBMPlexSans-latin-ext.woff2") format("woff2");font-weight:400 600;font-style:normal;font-display:swap;unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"IBM Plex Sans";src:url("assets/fonts/IBMPlexSans-latin.woff2") format("woff2");font-weight:400 600;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
.syntax-color{display:inline-flex;align-items:center;gap:.5rem;white-space:nowrap;overflow-wrap:normal}.color-dot{display:inline-block;width:.8rem;height:.8rem;flex:none;border-radius:50%}
.contrast-pill{display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;padding:0;border:1px solid currentColor;border-radius:50%;white-space:nowrap}.syntax-treatments th:last-child,.syntax-treatments td:last-child{text-align:center}
:root{--grid-columns:${source.grid.columns};--grid-gutter:${source.grid.gutter};--grid-margin:${source.grid.pageMargin};--grid-max-width:${source.grid.maxWidth};font-family:"IBM Plex Sans",system-ui,sans-serif;line-height:1.55;background:var(--l10-surface-canvas);color:var(--l10-text-primary)}
*{box-sizing:border-box}body{margin:0}header,main{max-width:var(--grid-max-width);margin-inline:auto}header{padding:var(--grid-margin)}h1,h2{font-weight:600;line-height:1.2}h1{font-size:clamp(2rem,5vw,3rem);margin:.5rem 0}h2{font-size:1.6rem}p{max-width:75ch}nav{display:flex;gap:1.5rem;flex-wrap:wrap}a{color:inherit;text-underline-offset:.2em}:focus-visible{outline:3px solid var(--l10-border-focused);outline-offset:4px}main{display:grid;grid-template-columns:repeat(var(--grid-columns),minmax(0,1fr));gap:var(--grid-gutter)}section{grid-column:span 6;background:var(--l10-surface-canvas);color:var(--l10-text-primary);min-width:0;padding:var(--grid-margin);border-top:1px solid var(--l10-border-variant)}section>p{color:var(--l10-text-muted)}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.875rem}.instrument{border:1px solid var(--l10-border-variant);border-radius:4px;overflow:hidden}.toolbar{background:var(--l10-toolbar-background);color:var(--l10-text-muted);padding:.6rem 1rem;font-size:.85rem}.editor-preview{display:flex;overflow:auto;background:var(--l10-surface-editor);color:var(--l10-editor-foreground)}pre{background:var(--l10-surface-editor);margin:0;padding:1.25rem;overflow:auto;tab-size:2}.editor-preview pre{overflow:visible;line-height:1.55;padding-block:1.25rem}.editor-preview .line-numbers{flex:none;padding-inline:.75rem;background:var(--l10-editor-gutter-background);color:var(--l10-editor-line-number);text-align:right;user-select:none}.editor-preview .source-code{flex:1;padding-inline:.75rem 1.25rem}.terminal-preview{background:var(--l10-terminal-background);color:var(--l10-terminal-foreground)}.table-scroll{overflow:auto;margin:1.5rem 0;background:var(--l10-surface-editor);border:1px solid var(--l10-border-variant)}table{border-collapse:collapse;width:100%;text-align:left;font-size:.85rem}caption{text-align:left;font-weight:600;padding:1rem}th,td{padding:.65rem .8rem;border-top:1px solid var(--l10-border-variant);vertical-align:middle}tbody th{font-weight:400}thead{background:var(--l10-surface-raised)}td{white-space:normal}td code{overflow-wrap:anywhere}.swatch{display:inline-block;width:1.2rem;height:1.2rem;border:1px solid var(--l10-text-muted);vertical-align:middle;margin-right:.65rem}summary{cursor:pointer;padding:.75rem 0}details{margin-bottom:1.5rem}@media(max-width:${source.grid.breakpoint}){section{grid-column:1/-1}}
code,pre{font-family:"Fira Code",ui-monospace,SFMono-Regular,Consolas,monospace}
header{padding-block:1.25rem}header>p{margin:.5rem 0}h2{margin:0 0 1rem}section{padding-block:1.25rem}.usage{grid-column:1/-1}footer{max-width:var(--grid-max-width);margin-inline:auto;padding:1.5rem var(--grid-margin);font-size:.875rem}
</style></head><body>
<header id="top"><h1>${escapeHtml(family.name)}</h1><p>Warm materials. Purposeful colour. Calm information density.<br>One design language for Zed, VS Code, terminals and the web.</p></header>
<main>${sections.map((section) => section.preview).join("\n")}
<section class="usage" aria-labelledby="usage"><h2 id="usage">Use the tokens</h2>
<p><a href="${downloadPrefix}tokens/tokens.css" download>CSS custom properties</a> &middot; <a href="${downloadPrefix}tokens/tokens.json" download>Resolved JSON</a></p>
<pre><code>background: var(--l10-surface-canvas);
color: var(--l10-text-primary);</code></pre>
<p>Load the CSS to follow system appearance. Override with <code>data-l10-theme="light"</code> or <code>data-l10-theme="dark"</code> on your HTML element or a subtree.</p>
</section>
${sections.map((section) => section.reference).join("\n")}</main>
<footer><p>Preview fonts: Fira Code and IBM Plex Sans (SIL Open Font License). Applications set their own typography.</p>
<p>Specimens use explicit labels, not live highlighting. The TypeScript sample and capture table use Zed mappings; verify actual scopes and semantic tokens in your editor.</p>
<p>Contrast markers use the <a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html">WCAG AA 4.5:1 target</a> against the editor background, including alpha. All ANSI foregrounds meet the same target on the terminal background. Predictive text and navigation may recede; arbitrary backgrounds, inverse video and dimmed text need separate checks.</p>
<h2>Social responsibility</h2>
<p>Build tools that help people. Respect privacy, support accessibility and consider the effects of your work on people and the environment. Do not use this work to harm, exploit or discriminate against others.</p>
<p>This statement expresses the project's values. It does not add restrictions to the MIT licence.</p>
<a href="#top">Back to top</a></footer></body></html>
`;
}
