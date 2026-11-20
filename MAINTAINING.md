# Maintaining the library

## One-time setup on GitHub

1. **Pages:** *Settings → Pages → Build and deployment → Source:* **GitHub Actions**. (The site and `index.json` are published by `publish.yml`; OpenTick reads them from `https://jebbycodes.github.io/OpenTick-Packs/`.)
2. **Workflow permissions:** *Settings → Actions → General → Workflow permissions* can stay on "Read repository contents". The comment workflow asks for the one extra permission it needs in its own file. Under *Fork pull request workflows*, keep "Require approval for first-time contributors" **on**: the checks run a headless browser, so a person looks at a first pull request before it runs.
3. **Branch protection for `main`** (*Settings → Branches → Add rule*): require a pull request, require approval, **require review from Code Owners**, and require the status checks **Check packs** and **Performance check**.
4. **Labels** (optional): `pack-problem` (used by the issue form).

## When a pack is submitted

1. Approve the workflow run if GitHub asks (first-time contributor).
2. Read the two comments the bot leaves: the **code** the pack will get, the problems, the speed table.
3. Read the pack itself ("Files changed"): is it useful, original or properly licensed, free of personal data, free of ads and spam, appropriate?
4. Merge. `publish.yml` checks everything once more and publishes; the code works in OpenTick within a few minutes.

To take a pack down: delete its file in a pull request (or straight on `main`). Its code stops working at the next publish.

## Things to know

- **Codes never change**, because they come from the pack's `id` (`scripts/lib/codes.mjs`). Never change that function, and never rename a pack's file after it is published (that makes a new pack with a new code). `test/run.mjs` has fixed examples that fail if the codes change.
- **The checks need OpenTick's source** (`actions/checkout` of `JebbyCodes/OpenTick`, `main`). If OpenTick changes the pack format in a way that breaks a published pack, the weekly run (and the next pull request) will say so. To hold the library on a known-good OpenTick while that is sorted out, set the repository variable `OPENTICK_REF` (*Settings → Secrets and variables → Actions → Variables*) to a tag, for example `v0.9.0`.
- **Limits** are in `perf-budget.json`; change them there. Shared GitHub machines are noisy, so a ⚠️ means "look" and only ❌ fails; a start-up failure is measured twice before it is reported.
- **A new OpenTick release** changes nothing here unless the pack or index format changed. The index has `"format": 1`; OpenTick refuses a newer index politely ("please update OpenTick").
- **Run it on demand:** *Actions → Performance check → Run workflow* (leave the box empty for every pack, or list pack ids).
- **Keeping the workflows current:** every workflow runs on Node.js 24 (the same as OpenTick's own CI) and on action versions that themselves run on Node 24. Dependabot (`.github/dependabot.yml`) opens a pull request when an action has a newer version. When a new Node.js LTS line becomes the one OpenTick uses, change `node-version` in the three workflows that set it and `engines` in `package.json` together.
