# L10 Instrument

## Purpose

L10 Instrument is a colour system for developer tools. It has light and dark
themes for Zed and VS Code. It also has colour themes for Ghostty and iTerm2.
The project exports tokens for web use.

The GitHub repository and GitHub Pages preview are public. The project is not
submitted to extension stores or theme repositories.

## Design language

L10 Instrument takes ideas from Braun products, Leica instruments, Swiss
information design and code editor conventions.

The aim is calm information density. Code should be easy to read and recognise.
Comments, punctuation and inactive interface elements should be quieter.

Every visual difference must help the developer.

- Use warm surfaces. Do not use pure black or pure white.
- Use colour to show meaning, not for decoration.
- Use contrast and type weight to show hierarchy before adding more colours.
- Keep light and dark modes related, but tune them separately.
- Do not rely on colour alone for important states.
- Keep readability ahead of visual style.

## Colour roles

| Colour family | Meaning                       |
| ------------- | ----------------------------- |
| Blue          | Types and structure           |
| Petrol        | Functions and behaviour       |
| Coral         | Keywords and control flow     |
| Ochre         | Parameters and inputs         |
| Sage          | Properties and attributes     |
| Ink or navy   | Strings and written data      |
| Violet        | Numbers and booleans          |
| Neutral       | Ordinary identifiers          |
| Grey          | Comments and prose            |
| Red           | Errors and destructive states |

Use the same meaning across languages when the syntax captures allow it.
For example, a TypeScript property, CSS property, JSON key and HCL attribute
can all use sage.

Types, control flow, errors and important states should be easy to find.
Functions, variables, parameters, properties and literals can use distinct
colours because developers learn these patterns with use.
Punctuation, comments, line numbers and guides should support the code without
competing with it.

### Comments and documentation

Comments use opaque grey. They must remain readable.

JSDoc often carries type information in JavaScript projects. Keep tags, types
and variables recognisable by their code roles. Use quieter versions of those
colours. Keep prose grey.

Do not add backgrounds or boxes to documentation. They make comments compete
with code.

## Accessibility

The build checks a 4.5:1 contrast ratio for configured source-code colours,
including comments and JSDoc, against the editor background. It also checks
all 16 ANSI foreground colours against the terminal background.

These checks do not cover every interface state. They do not cover other
terminal backgrounds, inverse video or dim text. Predictive text may use lower
contrast.

Check both themes in the target application. Do not treat the preview as proof
of real syntax highlighting.

## Token model

The dependency direction is:

**palette -> semantic role -> target mapping**

Palette anchors define colour families. Semantic roles give those colours
meaning. Each target maps roles to its own style names or syntax captures.

Keep semantic roles separate, even when they use the same palette anchor. This
lets a role change without changing every other use.

Edit these files:

| File                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `design-system/tokens.json`   | Palette anchors, semantic roles, derivations and type tokens   |
| `design-system/zed.json`      | Zed interface colours and syntax captures                      |
| `design-system/vscode.json`   | VS Code interface colours, TextMate scopes and semantic tokens |
| `design-system/terminal.json` | Ghostty and iTerm2 colour mappings                             |

Do not edit generated files by hand.

### Colour values

Author palette anchors in OKLCH. A colour token can also use a hex value, a
reference to another token or a derivation.

A derivation can mix two colours, change lightness or chroma, set alpha, or
require a minimum contrast ratio. `amount` is the mix proportion. `chroma`
multiplies the colour's chroma. Both values range from 0 to 1.

The build reduces chroma when needed to fit the sRGB colour space. It preserves
lightness and hue during this conversion.

The neutral ramp mixes ink and paper. The suffix is the paper percentage.
For example, `palette.neutral.40` uses 40% paper. It does not mean 40% opacity.

Comments use a fully desaturated ink-and-paper mix. JSDoc colours derive from
their matching code role. They move towards the editor surface and retain less
chroma.

Contrast derivations adjust lightness only when the generated colour falls
below its minimum. The check uses the final, rounded hex value. The build fails
if it cannot reach the requested contrast.

Pure black and pure white are not allowed. Fully transparent `#00000000` is
allowed for borders and overlays.

## Build and preview

Use Node.js 26 or newer. `.nvmrc` selects Node.js 26.

```sh
npm ci
npm run build
npm run lint
npm run check
```

`npm run build` resolves tokens and writes the generated outputs. It also
creates `index.html`.
`npm run lint` checks TypeScript rules and formatting. `npm run fix` applies
safe lint fixes and formats supported files.

