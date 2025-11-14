#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY}"
IFS=',' read -ra BRANCH_ARRAY <<< "$BRANCHES"

echo "Ramas a procesar:"
printf '%s\n' "${BRANCH_ARRAY[@]}"


echo "✔️ Snapshot creada: $TAG"
echo "🎉 Proceso finalizado correctamente."
