import assert from "node:assert/strict";
import type { Source } from "./tokens.ts";
import { isColor, isRecord, resolveTokens } from "./tokens.ts";

type Theme = {
  name: string;
  type: "light" | "dark";
  colors: Record<string, string>;
  tokenColors: {
    scope: string[];
    settings: { foreground?: string; fontStyle?: string };
  }[];
  semanticHighlighting: true;
  semanticTokenColors: Record<string, { foreground: string; bold?: boolean; italic?: boolean }>;
};

const colorKeys = new Set([
  "foreground",
  "descriptionForeground",
  "disabledForeground",
  "errorForeground",
  "focusBorder",
  "contrastBorder",
  "contrastActiveBorder",
  "selection.background",
  "textLink.foreground",
  "textLink.activeForeground",
  "editor.background",
  "editor.foreground",
  "editorLineNumber.foreground",
  "editorLineNumber.activeForeground",
  "editor.lineHighlightBackground",
  "editor.lineHighlightBorder",
  "editor.selectionBackground",
  "editor.inactiveSelectionBackground",
  "editor.selectionHighlightBackground",
  "editor.wordHighlightBackground",
  "editor.wordHighlightStrongBackground",
  "editor.findMatchBackground",
  "editor.findMatchHighlightBackground",
  "editorBracketMatch.background",
  "editorBracketMatch.border",
  "editorCursor.foreground",
  "editorWhitespace.foreground",
  "editorIndentGuide.background1",
  "editorIndentGuide.activeBackground1",
  "editorRuler.foreground",
  "editorGutter.background",
  "editorError.foreground",
  "editorError.background",
  "editorError.border",
  "editorWarning.foreground",
  "editorWarning.background",
  "editorWarning.border",
  "editorInfo.foreground",
  "editorInfo.background",
  "editorInfo.border",
  "editorHint.foreground",
  "editorSuggestWidget.background",
  "editorSuggestWidget.foreground",
  "editorSuggestWidget.border",
  "editorSuggestWidget.selectedBackground",
  "editorSuggestWidget.highlightForeground",
  "sideBar.background",
  "sideBar.foreground",
  "sideBar.border",
  "sideBarTitle.foreground",
  "sideBarSectionHeader.background",
  "sideBarSectionHeader.foreground",
  "activityBar.background",
  "activityBar.foreground",
  "activityBar.inactiveForeground",
  "activityBar.border",
  "activityBarBadge.background",
  "activityBarBadge.foreground",
  "titleBar.activeBackground",
  "titleBar.activeForeground",
  "titleBar.inactiveBackground",
  "titleBar.inactiveForeground",
  "editorGroupHeader.tabsBackground",
  "tab.activeBackground",
  "tab.activeForeground",
  "tab.inactiveBackground",
  "tab.inactiveForeground",
  "tab.border",
  "tab.activeBorderTop",
  "tab.unfocusedActiveBorderTop",
  "statusBar.background",
  "statusBar.foreground",
  "statusBar.border",
  "statusBar.noFolderBackground",
  "statusBarItem.hoverBackground",
  "statusBarItem.remoteBackground",
  "statusBarItem.remoteForeground",
  "input.background",
  "input.foreground",
  "input.border",
  "input.placeholderForeground",
  "inputOption.activeBorder",
  "dropdown.background",
  "dropdown.foreground",
  "dropdown.border",
  "button.background",
  "button.foreground",
  "button.hoverBackground",
  "list.activeSelectionBackground",
  "list.activeSelectionForeground",
  "list.inactiveSelectionBackground",
  "list.inactiveSelectionForeground",
  "list.hoverBackground",
  "list.hoverForeground",
  "list.focusBackground",
  "list.focusForeground",
  "list.highlightForeground",
  "quickInput.background",
  "quickInput.foreground",
  "quickInputTitle.background",
  "panel.background",
  "panel.border",
  "panelTitle.activeBorder",
  "panelTitle.activeForeground",
  "panelTitle.inactiveForeground",
  "terminal.background",
  "terminal.foreground",
  "terminalCursor.foreground",
  "terminal.selectionBackground",
  "terminal.selectionForeground",
  "terminal.ansiBlack",
  "terminal.ansiRed",
  "terminal.ansiGreen",
  "terminal.ansiYellow",
  "terminal.ansiBlue",
  "terminal.ansiMagenta",
  "terminal.ansiCyan",
  "terminal.ansiWhite",
  "terminal.ansiBrightBlack",
  "terminal.ansiBrightRed",
  "terminal.ansiBrightGreen",
  "terminal.ansiBrightYellow",
  "terminal.ansiBrightBlue",
  "terminal.ansiBrightMagenta",
  "terminal.ansiBrightCyan",
  "terminal.ansiBrightWhite",
  "gitDecoration.addedResourceForeground",
  "gitDecoration.modifiedResourceForeground",
  "gitDecoration.deletedResourceForeground",
  "gitDecoration.renamedResourceForeground",
  "gitDecoration.untrackedResourceForeground",
  "gitDecoration.ignoredResourceForeground",
  "gitDecoration.conflictingResourceForeground",
  "problemsErrorIcon.foreground",
  "problemsWarningIcon.foreground",
  "problemsInfoIcon.foreground",
  "editorOverviewRuler.errorForeground",
  "editorOverviewRuler.warningForeground",
  "editorOverviewRuler.infoForeground",
  "editorOverviewRuler.border",
]);
const requiredColors = [
  "editor.background",
  "editor.foreground",
  "sideBar.background",
  "tab.activeBackground",
  "statusBar.background",
  "input.background",
  "list.activeSelectionBackground",
  "editorError.foreground",
  "editorWarning.foreground",
  "editorInfo.foreground",
  "gitDecoration.addedResourceForeground",
  "gitDecoration.modifiedResourceForeground",
  "gitDecoration.deletedResourceForeground",
  "terminal.ansiBlack",
  "terminal.ansiRed",
  "terminal.ansiGreen",
  "terminal.ansiYellow",
  "terminal.ansiBlue",
  "terminal.ansiMagenta",
  "terminal.ansiCyan",
  "terminal.ansiWhite",
  "terminal.ansiBrightBlack",
  "terminal.ansiBrightRed",
  "terminal.ansiBrightGreen",
  "terminal.ansiBrightYellow",
  "terminal.ansiBrightBlue",
  "terminal.ansiBrightMagenta",
  "terminal.ansiBrightCyan",
  "terminal.ansiBrightWhite",
];
const textMateStyleKeys = new Set(["foreground", "fontStyle"]);
const semanticTypes = new Set([
  "class",
  "enum",
  "interface",
  "namespace",
  "typeParameter",
  "type",
  "parameter",
  "variable",
  "property",
  "enumMember",
  "function",
  "method",
  "macro",
  "keyword",
  "string",
  "number",
  "regexp",
  "operator",
  "decorator",
  "label",
  "comment",
  "boolean",
]);
const semanticModifiers = new Set([
  "declaration",
  "definition",
  "readonly",
  "static",
  "abstract",
  "async",
  "modification",
  "documentation",
  "defaultLibrary",
  "local",
  "deprecated",
  "const",
  "public",
  "private",
  "protected",
  "exported",
  "constant",
  "native",
  "optional",
  "generated",
  "attribute",
  "virtual",
]);
const fontStyles = new Set(["bold", "italic", "underline", "strikethrough"]);

function assertOnlyKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) assert(allowed.has(key), `Unknown ${label} key: ${key}`);
}

function resolveColor(value: unknown, tokens: Source["typography"]): string {
  const resolved = resolveTokens(value, tokens);
  assert(isColor(resolved), `Expected a resolved VS Code color, got ${String(resolved)}`);
  return resolved;
}

function resolveBold(value: unknown, tokens: Source["typography"]): boolean {
  const resolved = resolveTokens(value, tokens);
  if (typeof resolved === "boolean") return resolved;
  assert(
    typeof resolved === "number" &&
      resolved >= 100 &&
      resolved <= 900 &&
      Number.isInteger(resolved / 100),
    "Expected a boolean or font weight for VS Code bold",
  );
  return resolved >= 600;
}

export function compileVscode(source: Source, mapping: unknown): Theme[] {
  assert(
    isRecord(source) &&
      isRecord(source.typography) &&
      isRecord(source.modes) &&
      isRecord(source.modes.light) &&
      isRecord(source.modes.dark),
    "Expected shared typography and resolved light/dark token dictionaries",
  );
  assert(isRecord(mapping), "Expected a VS Code theme mapping");
  assertOnlyKeys(mapping, new Set(["colors", "tokenColors", "semanticTokenColors"]), "mapping");
  assert(isRecord(mapping.colors), "Expected workbench color mappings");
  assert(Array.isArray(mapping.tokenColors), "Expected TextMate token mappings");
  assert(isRecord(mapping.semanticTokenColors), "Expected semantic token mappings");
  assert(mapping.tokenColors.length > 0, "Expected at least one TextMate token mapping");
  assert(Object.keys(mapping.semanticTokenColors).length > 0, "Expected semantic token mappings");
  for (const key of requiredColors) {
    assert(Object.hasOwn(mapping.colors, key), `Missing required VS Code workbench color: ${key}`);
  }

  const {
    colors: colorMapping,
    tokenColors: textMateMapping,
    semanticTokenColors: semanticMapping,
  } = mapping;
  const themes = (["light", "dark"] as const).map((type): Theme => {
    const tokens = { ...source.typography, ...source.modes[type] };
    const colors: Record<string, string> = {};
    for (const [key, value] of Object.entries(colorMapping)) {
      assert(colorKeys.has(key), `Unknown VS Code workbench color: ${key}`);
      colors[key] = resolveColor(value, tokens);
    }

    const tokenColors = textMateMapping.map((rule: unknown, index) => {
      assert(isRecord(rule), `Invalid TextMate rule at index ${index}`);
      assertOnlyKeys(rule, new Set(["scope", "settings"]), `TextMate rule at index ${index}`);
      assert(
        Array.isArray(rule.scope) &&
          rule.scope.length > 0 &&
          rule.scope.every((scope) => typeof scope === "string" && scope.length > 0),
        `Invalid TextMate scopes at index ${index}`,
      );
      assert(isRecord(rule.settings), `Invalid TextMate settings at index ${index}`);
      assertOnlyKeys(rule.settings, textMateStyleKeys, `TextMate settings at index ${index}`);
      assert(Object.keys(rule.settings).length > 0, `Empty TextMate settings at index ${index}`);
      const settings: { foreground?: string; fontStyle?: string } = {};
      if (Object.hasOwn(rule.settings, "foreground")) {
        settings.foreground = resolveColor(rule.settings.foreground, tokens);
      }
      if (Object.hasOwn(rule.settings, "fontStyle")) {
        const resolved = resolveTokens(rule.settings.fontStyle, tokens);
        const fontStyle =
          typeof resolved === "number"
            ? resolveBold(rule.settings.fontStyle, tokens)
              ? "bold"
              : ""
            : resolved;
        assert(
          typeof fontStyle === "string" &&
            (fontStyle === "" || fontStyle.split(/\s+/).every((style) => fontStyles.has(style))),
          `Invalid TextMate fontStyle at index ${index}`,
        );
        settings.fontStyle = fontStyle;
      }
      return {
        scope: rule.scope.map((scope) => {
          assert(typeof scope === "string");
          return scope;
        }),
        settings,
      };
    });

    const semanticTokenColors: Theme["semanticTokenColors"] = {};
    for (const [selector, value] of Object.entries(semanticMapping)) {
      assert(isRecord(value), `Invalid semantic token style: ${selector}`);
      const [typeName, ...modifiers] = selector.split(".");
      assert(
        (typeName === "*" || semanticTypes.has(typeName)) &&
          modifiers.every((modifier) => modifier === "*" || semanticModifiers.has(modifier)),
        `Unknown semantic token selector: ${selector}`,
      );
      assertOnlyKeys(
        value,
        new Set(["foreground", "bold", "italic"]),
        `semantic token style: ${selector}`,
      );
      assert(Object.hasOwn(value, "foreground"), `Missing semantic token foreground: ${selector}`);
      const style: Theme["semanticTokenColors"][string] = {
        foreground: resolveColor(value.foreground, tokens),
      };
      for (const key of ["bold", "italic"] as const) {
        if (Object.hasOwn(value, key)) {
          if (key === "bold") style.bold = resolveBold(value.bold, tokens);
          else {
            assert(typeof value.italic === "boolean", `Invalid semantic token italic: ${selector}`);
            style.italic = value.italic;
          }
        }
      }
      semanticTokenColors[selector] = style;
    }

    return {
      name: `L10 Instrument ${type === "light" ? "Light" : "Dark"}`,
      type,
      colors,
      tokenColors,
      semanticHighlighting: true,
      semanticTokenColors,
    };
  });

  assert(themes.length === 2, "Expected light and dark VS Code themes");
  return themes;
}
