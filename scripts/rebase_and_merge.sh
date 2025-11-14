#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY}"
IFS=',' read -ra BRANCH_ARRAY <<< "$BRANCHES"

echo "Ramas a procesar:"
printf '%s\n' "${BRANCH_ARRAY[@]}"

########################################
# 1. VALIDAR CHECKS
########################################
echo "Validando checks obligatorios…"

for BR in "${BRANCH_ARRAY[@]}"; do
  echo "Validando $BR…"

  PR_DATA=$(gh pr list --head "$BR" --json number,url,state)
  if [[ $(echo "$PR_DATA" | jq length) -eq 0 ]]; then
    echo "❌ La rama $BR no tiene un PR abierto."
    exit 1
  fi

  PR_NUMBER=$(echo "$PR_DATA" | jq -r '.[0].number')

  # Status checks
  CHECKS=$(gh pr checks "$PR_NUMBER" --json conclusion)
  if echo "$CHECKS" | jq -e '.[] | select(.conclusion != "success")' >/dev/null; then
    echo "❌ La rama $BR tiene checks fallidos."
    exit 1
  fi

  # Approvals
  APPROVED=$(gh pr view "$PR_NUMBER" --json reviews | jq -e '.reviews | map(select(.state == "APPROVED")) | length > 0')
  if [[ $? -ne 0 ]]; then
    echo "❌ La rama $BR no tiene approvals."
    exit 1
  fi

  echo "✔️ $BR OK"
done

# ########################################
# # 2. DRY RUN
# ########################################
# echo "Realizando dry-run de merges/rebases…"

# git checkout develop

# for BR in "${BRANCH_ARRAY[@]}"; do
#   echo "Dry-run merge $BR → develop"
#   if ! git merge --no-commit --no-ff "$BR"; then
#     echo "❌ Conflicto en merge $BR"
#     git merge --abort
#     exit 1
#   fi
#   git merge --abort

#   echo "Dry-run rebase siguiente ramas…"
# done

# echo "✔️ Dry-run OK"

# ########################################
# # 3. MERGE REAL + REBASES
# ########################################
# echo "Ejecutando merges reales…"

# git checkout develop

# for ((i=0; i<${#BRANCH_ARRAY[@]}; i++)); do
#   BR="${BRANCH_ARRAY[$i]}"

#   echo "🔀 Merge real: $BR → develop"
#   git merge --no-ff "$BR"
#   git push origin develop

#   # Rebasar las ramas restantes
#   for ((j=i+1; j<${#BRANCH_ARRAY[@]}; j++)); do
#     TARGET="${BRANCH_ARRAY[$j]}"
#     echo "↕️ Rebase $TARGET sobre develop"

#     git checkout "$TARGET"
#     git rebase develop
#     git push origin "$TARGET" --force-with-lease
#   done

#   git checkout develop
# done

########################################
# 4. SNAPSHOT
########################################

TAG="snapshot-$(date +%Y%m%d-%H%M)"
# git tag "$TAG"
# git push origin "$TAG"

echo "✔️ Snapshot creada: $TAG"
echo "🎉 Proceso finalizado correctamente."
