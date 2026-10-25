#!/usr/bin/env bash
set -e

echo "Deploying mosaic-app to Google Cloud Run..."
gcloud run deploy mosaic-app \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --project gen-lang-client-0290197999
