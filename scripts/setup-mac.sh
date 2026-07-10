#!/usr/bin/env bash
# Ceremony — run the agent on this Mac, free, as a login service.
#
#   ./scripts/setup-mac.sh          set up (or update) the service
#   ./scripts/setup-mac.sh stop     stop and remove the service
#   ./scripts/setup-mac.sh logs     tail the agent log
#
# The agent starts at login, restarts if it crashes, and listens on port
# 8014. Pair it with Tailscale (free) for an HTTPS address the iPhone app
# can use from anywhere — the script prints those steps at the end.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_DIR="$REPO_DIR/agent"
PLIST="$HOME/Library/LaunchAgents/com.ceremony.agent.plist"
LOG="$HOME/Library/Logs/ceremony-agent.log"
VAULT_DIR="$HOME/CeremonyVault"
LABEL="com.ceremony.agent"

case "${1:-}" in
  stop)
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "service stopped and removed."
    exit 0 ;;
  logs)
    exec tail -f "$LOG" ;;
esac

if [[ "$(uname)" != "Darwin" ]]; then
  echo "this script is for macOS (it installs a launchd service)." >&2
  exit 1
fi

PYTHON="$(command -v python3.12 || command -v python3.11 || command -v python3 || true)"
if [[ -z "$PYTHON" ]]; then
  echo "python3 not found — install it with: brew install python" >&2
  exit 1
fi

echo "== Ceremony local agent setup =="
echo "repo:  $REPO_DIR"
echo "vault: $VAULT_DIR"
echo

echo "-- installing the agent's dependencies"
cd "$AGENT_DIR"
[[ -d .venv ]] || "$PYTHON" -m venv .venv
.venv/bin/pip -q install -r requirements.txt

# Reuse previously-entered secrets on re-runs so updates are one command.
get_saved() { [[ -f "$PLIST" ]] && /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:$1" "$PLIST" 2>/dev/null || true; }

prompt_secret() { # name, question, saved
  local saved="$3" val
  if [[ -n "$saved" ]]; then
    read -rp "$2 [press enter to keep saved]: " val
    echo "${val:-$saved}"
  else
    read -rp "$2: " val
    echo "$val"
  fi
}

echo
echo "-- configuration (stored only in $PLIST, chmod 600)"
ANTHROPIC_KEY="$(prompt_secret ANTHROPIC_API_KEY "Anthropic API key (sk-ant-…)" "$(get_saved ANTHROPIC_API_KEY)")"
TOKEN="$(prompt_secret CEREMONY_TOKEN "App token (the one the phone app presents)" "$(get_saved CEREMONY_TOKEN)")"
REMOTE="$(prompt_secret CEREMONY_VAULT_REMOTE "Vault remote (https://x-access-token:<PAT>@github.com/<you>/ceremony-vault.git — blank for a local-only vault)" "$(get_saved CEREMONY_VAULT_REMOTE)")"
OPENAI_KEY="$(prompt_secret OPENAI_API_KEY "OpenAI key for Whisper transcription (blank to skip)" "$(get_saved OPENAI_API_KEY)")"

if [[ -z "$TOKEN" ]]; then
  echo
  echo "!! no app token set — the agent listens on your network unauthenticated." >&2
  echo "   strongly recommended: re-run and set one (any long random string)." >&2
fi

xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

echo "-- writing $PLIST"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$AGENT_DIR/.venv/bin/uvicorn</string>
    <string>main:app</string>
    <string>--host</string><string>0.0.0.0</string>
    <string>--port</string><string>8014</string>
    <string>--app-dir</string><string>$AGENT_DIR</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CEREMONY_VAULT</key><string>$VAULT_DIR</string>
    <key>ANTHROPIC_API_KEY</key><string>$(xml_escape "$ANTHROPIC_KEY")</string>
    <key>CEREMONY_TOKEN</key><string>$(xml_escape "$TOKEN")</string>
    <key>CEREMONY_VAULT_REMOTE</key><string>$(xml_escape "$REMOTE")</string>
    <key>OPENAI_API_KEY</key><string>$(xml_escape "$OPENAI_KEY")</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
chmod 600 "$PLIST"

echo "-- starting the service"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo -n "-- waiting for the agent"
for _ in $(seq 1 30); do
  if curl -s -o /dev/null localhost:8014/api/state; then break; fi
  echo -n "."; sleep 1
done
echo
if curl -s -o /dev/null -w '%{http_code}' localhost:8014/api/state | grep -qE '200|401'; then
  echo "✓ the agent is listening on port 8014 (starts at every login, restarts on crash)"
else
  echo "!! the agent did not come up — check the log:  tail -50 $LOG" >&2
  exit 1
fi

cat <<'NEXT'

== next: give your iPhone a way to reach it ==

The native app needs an HTTPS address. The free way is Tailscale:

  1. Install Tailscale on this Mac (App Store or `brew install --cask tailscale`),
     sign in (free personal plan), and do the same in the Tailscale iOS app
     with the SAME account.
  2. In this terminal, give the agent a real HTTPS address on your tailnet:

       tailscale serve --bg 8014
       tailscale serve status     # shows the https://…ts.net URL

  3. In the Ceremony app on your phone (it prompts when it can't connect —
     or delete & reinstall to re-prompt):
       URL:   the https://…ts.net address from step 2
       Token: the app token you set here

Works from anywhere (not just home Wi-Fi) whenever the Mac is awake; when
it's asleep, dumps wait in the app's outbox and file on reconnect. To keep
the Mac available while plugged in: System Settings → Battery → Options →
"Prevent automatic sleeping on power adapter".

Update later: git pull && ./scripts/setup-mac.sh   (keeps your saved secrets)
NEXT
