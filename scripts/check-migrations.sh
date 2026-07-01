#!/usr/bin/env bash
# =============================================================================
# check-migrations.sh — Validador de convenciones de migraciones SQL
# Proyecto: Shelwi / Brivia App
# Gobernanza: supabase/migration_registry.md + MIGRATION_GOVERNANCE.md
# =============================================================================
# Uso:
#   ./scripts/check-migrations.sh                 → valida estado actual
#   ./scripts/check-migrations.sh --strict         → falla en warnings también
#   Pre-commit hook: añadir como .git/hooks/pre-commit
#
# Salida:
#   exit 0 → todo OK
#   exit 1 → hay errores bloqueantes
# =============================================================================

set -euo pipefail

MIGRATIONS_DIR="${1:-supabase/migrations}"
STRICT="${STRICT:-0}"
[[ "${2:-}" == "--strict" ]] && STRICT=1

# Colores
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

ERRORS=0
WARNINGS=0

error()   { echo -e "${RED}[ERROR]${NC} $1"; ERRORS=$((ERRORS+1)); }
warning() { echo -e "${YELLOW}[WARN] ${NC} $1"; WARNINGS=$((WARNINGS+1)); }
ok()      { echo -e "${GREEN}[OK]   ${NC} $1"; }
info()    { echo -e "${CYAN}[INFO] ${NC} $1"; }

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Shelwi Migration Guard — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Directory: $MIGRATIONS_DIR"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Verificar que el directorio existe
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  error "El directorio de migraciones no existe: $MIGRATIONS_DIR"
  exit 1
fi

