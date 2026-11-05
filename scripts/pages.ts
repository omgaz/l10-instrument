import { cp, mkdir, writeFile } from "node:fs/promises";
import { build } from "./build.ts";
import { renderPreview } from "./preview.ts";

const { source, family, themes, vscode } = await build();
const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/site", root), { recursive: true });
await writeFile(
  new URL("dist/site/index.html", root),
  renderPreview(source, family, themes, vscode, ""),
);
await cp(new URL("assets/fonts", root), new URL("dist/site/assets/fonts", root), {
  recursive: true,
});
await cp(new URL("dist/tokens", root), new URL("dist/site/tokens", root), { recursive: true });
await cp(new URL("dist/ghostty", root), new URL("dist/site/ghostty", root), { recursive: true });
await cp(new URL("dist/iterm", root), new URL("dist/site/iterm", root), { recursive: true });
await cp(new URL("extensions/zed/themes", root), new URL("dist/site/zed", root), {
  recursive: true,
});
await cp(new URL("extensions/vscode/themes", root), new URL("dist/site/vscode", root), {
  recursive: true,
});
