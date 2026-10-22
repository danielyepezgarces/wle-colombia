#!/usr/bin/env bash
# ==============================================================================
# Wiki Loves Earth Colombia 2026 - Despliegue Automatizado en Wikimedia Toolforge
# Runtime: Python 3.13 (uWSGI sobre Kubernetes)
# ==============================================================================

set -o pipefail

# Colores ANSI para terminal
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BOLD}${GREEN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}🌿 Wiki Loves Earth Colombia 2026 - Despliegue Automatizado en Toolforge${NC}"
echo -e "${BOLD}${GREEN}   Runtime: Python 3.13 (WSGI / uWSGI)${NC}"
echo -e "${BOLD}${GREEN}==============================================================================${NC}"

# 1. Comprobación de usuario Toolforge
CURRENT_USER="$(id -un 2>/dev/null || whoami)"
if [[ "$CURRENT_USER" != "tools.wle-colombia" && "$CURRENT_USER" != "wle-colombia" ]]; then
    echo -e "${YELLOW}⚠ Advertencia: Estás ejecutando como '${CURRENT_USER}'.${NC}"
    echo -e "${YELLOW}  Para evitar problemas de permisos, se recomienda ejecutar previamente:${NC}"
    echo -e "  ${BOLD}become wle-colombia${NC}"
    echo ""
fi

# 2. Localizar comando Toolforge
if command -v toolforge >/dev/null 2>&1; then
    TF_CMD="toolforge"
elif command -v webservice >/dev/null 2>&1; then
    TF_CMD="webservice"
else
    echo -e "${RED}✘ Error: No se encontró la herramienta 'toolforge' ni 'webservice'.${NC}"
    echo "  Asegúrate de estar conectado a un bastion oficial de Wikimedia Toolforge."
    exit 1
fi

# 3. Determinar directorios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_BASE="$HOME/www/python"
SRC_DIR="$PYTHON_BASE/src"
VENV_DIR="$PYTHON_BASE/venv"

echo -e "${BLUE}▶ Directorio del repositorio:${NC} $REPO_DIR"
echo -e "${BLUE}▶ Directorio base Python:${NC}     $PYTHON_BASE"

# 4. Actualización automática de código Git (si aplica)
if [ -d "$REPO_DIR/.git" ]; then
    echo -e "\n${BLUE}▶ Sincronizando última versión desde Git (origin/main)...${NC}"
    cd "$REPO_DIR"
    git fetch origin main >/dev/null 2>&1 || true
    git pull origin main || echo -e "${YELLOW}⚠ git pull falló o ya está actualizado, continuando...${NC}"
fi

# 5. Detener webservice previo para liberación limpia de recursos
echo -e "\n${BLUE}▶ Verificando y deteniendo webservice anterior...${NC}"
if [ "$TF_CMD" = "toolforge" ]; then
    toolforge webservice stop >/dev/null 2>&1 || true
else
    webservice stop >/dev/null 2>&1 || true
fi

# 6. Preparar estructura de directorios
echo -e "\n${BLUE}▶ Configurando directorios y enlaces en $PYTHON_BASE...${NC}"
mkdir -p "$PYTHON_BASE"

# Copiar / actualizar uwsgi.ini
if [ -f "$REPO_DIR/uwsgi.ini" ]; then
    cp "$REPO_DIR/uwsgi.ini" "$PYTHON_BASE/uwsgi.ini"
    echo -e "${GREEN}✔ uwsgi.ini configurado en $PYTHON_BASE/uwsgi.ini${NC}"
fi

# Enlazar repositorio como www/python/src
if [ "$REPO_DIR" != "$SRC_DIR" ]; then
    rm -rf "$SRC_DIR"
    ln -sfn "$REPO_DIR" "$SRC_DIR"
    echo -e "${GREEN}✔ Enlace simbólico creado: $SRC_DIR -> $REPO_DIR${NC}"
fi

# 7. Inicialización automatizada del venv dentro del contenedor
echo -e "\n${BLUE}▶ Verificando entorno virtual Python 3.13...${NC}"
NEED_BOOTSTRAP=0

if [ ! -d "$VENV_DIR" ] || [ ! -x "$VENV_DIR/bin/python" ]; then
    NEED_BOOTSTRAP=1
fi

if [ $NEED_BOOTSTRAP -eq 1 ]; then
    echo -e "${YELLOW}⚙ Creando entorno virtual dentro del contenedor oficial Toolforge Python 3.13...${NC}"
    if [ "$TF_CMD" = "toolforge" ]; then
        toolforge webservice python3.13 shell -- webservice-python-bootstrap
    else
        webservice python3.13 shell -- webservice-python-bootstrap
    fi
    echo -e "${GREEN}✔ Entorno virtual inicializado con éxito.${NC}"
else
    echo -e "${GREEN}✔ Entorno virtual existente detectado en $VENV_DIR.${NC}"
fi

# 8. Arrancar webservice con Python 3.13
echo -e "\n${BLUE}▶ Iniciando webservice Python 3.13 en Toolforge...${NC}"
if [ "$TF_CMD" = "toolforge" ]; then
    toolforge webservice python3.13 start
else
    webservice python3.13 start
fi

# 9. Monitoreo y comprobación de salud (Health Check activo)
echo -e "\n${BLUE}▶ Esperando confirmación de inicio del pod en Kubernetes...${NC}"
MAX_WAIT=20
WAIT_COUNT=0
STATUS_OK=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))

    if [ "$TF_CMD" = "toolforge" ]; then
        STATUS_OUTPUT="$(toolforge webservice status 2>&1 || true)"
    else
        STATUS_OUTPUT="$(webservice status 2>&1 || true)"
    fi

    if echo "$STATUS_OUTPUT" | grep -qi "running"; then
        STATUS_OK=1
        break
    fi
    echo -n "."
done
echo ""

echo -e "\n${BLUE}▶ Estado actual del webservice:${NC}"
echo "$STATUS_OUTPUT"

# 10. Resultado final
echo ""
echo -e "${BOLD}${GREEN}==============================================================================${NC}"
if [ $STATUS_OK -eq 1 ]; then
    echo -e "${BOLD}${GREEN}✔ ¡DESPLIEGUE EXITOSO! El webservice Python 3.13 está en ejecución.${NC}"
    echo -e "${BOLD}🌐 URL Oficial: https://wle-colombia.toolforge.org/${NC}"
else
    echo -e "${BOLD}${YELLOW}⚠ El webservice ha sido iniciado, pero el pod aún está inicializándose.${NC}"
    echo -e "  Revisa el estado en unos segundos con: ${BOLD}toolforge webservice status${NC}"
fi
echo -e "${BOLD}${GREEN}==============================================================================${NC}"
echo -e "\n${BOLD}Comandos útiles para gestión:${NC}"
echo -e "  • Ver logs en vivo:        ${BOLD}toolforge webservice logs -f${NC}"
echo -e "  • Reiniciar webservice:    ${BOLD}toolforge webservice python3.13 restart${NC}"
echo -e "  • Detener webservice:      ${BOLD}toolforge webservice stop${NC}"
echo -e "  • Shell interactivo:       ${BOLD}toolforge webservice python3.13 shell${NC}"
echo -e "==============================================================================\n"