# Obtener todos los archivos .sql ordenados
mapfile -t FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" | sort)
TOTAL=${#FILES[@]}
info "Archivos SQL encontrados: $TOTAL"
echo ""

# =============================================================================
# CHECK 1: Todos los archivos tienen prefijo numérico de 4 dígitos
# =============================================================================
echo "── CHECK 1: Formato de nombre ──────────────────────────────────"
INVALID_FORMAT=()
for f in "${FILES[@]}"; do
  basename=$(basename "$f")
  if ! [[ "$basename" =~ ^[0-9]{4}_.+\.sql$ ]]; then
    error "Nombre inválido (debe ser NNNN_descripcion.sql): $basename"
    INVALID_FORMAT+=("$basename")
  fi
done
[[ ${#INVALID_FORMAT[@]} -eq 0 ]] && ok "Todos los archivos tienen el formato correcto."
echo ""

# Si hay archivos inválidos, no tiene sentido continuar con el resto
if [[ ${#INVALID_FORMAT[@]} -gt 0 ]]; then
  echo ""
  error "Corrige el formato antes de continuar."
  exit 1
fi

# =============================================================================
# CHECK 2: Prefijos duplicados
# En contexto git (pre-commit): solo verifica archivos NUEVOS contra HEAD.
# Sin contexto git (CI/standalone): verifica todos, pero los pares históricos
#   ya presentes en HEAD se reportan como WARNING (no ERROR), porque son
#   inmutables de producción y están documentados en MIGRATION_GOVERNANCE.md.
# =============================================================================
echo "── CHECK 2: Prefijos duplicados ────────────────────────────────"
declare -A PREFIX_MAP
DUPLICATES_FOUND=0

# Construir mapa de prefijos existentes (todos los archivos actuales)
for f in "${FILES[@]}"; do
  basename=$(basename "$f")
  prefix="${basename:0:4}"
  if [[ -n "${PREFIX_MAP[$prefix]+set}" ]]; then
    # Ambos archivos ya existen en el directorio
    # Determinar si alguno de los dos es NUEVO (staged, no en HEAD)
    is_new_a=0; is_new_b=0
    if git rev-parse --git-dir > /dev/null 2>&1; then
      git show "HEAD:$MIGRATIONS_DIR/${PREFIX_MAP[$prefix]}" > /dev/null 2>&1 || is_new_a=1
      git show "HEAD:$MIGRATIONS_DIR/$basename"              > /dev/null 2>&1 || is_new_b=1
    fi

    if [[ $is_new_a -eq 1 || $is_new_b -eq 1 ]]; then
      # Al menos uno es nuevo → ERROR bloqueante
      error "Prefijo duplicado ${prefix}: '${PREFIX_MAP[$prefix]}' y '${basename}' — uno es NUEVO. Usa el siguiente número libre."
      DUPLICATES_FOUND=1
    else
      # Ambos son históricos → WARNING informativo (no bloquea)
      warning "Prefijo duplicado histórico ${prefix}: '${PREFIX_MAP[$prefix]}' y '${basename}' (inmutable, documentado en MIGRATION_GOVERNANCE.md)"
    fi
  else
    PREFIX_MAP[$prefix]="$basename"
  fi
done
[[ $DUPLICATES_FOUND -eq 0 ]] && ok "Sin nuevos prefijos duplicados."
echo ""

# =============================================================================
# CHECK 3: Numeración no regresiva
# Ningún número puede ser menor que el máximo ya existente en main/HEAD
# =============================================================================
echo "── CHECK 3: Numeración no regresiva ────────────────────────────"
PREFIXES=()
for f in "${FILES[@]}"; do
  basename=$(basename "$f")
  PREFIXES+=("${basename:0:4}")
done

MAX_PREFIX=$(printf '%s\n' "${PREFIXES[@]}" | sort -n | tail -1)
info "Prefijo máximo actual: $MAX_PREFIX"

# Si el script se ejecuta como pre-commit hook, verifica solo archivos nuevos
if git rev-parse --git-dir > /dev/null 2>&1; then
  NEW_FILES=$(git diff --cached --name-only --diff-filter=A -- "$MIGRATIONS_DIR/*.sql" 2>/dev/null || true)
  if [[ -n "$NEW_FILES" ]]; then
    while IFS= read -r new_file; do
      new_basename=$(basename "$new_file")
      new_prefix="${new_basename:0:4}"
      if [[ "$new_prefix" -le "${MAX_PREFIX}" ]] 2>/dev/null; then
        # Solo es error si el archivo es realmente nuevo (no existía en HEAD)
        if ! git show "HEAD:$new_file" > /dev/null 2>&1; then
          error "Migración regresiva: $new_basename (prefijo $new_prefix ≤ máximo actual $MAX_PREFIX)"
        fi
      fi
    done <<< "$NEW_FILES"
  else
    ok "No hay nuevas migraciones staged."
  fi
else
  warning "No estás en un repositorio git — omitiendo check de regresión."
fi
echo ""

# =============================================================================
# CHECK 4: Nombres descriptivos
# El nombre debe tener al menos 2 palabras (separadas por _)
# y no puede ser un nombre genérico de una sola palabra
# =============================================================================
echo "── CHECK 4: Nombres descriptivos ───────────────────────────────"

# Palabras prohibidas como nombre único (son válidas en combinación)
BANNED_ALONE=("fix" "temp" "test" "update" "add" "new" "change" "misc" "other" "wip" "todo" "hotfix" "patch")

MIN_NAME_LENGTH=8  # "abc_def" mínimo

NONDESCRIPT_FOUND=0
for f in "${FILES[@]}"; do
  basename=$(basename "$f")
  # Extraer la parte descriptiva: todo después de "NNNN_" y antes de ".sql"
  name_part="${basename:5}"            # quitar "NNNN_"
  name_part="${name_part%.sql}"        # quitar ".sql"

  # Debe tener al menos un guión bajo (mínimo 2 palabras)
  if [[ "$name_part" != *_* ]]; then
    # Verificar si es una palabra sola prohibida
    lower_name=$(echo "$name_part" | tr '[:upper:]' '[:lower:]')
    is_banned=0
    for banned in "${BANNED_ALONE[@]}"; do
      [[ "$lower_name" == "$banned" ]] && is_banned=1 && break
    done
    if [[ $is_banned -eq 1 ]]; then
      error "Nombre genérico prohibido: $basename (usa un nombre compuesto como 'hotfix_invite_token')"
    else
      warning "Nombre de una sola palabra: $basename (considera usar más palabras descriptivas)"
    fi
    NONDESCRIPT_FOUND=1
  fi

  # Longitud mínima del nombre
  if [[ ${#name_part} -lt $MIN_NAME_LENGTH ]]; then
    warning "Nombre muy corto ($name_part): $basename — debe describir claramente el objetivo"
    NONDESCRIPT_FOUND=1
  fi
done
[[ $NONDESCRIPT_FOUND -eq 0 ]] && ok "Todos los nombres son descriptivos."
echo ""

# =============================================================================
# CHECK 5: Huecos documentados (0028, 0121) — no reutilizar
# =============================================================================
echo "── CHECK 5: Huecos reservados (no reutilizar) ──────────────────"
RESERVED_GAPS=("0028" "0121")
GAP_VIOLATED=0
for gap in "${RESERVED_GAPS[@]}"; do
  if [[ -n "${PREFIX_MAP[$gap]+set}" ]]; then
    error "El número $gap está reservado como hueco histórico y no debe reutilizarse."
    GAP_VIOLATED=1
  fi
done
[[ $GAP_VIOLATED -eq 0 ]] && ok "Huecos históricos respetados (0028, 0121 libres)."
echo ""

# =============================================================================
# CHECK 6: Archivos de QA / seeds dentro de migrations (advertencia)
# =============================================================================
echo "── CHECK 6: Datos de prueba en migrations ──────────────────────"
QA_PATTERNS=("seed_test" "seed_users" "qa_" "cleanup_test" "test_data" "seed_clients_free")
QA_FOUND=0
for f in "${FILES[@]}"; do
  basename=$(basename "$f")
  lower=$(echo "$basename" | tr '[:upper:]' '[:lower:]')
  for pattern in "${QA_PATTERNS[@]}"; do
    if [[ "$lower" == *"$pattern"* ]]; then
      warning "Posibles datos de QA en migrations: $basename (considera moverlo a supabase/qa/)"
      QA_FOUND=1
      break
    fi
  done
done
[[ $QA_FOUND -eq 0 ]] && ok "Sin datos de prueba detectados en migrations."
echo ""

# =============================================================================
# RESUMEN
# =============================================================================
echo "════════════════════════════════════════════════════════════════"
echo "  RESUMEN DE VALIDACIÓN"
echo "════════════════════════════════════════════════════════════════"
echo -e "  Errores bloqueantes : ${RED}$ERRORS${NC}"
echo -e "  Advertencias        : ${YELLOW}$WARNINGS${NC}"
echo ""

if [[ $ERRORS -gt 0 ]]; then
  echo -e "  ${RED}✖ BLOQUEADO — corrige los errores antes de continuar.${NC}"
  exit 1
elif [[ $STRICT -eq 1 && $WARNINGS -gt 0 ]]; then
  echo -e "  ${YELLOW}✖ BLOQUEADO (modo --strict) — corrige las advertencias.${NC}"
  exit 1
else
  echo -e "  ${GREEN}✔ OK — todas las migraciones cumplen las convenciones.${NC}"
  exit 0
fi
