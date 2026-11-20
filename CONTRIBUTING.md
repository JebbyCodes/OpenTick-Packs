# Sharing a pack

A pack is one small file that adds a ready-made **section** (a reading list, a plant journal, a study planner…) and/or a set of colour **themes** to OpenTick. Anyone can send one. It is checked automatically, reviewed, and then published with a **code** that people type into OpenTick.

You do not need to write code, and you do not need to know Git: the GitHub website is enough.

## 1. Make the pack in OpenTick

1. Build your section in OpenTick the way you like it (fields, a few example entries, the view). Make a theme in *Settings → Appearance* if you are sharing colours.
2. *Settings → Sections & packs →* **Export** (pick the sections and themes to include). You get a `.json` file. Open it in any text editor.
3. Fill in the top of the file:

| Field | What to put |
|---|---|
| `id` | Lower-case words joined by hyphens, at most 40 characters: `study-planner`. **It is the file's name** and it never changes (your pack's code is worked out from it). |
| `name` | What people see: "Study planner". |
| `version` | `1.0.0`. Raise it every time you change the pack. |
| `author` | Your name or username. |
| `description` | One sentence on what it is for (at least 10 characters). |
| `license` | One of `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `MIT`, `Apache-2.0`, `ISC`, `Unlicense`: it must let everyone use and share the pack. |
| `tags` | One to six lower-case topics, so people can find it: `["study", "school"]`. (This one is only used by the library.) |
| `homepage` | Optional: a link to you or the pack. |

The full format is in OpenTick's [PACKS.md](https://github.com/JebbyCodes/OpenTick/blob/main/docs/PACKS.md). Entries in a pack are **examples** to show how the section is meant to be used: keep them few, and never put anyone's real details in them.

## 2. Send it

**With just the website:**

1. Open the [`packs` folder](https://github.com/JebbyCodes/OpenTick-Packs/tree/main/packs) → **Add file → Create new file**.
2. Name it `packs/your-id.json` (the same as the pack's `id`) and paste the contents.
3. **Commit changes… → Propose changes → Create pull request.**

**With Git:** fork, add `packs/your-id.json`, push, open a pull request. Only change files in `packs/`.

## 3. The checks

Two automatic checks start by themselves and comment on your pull request. If one fails, the comment says what to change; fix it on the same branch and the checks run again.

**Check packs.** OpenTick itself reads your file, and nothing may need changing. Also checked: the file name matches the `id`; a valid `version`, `license`, `author`, `description` and `tags`; the size (400 KB at most); the code your pack will get (shown in the comment, and fixed once published); themes are readable (text against the background is at least 3:1, and 4.5:1 is recommended); and a warning if it looks like it contains an email address or a phone number.

**Performance check.** Your pack is installed into a real OpenTick in a headless browser, with the processor slowed down about four times (a mid-range phone), and compared with the same app without it. It measures:

| What | ⚠️ look at it | ❌ fails |
|---|---|---|
| Extra start-up time | 80 ms | 300 ms |
| Extra memory | 10 MB | 40 MB |
| First time each section is drawn | 250 ms | 900 ms |
| Redrawing a section | 150 ms | 500 ms |
| Elements on the screen in one section | 4 000 | 12 000 |
| Switching to one of your themes | 120 ms | 400 ms |

It also fails the pack for **any error** (on the page or in the console), for the app trying to **go online**, for a section that **draws nothing**, and for a theme that does not really change the colours. Most packs are far below every limit. If yours is over, the usual cause is too many entries or fields in one section: fewer examples is the fix.

## 4. Review

The maintainer reads every pack before it is merged. A pack is accepted when it is useful to other people, is yours (or is shared under a licence that allows it), has no personal data, is not an advertisement or a link farm, is not hateful, sexual, or illegal, and describes itself honestly. Review can ask for changes; it is not personal.

When it is merged, the website and the index are rebuilt and **the code works in every OpenTick within a few minutes**.

## Updating or removing a pack

- **Update:** change the same file and **raise `version`** (the check insists). People who already have the pack keep what they have; the library shows them there is a new version.
- **Remove:** open a pull request that deletes the file, or the "A problem with a pack" issue. Its code stops working.

## Trying it yourself first

```sh
git clone https://github.com/JebbyCodes/OpenTick.git ../OpenTick      # the checks use OpenTick's own code to read packs
npm install && npx playwright install chromium                        # only needed for the performance check
npm run check          # the rules
npm run perf           # the performance and error check (it builds OpenTick; takes a few minutes)
npm run serve          # the website, at http://localhost:8080
```

`OPENTICK_DIR=/path/to/OpenTick` points at OpenTick if it is not next to this folder.

## Licence

The library's tooling is public domain (the Unlicense). Every pack keeps the licence its author gave it in its own `license` field.
