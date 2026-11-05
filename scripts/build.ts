import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseSource } from "./tokens.ts";
import { compile } from "./zed.ts";
import { compileVscode } from "./vscode.ts";
import { compileTerminal } from "./terminal.ts";
import { exportTokens } from "./web.ts";
import { renderPreview } from "./preview.ts";

const root = new URL("../", import.meta.url);
const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export async function build(check = false) {
  const source = parseSource(await readJson("design-system/tokens.json"));
  const { family, themes } = compile(source, await readJson("design-system/zed.json"));
  const vscode = compileVscode(source, await readJson("design-system/vscode.json"));
  const terminal = compileTerminal(source, await readJson("design-system/terminal.json"));
  const web = exportTokens(source);
  const outputs: [string, string][] = [
    ["extensions/zed/themes/l10-instrument.json", json(family)],
    ...vscode.map((theme): [string, string] => [
      `extensions/vscode/themes/l10-instrument-${theme.type}-color-theme.json`,
      json(theme),
    ]),
    ...terminal.flatMap((theme): [string, string][] => [
      [`dist/ghostty/${theme.name}`, theme.ghostty],
      [`dist/iterm/${theme.name}.itermcolors`, theme.iterm],
    ]),
    ["dist/tokens/tokens.json", json(web.json)],
    ["dist/tokens/tokens.css", web.css],
  ];
  // check committed outputs only; ephemeral exports are checked by regression tests.
  for (const [path, content] of outputs) {
    const destination = new URL(path, root);
    if (check) {
      if (!path.startsWith("dist/")) {
        assert(
          (await readFile(destination, "utf8")) === content,
          `${path} is stale; run npm run build`,
        );
      }
    } else {
      await mkdir(new URL("./", destination), { recursive: true });
      await writeFile(destination, content);
    }
  }
  if (!check)
    await writeFile(new URL("index.html", root), renderPreview(source, family, themes, vscode));
  return { source, family, themes, vscode };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  assert(
    arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === "--check"),
    "Usage: node scripts/build.ts [--check]",
  );
  await build(arguments_[0] === "--check");
}
