<div align="center">
  <img src="site/logo.png" alt="OpenTick" width="128">

  # OpenTick Packs

  <a href="https://unlicense.org"><img src="https://img.shields.io/badge/license-Unlicense-blue.svg" alt="Unlicense"></a>
  <a href="https://github.com/JebbyCodes/OpenTick-Packs/actions/workflows/validate.yml"><img src="https://img.shields.io/github/actions/workflow/status/JebbyCodes/OpenTick-Packs/validate.yml?label=check%20packs" alt="Check packs"></a>
  <a href="https://github.com/JebbyCodes/OpenTick-Packs/actions/workflows/performance.yml"><img src="https://img.shields.io/github/actions/workflow/status/JebbyCodes/OpenTick-Packs/performance.yml?label=performance" alt="Performance check"></a>
  <a href="https://github.com/JebbyCodes/OpenTick"><img src="https://img.shields.io/badge/for-OpenTick-e09f00" alt="For OpenTick"></a>
</div>

The pack library for [OpenTick](https://github.com/JebbyCodes/OpenTick): ready-made **sections** and colour **themes**, made by people like you.

**Browse them:** https://jebbycodes.github.io/OpenTick-Packs/

## Using a pack

Every pack has a **code**, like `HN6G-1CE5`. In OpenTick open *Settings → Sections & packs → Pack library*, type the code, look at what is in the pack, and add it. You can also **browse the whole library** from the same place, or download a pack's file from the website and use *Add a pack…* instead.

OpenTick only contacts the library when you press one of those buttons, and sends nothing about you or your data. A pack is data only (sections, entries, colours): it cannot run code or read what you have.

## Sharing a pack

Send a pull request with one file, `packs/<id>.json`. See **[CONTRIBUTING.md](CONTRIBUTING.md)**: the GitHub website is enough, no Git needed. Every pull request gets two automatic checks, and a human review:

1. **Check packs.** OpenTick's own code reads the file and nothing may need changing, plus the library's rules (licence, version, size, readable themes, no personal data).
2. **Performance check.** The pack is installed into a real OpenTick in a headless browser on a slowed-down processor, and start-up time, memory, drawing time and errors are compared with the same app without it.

When it is merged the library is rebuilt and the pack's code works everywhere within a few minutes.

## How it fits together

```
packs/<id>.json          one pack per file: this is what people contribute
scripts/validate.mjs     check 1 (reads packs with OpenTick's own packParse; the rules are in scripts/lib/rules.mjs)
scripts/perf.mjs         check 2 (Playwright + Chromium; the limits are in perf-budget.json)
scripts/build-site.mjs   builds _site/: the website + index.json (every pack and its code) + packs/
site/                    the website (plain HTML, CSS and JS, no build step)
.github/workflows/       validate.yml, performance.yml, pr-comment.yml, publish.yml
```

- A pack's **code** is worked out from its `id` (`scripts/lib/codes.mjs`), so it never changes and nothing has to hand codes out.
- `index.json` is **generated** when a pull request is merged (`publish.yml`) and served by GitHub Pages together with the website and the pack files. It is not in the repository. OpenTick reads `index.json` and `packs/<id>.json` from there and checks every file against the size and SHA-256 the index lists.
- The checks use OpenTick's source (a checkout of the OpenTick repository, `main` by default) and its test harness, so the library accepts exactly what the app accepts. Set the repository variable `OPENTICK_REF` to pin a different branch or tag.

## Running it locally

You need [Node.js](https://nodejs.org) 24 or newer, the version the workflows use.

```sh
git clone https://github.com/JebbyCodes/OpenTick.git ../OpenTick
npm install && npx playwright install chromium
npm test         # the library's own tests (needs OpenTick next to this folder)
npm run check    # the rules, for every pack
npm run perf     # the performance and error check, for every pack
npm run serve    # build and open the website at http://localhost:8080
```

## For the maintainer

One-time setup is in [MAINTAINING.md](MAINTAINING.md).

## Licence

The tooling, the website and the logo are public domain under the [Unlicense](https://unlicense.org) (see [LICENSE](LICENSE)), the same as [OpenTick](https://github.com/JebbyCodes/OpenTick). The packs made by OpenTick are Unlicense too; every other pack keeps the licence in its own `license` field.
