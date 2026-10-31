# Development

## Prerequisites

[Node.js](https://nodejs.org) 20 or later, [pnpm](https://pnpm.io),
[Rust](https://rustup.rs) stable, and on Linux the
[Tauri system dependencies](https://tauri.app/start/prerequisites/#linux). The pull
request features need the [GitHub CLI](https://cli.github.com), signed in.

## Run and test

```sh
pnpm install
pnpm tauri dev         # the desktop app with hot reload
pnpm dev               # the interface alone in a browser, with no plans
pnpm test              # TypeScript tests
cargo test --workspace # Rust tests, from src-tauri/
```

A debug build uses its own profile and plan base, `~/.openplan-dev`, so it never
touches the plans of an installed copy. It never checks for updates.

The app's first run connects your agent tools. To connect one later from a terminal,
run the CLI bundled in the app, shown here for macOS:

```sh
/Applications/OpenPlan.app/Contents/MacOS/openplan install claude-code   # or codex, cursor
```

## Build installers

Release builds sign their update files, so a local build needs the update signing key
in the environment:

```sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/openplan.key)"
read -s TAURI_SIGNING_PRIVATE_KEY_PASSWORD && export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
pnpm tauri build
```

`read -s` takes the key's password without echoing it or saving it to shell history.
Bundles land in `src-tauri/target/release/bundle/`:
`.app` and `.dmg` on macOS, `.msi` and `.exe` on Windows, `.deb`, `.rpm` and `.AppImage`
on Linux.

## Release

1. Set the same version in `package.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` and the two crates under `src-tauri/crates/`.
2. Push an annotated tag, `v<version>`. Its message becomes the release notes the app
   shows.

CI builds all three platforms. Once every build passes, it uploads them to S3 and then
`latest.json`, which every installed copy checks. It refuses a tag that differs from
the app's version. PLAN.md records the hosting setup.

macOS builds are ad-hoc signed and not notarized, so the first launch of a download
needs Open Anyway in System Settings, under Privacy & Security.

## App icons

The icons come from `src-tauri/icons/source.svg`:

```sh
pnpm tauri icon src-tauri/icons/source.svg
```
