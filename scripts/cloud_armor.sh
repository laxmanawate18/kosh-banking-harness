#!/usr/bin/env bash
# Cloud Armor rate limits on the Kosh load balancer (the public domain). Run once the project's
# SECURITY_POLICIES quota is above 0 (Console: IAM & Admin > Quotas, metric "Security policies").
# Safe to re-run: it skips what already exists. Over-limit callers get HTTP 429 at Google's edge.
set -euo pipefail
POLICY=kosh-edge-policy
BACKEND=kosh-backend

gcloud compute security-policies describe "$POLICY" >/dev/null 2>&1 || \
  gcloud compute security-policies create "$POLICY" --description="Kosh edge rate limits per client IP"

gcloud compute security-policies rules describe 1000 --security-policy="$POLICY" >/dev/null 2>&1 || \
  gcloud compute security-policies rules create 1000 --security-policy="$POLICY" \
    --description="API and agent gateway: 120 requests per minute per IP" \
    --expression="request.path.startsWith('/api/') || request.path.startsWith('/mcp')" \
    --action=throttle --rate-limit-threshold-count=120 --rate-limit-threshold-interval-sec=60 \
    --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP

gcloud compute security-policies rules describe 2000 --security-policy="$POLICY" >/dev/null 2>&1 || \
  gcloud compute security-policies rules create 2000 --security-policy="$POLICY" \
    --description="Pages and assets: 600 requests per minute per IP" --src-ip-ranges="*" \
    --action=throttle --rate-limit-threshold-count=600 --rate-limit-threshold-interval-sec=60 \
    --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP

gcloud compute backend-services update "$BACKEND" --global --security-policy="$POLICY"
gcloud compute security-policies describe "$POLICY" --format="table(rules.priority,rules.action,rules.description)"
