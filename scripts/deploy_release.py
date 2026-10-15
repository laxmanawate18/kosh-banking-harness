#!/usr/bin/env python3
"""Release Kosh to Cloud Run: back up Cloud SQL, move secrets to Secret Manager, set the backup model, build, deploy.

    venv/bin/python scripts/deploy_release.py                          # dry run: checks and prints the plan, changes nothing
    venv/bin/python scripts/deploy_release.py --apply                  # does it
    venv/bin/python scripts/deploy_release.py --apply --skip-tests     # when the tests already ran on this commit

Steps (each one is safe to re-run):
  1. Pre-flight: gcloud project, a clean commit (the image tag is kosh-<commit>), the test suites.
  2. Cloud SQL backup of sentinel-db, waited for.
  3. Secret Manager: the three keys production now requires are created once (random, never printed); passwords and
     keys that sit in plain environment variables today are copied into secrets; the runtime service account may read them.
  4. The backup model (MITRA_FALLBACK_MODEL) is checked to answer on Vertex before it is configured.
  5. Both images are built with Cloud Build and deployed; secrets are referenced, never written as plain variables;
     the unused DEMO_OTP is removed.
  6. Smoke checks, then the remaining manual steps (copy the evaluation, approve the prompt version, register agents).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _tls_context() -> ssl.SSLContext:
    # The python.org macOS installer ships without CA certificates; certifi's bundle works on any Python.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


TLS = _tls_context()
# The defaults are this deployment; set KOSH_GCP_PROJECT, KOSH_GCP_REGION or KOSH_SQL_INSTANCE to release somewhere else.
PROJECT = os.environ.get("KOSH_GCP_PROJECT", "project-5fc303c2-29cb-4e5d-9f9")
REGION = os.environ.get("KOSH_GCP_REGION", "us-central1")
SQL_INSTANCE = os.environ.get("KOSH_SQL_INSTANCE", "kosh-db")
REGISTRY = f"{REGION}-docker.pkg.dev/{PROJECT}/kosh"
BUILD_ACCOUNT = f"projects/{PROJECT}/serviceAccounts/kosh-build@{PROJECT}.iam.gserviceaccount.com"
APP, AUTH = "kosh-app", "kosh-auth"
PUBLIC_URL = os.environ.get("KOSH_PUBLIC_URL", "").rstrip("/")  # e.g. https://kosh.example.com; required for --apply

# Secret Manager name -> the environment variable(s) it backs, per service. A value shared by both services is one secret.
MIGRATED = {
    "kosh-banking-database-url": {APP: "SENTINEL_DATABASE_URL"},
    "kosh-auth-database-url": {AUTH: "AUTH_DATABASE_URL"},
    "kosh-better-auth-secret": {AUTH: "BETTER_AUTH_SECRET"},
    "kosh-staff-password": {AUTH: "AUTH_STAFF_PASSWORD"},
    "kosh-oauth-web-client-secret": {APP: "OAUTH_WEB_CLIENT_SECRET", AUTH: "SENTINEL_WEB_CLIENT_SECRET"},
    "kosh-oauth-chat-client-secret": {APP: "OAUTH_CHAT_CLIENT_SECRET", AUTH: "SENTINEL_CHAT_CLIENT_SECRET"},
    "kosh-oauth-token-encryption-key": {APP: "OAUTH_TOKEN_ENCRYPTION_KEY"},
    "kosh-auth-internal-token": {APP: "AUTH_INTERNAL_TOKEN", AUTH: "AUTH_INTERNAL_TOKEN"},
}
NEW_KEYS = {  # required in production since this release; generated once: secret -> (service, variable, generator)
    "kosh-sentinel-token-secret": (APP, "SENTINEL_DEMO_SECRET", lambda: secrets.token_urlsafe(48)),
    "kosh-audit-hmac-key": (APP, "SENTINEL_AUDIT_HMAC_KEY", lambda: secrets.token_urlsafe(48)),
    "kosh-document-key": (APP, "SENTINEL_DOCUMENT_KEY", lambda: base64.urlsafe_b64encode(os.urandom(32)).decode()),  # a Fernet key
    # The Admin Panel login (admin.kosh). Dummy demo password is Admin@2468.
    "kosh-admin-password": (AUTH, "AUTH_ADMIN_PASSWORD", lambda: "Admin@2468"),
}
# Kosh sends no e-mail: every SMTP setting goes (revoke the Gmail app password separately).
# AUTH_DEMO_OTP is deliberately not here: the deployed demo keeps demo sign-in so reviewers can log in as a customer.
REMOVED = {APP: {"DEMO_OTP", "SMTP_HOST", "SMTP_PORT", "SMTP_USE_TLS", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL",
                 "SMTP_FROM_NAME"}, AUTH: set()}


def run(*args: str, capture: bool = True, stdin: str | None = None) -> str:
    cmd = list(args)
    if cmd:
        resolved = shutil.which(cmd[0])
        if resolved:
            cmd[0] = resolved
    result = subprocess.run(cmd, input=stdin, text=True, capture_output=capture, check=False)
    if result.returncode != 0:
        raise SystemExit(f"Failed: {' '.join(args[:4])} ...\n{(result.stderr or '').strip()[-800:]}")
    return (result.stdout or "").strip()


def service_env(service: str) -> list[dict]:
    spec = json.loads(run("gcloud", "run", "services", "describe", service, f"--region={REGION}", f"--project={PROJECT}", "--format=json"))
    return spec["spec"]["template"]["spec"]["containers"][0].get("env", [])


def service_account(service: str) -> str:
    spec = json.loads(run("gcloud", "run", "services", "describe", service, f"--region={REGION}", f"--project={PROJECT}", "--format=json"))
    account = spec["spec"]["template"]["spec"].get("serviceAccountName")
    if account:
        return account
    number = run("gcloud", "projects", "describe", PROJECT, "--format=value(projectNumber)")
    return f"{number}-compute@developer.gserviceaccount.com"


def split_env(env: list[dict], service: str) -> tuple[dict[str, str], dict[str, str]]:
    """(plain variables to keep, secret references {VAR: secret}) for one service after this release."""
    secret_vars = {var: name for name, by_service in MIGRATED.items() for svc, var in by_service.items() if svc == service}
    secret_vars.update({var: name for name, (svc, var, _) in NEW_KEYS.items() if svc == service})
    plain = {e["name"]: e.get("value", "") for e in env
             if "valueFrom" not in e and e["name"] not in secret_vars and e["name"] not in REMOVED[service]}
    existing_refs = {e["name"]: e["valueFrom"]["secretKeyRef"]["name"] for e in env if "valueFrom" in e}
    return plain, {**existing_refs, **secret_vars}


def secret_exists(name: str) -> bool:
    bin_name = shutil.which("gcloud") or "gcloud"
    return subprocess.run([bin_name, "secrets", "describe", name, f"--project={PROJECT}"], capture_output=True).returncode == 0


def ensure_secret(name: str, value: str, account: str) -> str:
    if secret_exists(name):
        status = "kept"
    else:
        run("gcloud", "secrets", "create", name, f"--project={PROJECT}", "--replication-policy=automatic", "--data-file=-", stdin=value)
        status = "created"
    run("gcloud", "secrets", "add-iam-policy-binding", name, f"--project={PROJECT}", f"--member=serviceAccount:{account}",
        "--role=roles/secretmanager.secretAccessor")
    return status


def model_answers(model: str) -> bool:
    token = run("gcloud", "auth", "print-access-token")
    url = (f"https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/"
           f"{model}:generateContent")
    body = json.dumps({"contents": [{"role": "user", "parts": [{"text": "Reply with OK."}]}]}).encode()
    request = urllib.request.Request(url, data=body, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60, context=TLS) as response:
            return response.status == 200
    except urllib.error.HTTPError as exc:
        print(f"    Vertex said {exc.code}: {exc.read()[:200]!r}")
        return False


def deploy(service: str, image: str, plain: dict[str, str], refs: dict[str, str]) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as handle:  # plain values only; no secrets
        json.dump(plain, handle)  # JSON is valid YAML and keeps commas, '@' and quotes intact
        env_file = handle.name
    try:
        run("gcloud", "run", "deploy", service, f"--region={REGION}", f"--project={PROJECT}", f"--image={image}", f"--env-vars-file={env_file}",
            "--set-secrets=" + ",".join(f"{var}={name}:latest" for var, name in sorted(refs.items())), capture=False)
    finally:
        os.unlink(env_file)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--skip-tests", action="store_true")
    ap.add_argument("--fallback-model", default="gemini-3.7-flash")
    args = ap.parse_args()
    step = lambda n, text: print(f"\n[{n}] {text}")

    if not PUBLIC_URL.startswith("https://"):
        raise SystemExit("Set KOSH_PUBLIC_URL to the public https address, e.g. KOSH_PUBLIC_URL=https://kosh.example.com")
    step(1, "Pre-flight")
    project = run("gcloud", "config", "get-value", "project")
    if project != PROJECT:
        raise SystemExit(f"gcloud project is {project}; run: gcloud config set project {PROJECT}")
    dirty = [l for l in run("git", "-C", str(ROOT), "status", "--porcelain").splitlines() if not l.endswith(".gitignore")]
    if dirty:
        raise SystemExit("Commit or stash these changes first; the image tag must be an exact commit:\n" + "\n".join(dirty))
    commit = run("git", "-C", str(ROOT), "rev-parse", "--short", "HEAD")
    tag = f"kosh-{commit}"
    sys.path.insert(0, str(ROOT))
    os.environ["ENABLE_CLOUD_SQL_SYNC"] = "false"
    from backend.mitra_ops import prompt_version
    version = prompt_version()
    print(f"    commit {commit}, image tag {tag}, prompt version {version}")
    if not args.skip_tests:
        run(sys.executable, "-m", "pytest", "-q", "--ignore=tests/e2e", "--ignore=tests/eval", "-p", "no:cacheprovider", capture=False)
        run("npm", "--prefix", str(ROOT / "auth-server"), "test", capture=False)
        run("npx", "--prefix", str(ROOT / "frontend"), "tsc", "-p", str(ROOT / "frontend"), "--noEmit", capture=False)

    step(2, f"Cloud SQL backup of {SQL_INSTANCE}")
    if args.apply:
        run("gcloud", "sql", "backups", "create", f"--instance={SQL_INSTANCE}", f"--project={PROJECT}",
            f"--description=Before release {tag}", capture=False)
    else:
        print("    would create an on-demand backup and wait for it")

    step(3, "Secret Manager")
    envs = {svc: service_env(svc) for svc in (APP, AUTH)}
    accounts = {svc: service_account(svc) for svc in (APP, AUTH)}
    if args.apply:
        run("gcloud", "services", "enable", "secretmanager.googleapis.com", f"--project={PROJECT}")
    for name, by_service in MIGRATED.items():
        values = {next((e.get("value") for e in envs[svc] if e["name"] == var and "valueFrom" not in e), None) for svc, var in by_service.items()}
        values.discard(None)
        if len(values) > 1:
            raise SystemExit(f"{name}: the services hold different values; reconcile them before moving to a secret")
        exists = secret_exists(name)
        if not values and not exists:
            raise SystemExit(f"{name}: no current value on the services and no secret yet")
        value = next(iter(values), "")
        for svc in by_service:
            if args.apply:
                status = ensure_secret(name, value, accounts[svc])  # created once, then only access is granted
            else:
                status = "kept" if exists else "would copy from the service"
            print(f"    {name:34} {status} -> {svc}")
    for name, (svc, var, make) in NEW_KEYS.items():
        status = ensure_secret(name, make(), accounts[svc]) if args.apply else ("kept" if secret_exists(name) else "would generate")
        print(f"    {name:34} {status} -> {svc} {var}")

    step(4, f"Backup model {args.fallback_model}")
    if not model_answers(args.fallback_model):
        raise SystemExit(f"{args.fallback_model} did not answer on Vertex; choose another with --fallback-model")
    print("    answers on Vertex")

    step(5, f"Build and deploy {tag}")
    images = {APP: f"{REGISTRY}/{APP}:{tag}", AUTH: f"{REGISTRY}/{AUTH}:{tag}"}
    plans = {svc: split_env(envs[svc], svc) for svc in (APP, AUTH)}
    plans[APP][0]["MITRA_FALLBACK_MODEL"] = args.fallback_model
    # The public domain is Kosh's address in the sign-in flow, e-mails and links; the run.app address is flagged by Safe Browsing.
    plans[APP][0]["SENTINEL_PUBLIC_URL"] = PUBLIC_URL
    plans[AUTH][0]["SENTINEL_WEB_URL"] = PUBLIC_URL
    for svc, (plain, refs) in plans.items():
        print(f"    {svc}: {len(plain)} plain variables, secrets {sorted(refs)}; removed {sorted(REMOVED[svc]) or 'none'}")
    if args.apply:
        for svc, source in ((APP, ROOT), (AUTH, ROOT / "auth-server")):
            run("gcloud", "builds", "submit", str(source), f"--project={PROJECT}", f"--region={REGION}",
                f"--config={ROOT / 'scripts' / 'cloudbuild.yaml'}", f"--substitutions=_IMAGE={images[svc]}",
                f"--service-account={BUILD_ACCOUNT}", "--default-buckets-behavior=regional-user-owned-bucket", capture=False)
        deploy(AUTH, images[AUTH], *plans[AUTH])
        deploy(APP, images[APP], *plans[APP])
        (ROOT / ".local" / "deploy-tag").write_text(tag + "\n")
    else:
        print(f"    would build {images[APP]} and {images[AUTH]} and deploy both")

    step(6, "Checks and next steps")
    if args.apply:
        import time
        # Pages sit behind Google sign-in (IAP), so only the public machine endpoint is checked here.
        for path in ("/.well-known/oauth-protected-resource/mcp",):
            for attempt in range(6):  # right after the switch a request can still reach an old instance
                try:
                    with urllib.request.urlopen(PUBLIC_URL + path, timeout=30, context=TLS) as response:
                        print(f"    {path}: HTTP {response.status}")
                        break
                except urllib.error.HTTPError as exc:
                    if attempt == 5:
                        print(f"    {path}: HTTP {exc.code} after retries; check the service logs")
                    time.sleep(10)
    print(f"""    Mitra and the copilot answer "paused" until prompt version {version} is approved in production:
      venv/bin/python scripts/promote_evaluation.py --version {version} --apply
      then sign in as the admin (password: gcloud secrets versions access latest --secret=kosh-admin-password)
      and approve it in the Admin Panel -> Approvals; then approve the processes in Admin Panel -> Banking processes
    Optional: scripts/register_agent.sh (outside agents), scripts/cloud_armor.sh (once the quota is raised)""")
    if not args.apply:
        print("\nDry run. Nothing was changed. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
