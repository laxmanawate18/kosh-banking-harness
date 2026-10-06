#!/usr/bin/env bash
# Register an outside assistant app (MCP client) with Kosh. Prints the plan; pass --apply to change the live services.
#
#   scripts/register_agent.sh --id kosh-agent-claude --name "Claude" \
#       --redirect https://claude.ai/api/mcp/auth_callback [--scopes "banking.read banking.propose"] [--apply]
#
# What it changes (both are Cloud Run settings; each update rolls out a new revision with no downtime):
#   sentinel-auth     AUTH_AGENT_CLIENTS  += the app (name, callback address, scopes); SENTINEL_MCP_AUDIENCE
#                     On start-up the auth server creates the OAuth client (AUTH_AUTO_BOOTSTRAP=true).
#   sentinel-banking  OAUTH_AGENT_CLIENT_IDS += the app's id; OAUTH_MCP_AUDIENCE (the address agents connect to)
# The app is public and uses PKCE, so there is no client secret to store. Requires the release with the MCP gateway.
set -euo pipefail

REGION=us-central1
AUTH_SERVICE=sentinel-auth
APP_SERVICE=sentinel-banking
MCP_URL="${KOSH_PUBLIC_URL:?set KOSH_PUBLIC_URL, e.g. https://kosh.example.com}/mcp"
SCOPES="banking.read banking.propose"
APPLY=false
ID="" NAME="" REDIRECT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) ID="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --redirect) REDIRECT="$2"; shift 2 ;;
    --scopes) SCOPES="$2"; shift 2 ;;
    --mcp-url) MCP_URL="$2"; shift 2 ;;
    --apply) APPLY=true; shift ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
done
[[ "$ID" =~ ^[a-z0-9-]{3,60}$ ]] || { echo "--id must be 3-60 lowercase letters, digits or dashes" >&2; exit 2; }
[[ -n "$NAME" ]] || { echo "--name is required" >&2; exit 2; }
[[ "$REDIRECT" == https://* ]] || { echo "--redirect must be the app's https callback address" >&2; exit 2; }

env_value() {  # current value of one plain environment variable on a Cloud Run service
  gcloud run services describe "$1" --region="$REGION" --format=json | python3 -c "
import json, sys
env = json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env', [])
print(next((e.get('value', '') for e in env if e['name'] == sys.argv[1]), ''))" "$2"
}

CURRENT_CLIENTS=$(env_value "$AUTH_SERVICE" AUTH_AGENT_CLIENTS)
NEW_CLIENTS=$(python3 - "$CURRENT_CLIENTS" "$ID" "$NAME" "$REDIRECT" "$SCOPES" <<'EOF'
import json, sys
current, client_id, name, redirect, scopes = sys.argv[1:]
clients = [c for c in (json.loads(current) if current else []) if c["id"] != client_id]  # re-running replaces the entry
clients.append({"id": client_id, "name": name, "redirects": [redirect], "scopes": scopes.split()})
print(json.dumps(clients, separators=(",", ":")))
EOF
)
CURRENT_IDS=$(env_value "$APP_SERVICE" OAUTH_AGENT_CLIENT_IDS)
NEW_IDS=$(python3 -c "import sys; ids=[i for i in sys.argv[1].split(',') if i]; print(','.join(dict.fromkeys(ids + [sys.argv[2]])))" "$CURRENT_IDS" "$ID")

echo "Plan"
echo "  $AUTH_SERVICE  AUTH_AGENT_CLIENTS=$NEW_CLIENTS"
echo "  $AUTH_SERVICE  SENTINEL_MCP_AUDIENCE=$MCP_URL"
echo "  $APP_SERVICE   OAUTH_AGENT_CLIENT_IDS=$NEW_IDS"
echo "  $APP_SERVICE   OAUTH_MCP_AUDIENCE=$MCP_URL"
if [[ "$APPLY" != true ]]; then
  echo "Dry run. Re-run with --apply to update the live services."
  exit 0
fi

# '^|^' makes '|' the list separator, so the commas inside the JSON and the id list stay intact.
gcloud run services update "$AUTH_SERVICE" --region="$REGION" \
  --update-env-vars="^|^AUTH_AGENT_CLIENTS=$NEW_CLIENTS|SENTINEL_MCP_AUDIENCE=$MCP_URL"
gcloud run services update "$APP_SERVICE" --region="$REGION" \
  --update-env-vars="^|^OAUTH_AGENT_CLIENT_IDS=$NEW_IDS|OAUTH_MCP_AUDIENCE=$MCP_URL"

echo "Check"
curl -fsS "$MCP_URL" -o /dev/null -w "  gateway without a token: HTTP %{http_code} (401 expected)\n" -X POST \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{}' || true
curl -fsS "${MCP_URL%/mcp}/.well-known/oauth-protected-resource/mcp" | python3 -m json.tool
echo "In the app, add a custom connector with URL $MCP_URL and OAuth client id $ID (no secret)."
