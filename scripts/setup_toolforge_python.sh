#!/usr/bin/env bash
# ====================================================================
# Wiki Loves Earth Colombia 2026
# Script de Despliegue en Wikimedia Toolforge con Python 3.13
# ====================================================================

set -e

echo "🌿 Iniciando configuración de WLE Colombia en Toolforge (Python 3.13)..."

# 1. Determinar directorios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_BASE="$HOME/www/python"
SRC_DIR="$PYTHON_BASE/src"
VENV_DIR="$PYTHON_BASE/venv"

echo "📂 Directorio del repositorio: $REPO_DIR"
echo "📂 Directorio Python Toolforge: $PYTHON_BASE"

# 2. Detener servicio anterior si existe
echo "🛑 Deteniendo webservice actual (si existe)..."
toolforge webservice stop || true

# 3. Crear estructura de carpetas
mkdir -p "$PYTHON_BASE"

# 4. Copiar uwsgi.ini a www/python/uwsgi.ini
if [ -f "$REPO_DIR/uwsgi.ini" ]; then
    cp "$REPO_DIR/uwsgi.ini" "$PYTHON_BASE/uwsgi.ini"
    echo "✔ uwsgi.ini copiado a $PYTHON_BASE/uwsgi.ini"
fi

# 5. Enlazar repositorio como www/python/src
if [ "$REPO_DIR" != "$SRC_DIR" ]; then
    echo "🔗 Enlazando repositorio a $SRC_DIR..."
    rm -rf "$SRC_DIR"
    ln -sfn "$REPO_DIR" "$SRC_DIR"
    echo "✔ Enlace simbólico creado: $SRC_DIR -> $REPO_DIR"
fi

# 6. Preparar entorno virtual venv mediante el contenedor oficial de Toolforge
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Inicializando entorno virtual Python 3.13 dentro del contenedor de Toolforge..."
    if command -v toolforge >/dev/null 2>&1; then
        toolforge webservice python3.13 shell -- webservice-python-bootstrap || true
    elif command -v webservice >/dev/null 2>&1; then
        webservice python3.13 shell -- webservice-python-bootstrap || true
    fi
fi

# 7. Iniciar el webservice oficial con Python 3.13
echo "🚀 Iniciando webservice en Toolforge con Python 3.13..."
if command -v toolforge >/dev/null 2>&1; then
    toolforge webservice python3.13 start
else
    webservice python3.13 start
fi

echo ""
echo "📊 Verificando estado del webservice..."
sleep 2
toolforge webservice status || true

echo ""
echo "===================================================================="
echo "✔ Despliegue en Python 3.13 completado."
echo "🌐 URL Oficial Toolforge: https://wle-colombia.toolforge.org/"
echo ""
echo "Comandos útiles de Toolforge:"
echo "  - Ver logs en vivo:    toolforge webservice logs -f"
echo "  - Reiniciar servicio:  toolforge webservice python3.13 restart"
echo "  - Detener servicio:    toolforge webservice stop"
echo "===================================================================="
