# Archivo Histórico: Versión Python 3.13 (WSGI / uWSGI)

Este directorio contiene los archivos correspondientes a la versión Python 3.13 de **Wiki Loves Earth Colombia 2026**, creada originalmente como solución de contingencia y alta disponibilidad durante el periodo de mantenimiento de PHP en Wikimedia Toolforge.

Esta versión ha sido archivada formalmente en la rama Git `archive/python-version` y la etiqueta `v-python-archive`.

## Contenido del Archivo
- `app.py`: Aplicación WSGI / Servidor HTTP en Python 3.13 con pre-renderizado del mapa y endpoints JSON/CSV.
- `server.py`: Servidor CLI rápido en Python para desarrollo local.
- `uwsgi.ini`: Configuración de uWSGI para el runtime de Python en Kubernetes / Toolforge.
- `Procfile`: Configuración de proceso web para entornos PaaS / Toolforge.
- `requirements.txt`: Dependencias del entorno virtual Python.
- `scripts/setup_toolforge_python.sh`: Script de aprovisionamiento automatizado del entorno virtual y webservice Python en Toolforge.
- `scripts/deploy_toolforge.sh`: Despachador de despliegue para Python en Toolforge.

## Cómo restaurar o ejecutar la versión Python
1. **Mediante Git:**
   ```bash
   git checkout archive/python-version
   python3 app.py 8080
   ```

2. **Ejecutar directamente desde este archivo:**
   ```bash
   cd archive/python
   python3 app.py 8080
   ```
