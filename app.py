#!/usr/bin/env python3
"""
Wiki Loves Earth Colombia 2026 - Mapa Interactivo y Explorador de Biodiversidad
Servidor y Aplicación WSGI en Python 3.13 para Wikimedia Toolforge

Diseñado para contingencia y operación de alta disponibilidad durante la mitigación
de vulnerabilidades en el entorno PHP de Wikimedia Toolforge.

Autor: Daniel Yepez Garces (User:Danielyepezgarces)
Proyecto: Wiki Loves Earth Colombia 2026 / Wikimedia Colombia
"""

import csv
import datetime
import io
import json
import mimetypes
import os
import re
import sys
import urllib.parse
from pathlib import Path

# Configuración de codificación segura para consola en cualquier sistema operativo
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Directorios base
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
INDEX_TEMPLATE_PATH = BASE_DIR / 'index.html'

# Tipos MIME adicionales para la web moderna y geoespacial
MIME_TYPES = {
    '.geojson': 'application/geo+json; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv; charset=utf-8',
}


class DataManager:
    """Administra la carga, filtrado y caché en memoria de datos geográficos y estadísticos."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self._cache = {}
        self._mtimes = {}

    def _read_file_cached(self, filename: str) -> tuple[bytes, str]:
        path = self.data_dir / filename
        if not path.is_file():
            return b'{}', ''

        mtime = path.stat().st_mtime
        if filename not in self._cache or self._mtimes.get(filename) != mtime:
            with open(path, 'rb') as f:
                content = f.read()
            self._cache[filename] = content
            self._mtimes[filename] = mtime

        text = self._cache[filename].decode('utf-8', errors='replace')
        return self._cache[filename], text

    def get_stats_raw(self) -> bytes:
        raw, _ = self._read_file_cached('wle_colombia_stats.json')
        return raw

    def get_stats_dict(self) -> dict:
        _, text = self._read_file_cached('wle_colombia_stats.json')
        try:
            return json.loads(text)
        except Exception:
            return {
                'total_fotos': 2387,
                'fotos_con_gps': 906,
                'total_autores': 74,
                'conteo_regiones': {},
                'conteo_departamentos': {},
                'top_autores': []
            }

    def get_puntos_raw(self) -> bytes:
        raw, _ = self._read_file_cached('wle_colombia_puntos.geojson')
        return raw

    def get_fotos_raw(self) -> bytes:
        raw, _ = self._read_file_cached('wle_colombia_fotos.json')
        return raw

    def get_regiones_raw(self) -> bytes:
        raw, _ = self._read_file_cached('colombia_regiones.geojson')
        return raw

    def get_departamentos_raw(self) -> bytes:
        raw, _ = self._read_file_cached('colombia_departamentos.geojson')
        return raw

    def get_filtered_puntos(self, region: str = '', departamento: str = '', autor: str = '') -> bytes:
        region = region.strip().lower()
        departamento = departamento.strip().lower()
        autor = autor.strip().lower()

        # Si no hay filtros, devolver archivo crudo ultra rápido
        if not region and not departamento and not autor:
            return self.get_puntos_raw()

        _, text = self._read_file_cached('wle_colombia_puntos.geojson')
        try:
            geojson = json.loads(text)
        except Exception:
            return b'{"error": "Error al decodificar GeoJSON"}'

        features = geojson.get('features', [])
        filtered = []
        for feat in features:
            props = feat.get('properties', {})
            if region and props.get('region', '').strip().lower() != region:
                continue
            if departamento and props.get('departamento', '').strip().lower() != departamento:
                continue
            if autor and props.get('autor', '').strip().lower() != autor:
                continue
            filtered.append(feat)

        result = {
            'type': 'FeatureCollection',
            'features': filtered
        }
        return json.dumps(result, ensure_ascii=False).encode('utf-8')

    def generate_csv(self) -> bytes:
        _, text = self._read_file_cached('wle_colombia_fotos.json')
        try:
            photos = json.loads(text)
        except Exception:
            photos = []

        output = io.StringIO()
        output.write('\ufeff')  # BOM UTF-8 para compatibilidad absoluta con Microsoft Excel
        writer = csv.writer(output)
        writer.writerow([
            'Usuario / Autor',
            'Nombre de Archivo',
            'Fecha Subida (Hora Colombia COT)',
            'Descripción (Español)',
            'Ubicación GPS',
            'Ver en Mapa',
            'Enlace Directo Imagen',
            'Página Wikimedia Commons',
            'Vista Previa',
            'Departamento',
            'Región Natural'
        ])
        for p in photos:
            writer.writerow([
                p.get('autor', ''),
                p.get('nombre', ''),
                p.get('fecha', ''),
                p.get('desc', ''),
                p.get('gps_raw', ''),
                p.get('map_url', ''),
                p.get('img_url', ''),
                p.get('commons_url', ''),
                p.get('thumb_url', ''),
                p.get('departamento', ''),
                p.get('region', '')
            ])

        return output.getvalue().encode('utf-8')


data_mgr = DataManager(DATA_DIR)


def render_html(host: str = '') -> bytes:
    """Renderiza el archivo HTML con datos y estado pre-calculados del lado del servidor."""
    if not INDEX_TEMPLATE_PATH.is_file():
        return b"<h1>Error: index.html no encontrado</h1>"

    with open(INDEX_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        html = f.read()

    stats = data_mgr.get_stats_dict()
    total_fotos = f"{stats.get('total_fotos', 2387):,}"
    fotos_gps = f"{stats.get('fotos_con_gps', 906):,}"
    fotos_sin_gps = f"{stats.get('fotos_sin_gps', 1481):,}"
    total_autores = f"{stats.get('total_autores', 74):,}"

    # Regiones (incluyendo chip para fotografías sin coordenadas GPS)
    regiones_cfg = [
        ('Andina', 'dot-andina', stats.get('conteo_regiones', {}).get('Andina', 683)),
        ('Pacífica', 'dot-pacifica', stats.get('conteo_regiones', {}).get('Pacífica', 102)),
        ('Caribe', 'dot-caribe', stats.get('conteo_regiones', {}).get('Caribe', 60)),
        ('Amazonía', 'dot-amazonia', stats.get('conteo_regiones', {}).get('Amazonía', 39)),
        ('Orinoquía', 'dot-orinoquia', stats.get('conteo_regiones', {}).get('Orinoquía', 21)),
        ('Insular', 'dot-insular', stats.get('conteo_regiones', {}).get('Insular', 1)),
    ]

    chips_html = ['            <!-- REGION_CHIPS_START -->']
    for reg_name, reg_cls, count in regiones_cfg:
        chips_html.append(
            f'            <button class="chip-btn" data-region="{reg_name}">\n'
            f'              <span class="dot-indicator {reg_cls}"></span>\n'
            f'              <span>{reg_name}</span> <span class="chip-count">({count})</span>\n'
            f'            </button>'
        )
    chips_html.append(
        f'            <button class="chip-btn" data-region="Sin Región" title="Fotografías sin coordenadas GPS registradas">\n'
        f'              <span class="dot-indicator" style="background:#94a3b8;"></span>\n'
        f'              <span>Sin GPS</span> <span class="chip-count">({fotos_sin_gps})</span>\n'
        f'            </button>'
    )
    chips_html.append('            <!-- REGION_CHIPS_END -->')
    chips_block = '\n'.join(chips_html)

    # Departamentos (con opción rápida de fotos sin GPS)
    dept_counts = stats.get('conteo_departamentos', {})
    sorted_depts = sorted(dept_counts.items(), key=lambda x: x[1], reverse=True)
    dept_opts = [
        '            <!-- DEPT_OPTIONS_START -->',
        f'            <option value="Sin GPS">📍 Sin Coordenadas GPS ({fotos_sin_gps})</option>'
    ]
    for dpt, count in sorted_depts:
        if dpt not in ('Sin GPS', 'Desconocido'):
            dept_opts.append(f'            <option value="{dpt}">{dpt} ({count})</option>')
    dept_opts.append('            <!-- DEPT_OPTIONS_END -->')
    dept_block = '\n'.join(dept_opts)

    # Autores
    top_autores = stats.get('top_autores', [])
    author_opts = ['            <!-- AUTHOR_OPTIONS_START -->']
    for autor in top_autores:
        a_name = autor.get('autor', '')
        a_total = f"{autor.get('total', 0):,}"
        author_opts.append(f'            <option value="{a_name}">{a_name} ({a_total})</option>')
    author_opts.append('            <!-- AUTHOR_OPTIONS_END -->')
    author_block = '\n'.join(author_opts)

    # Reemplazar secciones dinámicas
    html = re.sub(r'<!-- REGION_CHIPS_START -->.*?<!-- REGION_CHIPS_END -->', chips_block, html, flags=re.DOTALL)
    html = re.sub(r'<!-- DEPT_OPTIONS_START -->.*?<!-- DEPT_OPTIONS_END -->', dept_block, html, flags=re.DOTALL)
    html = re.sub(r'<!-- AUTHOR_OPTIONS_START -->.*?<!-- AUTHOR_OPTIONS_END -->', author_block, html, flags=re.DOTALL)

    # Cache busting de assets con mtime
    css_file = BASE_DIR / 'css' / 'style.css'
    js_file = BASE_DIR / 'js' / 'app.js'
    css_mtime = str(int(css_file.stat().st_mtime)) if css_file.is_file() else '1'
    js_mtime = str(int(js_file.stat().st_mtime)) if js_file.is_file() else '1'

    html = html.replace('/*__CSS_MTIME__*/1', css_mtime)
    html = html.replace('/*__JS_MTIME__*/1', js_mtime)

    # Inyección de estadísticas ligeras y backend info
    stats_raw = data_mgr.get_stats_raw().decode('utf-8', errors='replace')
    stats_injection = f"""{stats_raw};
    window.PYTHON_BACKEND = {{
      version: "3.13",
      runtime: "Toolforge Python 3.13 uWSGI",
      status: "active"
    }}"""
    html = html.replace('/*__PHP_STATS__*/null', stats_injection)

    return html.encode('utf-8')

    return html.encode('utf-8')


def app(environ, start_response):
    """
    Controlador WSGI compatible con uWSGI (Toolforge), Gunicorn y wsgiref.
    """
    method = environ.get('REQUEST_METHOD', 'GET')
    path_info = environ.get('PATH_INFO', '/')
    query_string = environ.get('QUERY_STRING', '')
    query = urllib.parse.parse_qs(query_string)
    host = environ.get('HTTP_HOST', '')

    # Cabeceras de seguridad comunes
    common_headers = [
        ('X-Content-Type-Options', 'nosniff'),
        ('X-Frame-Options', 'SAMEORIGIN'),
        ('Referrer-Policy', 'strict-origin-when-cross-origin'),
    ]

    # 1. Enrutador de la Página Principal (Index)
    if path_info in ('/', '/index.html', '/index.php'):
        # Si se solicita la API mediante ?api=... en la raíz
        if 'api' in query:
            api_endpoint = query['api'][0].strip().lower()
            return handle_api(api_endpoint, query, common_headers, start_response)

        # De lo contrario, entregar el HTML renderizado
        body = render_html(host)
        headers = [
            ('Content-Type', 'text/html; charset=utf-8'),
            ('Content-Length', str(len(body))),
            ('Cache-Control', 'public, max-age=300'),
        ] + common_headers
        start_response('200 OK', headers)
        return [body]

    # 2. Compatibilidad con api.php
    if path_info == '/api.php':
        action = query.get('action', ['puntos'])[0].strip().lower()
        return handle_api(action, query, common_headers, start_response)

    # 3. Endpoints REST (/api/...)
    if path_info.startswith('/api/'):
        action = path_info[len('/api/'):].strip().lower()
        return handle_api(action, query, common_headers, start_response)

    # 4. Servidor de Archivos Estáticos (css/, js/, data/, vendor/, etc.)
    safe_relative_path = path_info.lstrip('/')
    target_file = (BASE_DIR / safe_relative_path).resolve()

    # Seguridad: evitar Path Traversal (asegurar que está dentro de BASE_DIR)
    try:
        target_file.relative_to(BASE_DIR)
    except ValueError:
        start_response('403 Forbidden', [('Content-Type', 'text/plain')] + common_headers)
        return [b'403 Forbidden']

    if target_file.is_file():
        suffix = target_file.suffix.lower()
        content_type = MIME_TYPES.get(suffix) or mimetypes.guess_type(target_file.name)[0] or 'application/octet-stream'

        try:
            with open(target_file, 'rb') as f:
                content = f.read()
        except OSError:
            start_response('500 Internal Server Error', [('Content-Type', 'text/plain')] + common_headers)
            return [b'500 Error reading file']

        headers = [
            ('Content-Type', content_type),
            ('Content-Length', str(len(content))),
            ('Cache-Control', 'public, max-age=86400'),
        ] + common_headers
        start_response('200 OK', headers)
        return [content]

    # 5. Archivo no encontrado (404)
    start_response('404 Not Found', [('Content-Type', 'text/plain')] + common_headers)
    return [b'404 Not Found']


def handle_api(endpoint: str, query: dict, common_headers: list, start_response):
    """Manejador unificado de endpoints API."""
    cors_headers = [
        ('Access-Control-Allow-Origin', '*'),
        ('Access-Control-Allow-Methods', 'GET, OPTIONS'),
        ('Access-Control-Allow-Headers', 'Content-Type'),
    ]

    if endpoint == 'stats':
        body = data_mgr.get_stats_raw()
        headers = [
            ('Content-Type', 'application/json; charset=utf-8'),
            ('Content-Length', str(len(body))),
        ] + common_headers + cors_headers
        start_response('200 OK', headers)
        return [body]

    elif endpoint == 'puntos':
        region = query.get('region', [''])[0]
        departamento = query.get('departamento', [''])[0]
        autor = query.get('autor', [''])[0]
        body = data_mgr.get_filtered_puntos(region=region, departamento=departamento, autor=autor)
        headers = [
            ('Content-Type', 'application/geo+json; charset=utf-8'),
            ('Content-Length', str(len(body))),
        ] + common_headers + cors_headers
        start_response('200 OK', headers)
        return [body]

    elif endpoint == 'regiones':
        body = data_mgr.get_regiones_raw()
        headers = [
            ('Content-Type', 'application/geo+json; charset=utf-8'),
            ('Content-Length', str(len(body))),
        ] + common_headers + cors_headers
        start_response('200 OK', headers)
        return [body]

    elif endpoint == 'departamentos':
        body = data_mgr.get_departamentos_raw()
        headers = [
            ('Content-Type', 'application/geo+json; charset=utf-8'),
            ('Content-Length', str(len(body))),
        ] + common_headers + cors_headers
        start_response('200 OK', headers)
        return [body]

    elif endpoint == 'export_csv':
        body = data_mgr.generate_csv()
        today = datetime.date.today().strftime('%Y-%m-%d')
        filename = f'wle_colombia_2026_{today}.csv'
        headers = [
            ('Content-Type', 'text/csv; charset=utf-8'),
            ('Content-Disposition', f'attachment; filename="{filename}"'),
            ('Content-Length', str(len(body))),
        ] + common_headers + cors_headers
        start_response('200 OK', headers)
        return [body]

    else:
        info = {
            'status': 'ok',
            'runtime': 'Python 3.13 / Wikimedia Toolforge',
            'endpoints': ['stats', 'puntos', 'regiones', 'departamentos', 'export_csv']
        }
        body = json.dumps(info, indent=2).encode('utf-8')
        headers = [
            ('Content-Type', 'application/json; charset=utf-8'),
            ('Content-Length', str(len(body))),
        ] + common_headers + cors_headers
        start_response('200 OK', headers)
        return [body]


def main():
    """Ejecutor CLI para desarrollo local o contenedor independiente."""
    from wsgiref.simple_server import make_server

    port = 8080
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    elif 'PORT' in os.environ:
        try:
            port = int(os.environ['PORT'])
        except ValueError:
            pass

    host = '0.0.0.0'
    print("=" * 70)
    print("🌿 Wiki Loves Earth Colombia 2026 - Servidor Python 3.13")
    print("   Wikimedia Toolforge Contingency Runtime")
    print(f"🚀 Escuchando en http://localhost:{port}/")
    print(f"📁 Directorio base: {BASE_DIR}")
    print("=" * 70)

    try:
        with make_server(host, port, app) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")


if __name__ == '__main__':
    main()
