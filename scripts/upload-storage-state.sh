#!/usr/bin/env bash
# 将本机 storageState.json 上传到 API 租户账号
# 用法: ./scripts/upload-storage-state.sh <API_BASE> <API_KEY> <ACCOUNT_ID> [storageState路径]
set -euo pipefail

API_BASE="${1:?例: http://localhost:3000}"
API_KEY="${2:?API Key}"
ACCOUNT_ID="${3:?转发账号 ID（POST /accounts 返回的 id）}"
STATE_FILE="${4:-data/storageState.json}"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "文件不存在: $STATE_FILE" >&2
  exit 1
fi

curl -s -X POST "${API_BASE}/api/v1/accounts/${ACCOUNT_ID}/storage-state" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d @"${STATE_FILE}"

echo ""
