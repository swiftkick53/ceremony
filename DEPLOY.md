# Deploying Ceremony: hosted agent + phone

Written 2026-07-02. The agent now supports bearer-token auth (`CEREMONY_TOKEN`),
vault clone/push against a private remote (`CEREMONY_VAULT_REMOTE`), raw-audio
retention (`POST /api/dump-audio`, `Ceremony-Audio` trailers), and serving the
built PWA itself (one app = API + client). The Dockerfile and fly.toml at the
repo root put all of that together.

## 1. The vault's real home (one-time, on the ORIGINAL machine)

Create a **private** GitHub repo `ceremony-vault`, then:

```sh
cd vault
git remote add origin git@github.com:swiftkick53/ceremony-vault.git
git push -u origin main
```

Then create a fine-grained PAT scoped to just that repo, Contents: read/write.
The hosted agent uses it to clone on first boot and push after every commit.

## 2. Host the agent (Fly.io)

```sh
brew install flyctl && fly auth login
cd <this repo>
fly launch --no-deploy          # accept the existing fly.toml, create the app
fly volumes create ceremony_data --size 1
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-… \
  CEREMONY_TOKEN=<long random string> \
  CEREMONY_VAULT_REMOTE=https://x-access-token:<PAT>@github.com/swiftkick53/ceremony-vault.git
fly deploy                       # builds remotely; no local Docker needed
```

On first boot the agent clones the vault from the remote; every filing commit
pushes back. The same URL serves the PWA.

## 3. Phone, path A — installed PWA (works today)

On the phone, open `https://<app>.fly.dev/?token=<CEREMONY_TOKEN>` in Safari
once (the token lands in localStorage and is scrubbed from the URL), then
Share → **Add to Home Screen**. Voice capture records audio (kept in the
vault); live transcription depends on the browser.

## 4. Phone, path B — native app via TestFlight

The Capacitor project lives in `ceremony/ios/` (SPM, no CocoaPods). It bundles
the web build and uses **on-device Apple speech recognition** via
`@capacitor-community/speech-recognition`; mic + speech usage strings are in
Info.plist. On first launch it prompts for the agent URL and token.

Requires full Xcode (App Store download), then:

```sh
cd ceremony
npm run build && npx cap sync ios
npx cap open ios     # set your Team under Signing & Capabilities
```

Archive → Distribute → TestFlight (or run directly on a cabled device).
App Store proper is deliberately out of scope — a single-user app pointed at a
personal server will not pass review; TestFlight is the intended channel.

## Free hosting — the agent lives on your Mac

No Fly account needed. The agent runs as a login service on the Mac and the
phone reaches it over Tailscale (free personal plan) with a real HTTPS URL —
from anywhere, whenever the Mac is awake. Asleep? The app's outbox holds
dumps and files them on reconnect.

```sh
cd <this repo>
./scripts/setup-mac.sh
```

The script installs dependencies, asks for your keys (Anthropic, app token,
vault remote, optional OpenAI/Whisper), installs a launchd service that
starts at login and restarts on crash, then prints the two Tailscale
commands that give the phone its HTTPS address. Re-run it after `git pull`
to update — it keeps your saved keys. `./scripts/setup-mac.sh logs` tails
the agent; `./scripts/setup-mac.sh stop` removes the service.

The vault clones to `~/CeremonyVault` (open it in Obsidian) and still syncs
to your private `ceremony-vault` repo if you provide the remote URL.

## Local dev — unchanged

No `CEREMONY_TOKEN` set = no auth; no `CEREMONY_VAULT_REMOTE` = local-only
vault. `uvicorn main:app --port 8014` + `npm run dev` exactly as before.
NOTE: the agent venv must be Python 3.10+ (this machine: Homebrew 3.12).