The preview loads `dist/tokens/tokens.css`. Its surfaces, interface elements
and token samples use the exported CSS variables. This checks that the CSS
export works in a browser.

The code sample uses fixed syntax labels. It does not run a parser or Zed's
language server. The sample uses Zed's configured syntax colours. Check actual
captures in Zed and VS Code.

The preview uses Fira Code and IBM Plex Sans. Both fonts are bundled for offline
use. Their licence files are in `assets/fonts/`. Applications set their own
fonts.

## Generated outputs

| Output                | Location                                    |
| --------------------- | ------------------------------------------- |
| Zed theme family      | `extensions/zed/themes/l10-instrument.json` |
| VS Code themes        | `extensions/vscode/themes/`                 |
| Ghostty themes        | `dist/ghostty/`                             |
| iTerm2 themes         | `dist/iterm/`                               |
| Resolved token JSON   | `dist/tokens/tokens.json`                   |
| CSS custom properties | `dist/tokens/tokens.css`                    |
| Local preview         | `index.html`                                |
| GitHub Pages site     | `dist/site/`                                |

The Zed and VS Code theme files are committed. The other generated files are
ignored by Git. GitHub Actions checks the project and deploys the Pages site
from `main`. The site includes the preview and theme downloads.

The project does not publish to theme stores or extension marketplaces.
Prepare each submission separately when that becomes a goal.

## Checks

`npm run check` runs lint, TypeScript checks, regression tests and generated
theme checks. It fails if a committed editor theme is out of date.

`npm test` runs only the regression tests.

The Zed exporter validates the output against the local copy of Zed's official
theme schema. Update `design-system/zed-schema.json` deliberately when adopting
new Zed fields. The build works offline after `npm ci`.

The tests check configured captures and generated mappings. They do not prove
that every language uses those captures. Check TypeScript, JSDoc, Markdown and
embedded languages in each target application.

## Target details

Zed uses numeric font weights. VS Code supports normal or bold TextMate styles.
The VS Code exporter converts numeric weights to those styles. It also writes
semantic token rules.

The terminal exporter creates colour-only Ghostty files and iTerm2 sRGB
property lists. Both use the same 16-colour ANSI palette. Cursor and selection
colours have separate tokens.

The web exporter provides resolved JSON and CSS custom properties. It includes
semantic and type tokens. It does not expose palette anchors in CSS. The CSS
uses the system appearance by default. Set `data-l10-theme="light"` or
`data-l10-theme="dark"` on an element to choose a mode for that element and its
children.

The web token format is local to this project. It is not the DTCG format.

The CSS export has an opt-in materials layer (web only; editors and terminals stay
flat). Nothing applies until an ancestor has `data-l10-texture="on"`; then
`data-l10-material` picks the role: `page` (matte stock, grain and top-lit falloff),
`card` (paper grain, lip, shadow), `recessed` (inset, no grain), `input` (chalk: lighter,
no grain) and `button` / `button primary` (enamel). Code and alerts stay flat and need
an opaque background. `prefers-contrast: more` and `prefers-reduced-transparency`
remove grain, gradients and shadows.

Grain is an SVG `fractalNoise` tile whose noise drives alpha only, coloured by
`texture.grain.*` (ink with `multiply` in light, paper with `overlay` in dark); token
alpha is the grain's maximum. The build checks text, muted, placeholder and button
labels against each material at its extremes (full grain, falloff, sheen, shade) and
fails below 4.5:1. Primary sheen stops at `min(26%, padding)`, so only the shade is
checked under the label.

## Colour decisions

Properties and attributes share sage. Ordinary identifiers use material
neutrals. Syntax titles, links and accents reuse existing colour families.
These choices reduce needless colour differences.

UI roles keep separate tokens even when they share a neutral anchor. This lets
each role change on its own. Selection, brand and terminal colours stay
separate when combining them would lose useful meaning.

Terminal bright colours reuse their normal colour families. The build adjusts
some light-mode bright colours to meet the contrast target. Normal light yellow
uses a 5:1 target so bright yellow can remain distinct.

The OKLCH values are a considered palette, not a byte-for-byte copy of an older
theme.

## Publishing

The public GitHub repository and Pages site are the current distribution
channels. The Pages site includes theme downloads.

Store and theme-repository submissions are out of scope for now. Before a
submission, check the target's current requirements and test the final files
in the target application.
