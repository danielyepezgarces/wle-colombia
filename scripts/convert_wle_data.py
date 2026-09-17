#!/usr/bin/env python3
"""
Script to extract, clean, and convert Wiki Loves Earth Colombia 2026 Excel data
into GeoJSON and JSON formats with spatial matching against Colombian departments & regions.
"""

import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

# Define Region Mapping for Colombia's 33 departments/districts
REGION_MAP = {
    'ANTIOQUIA': 'Andina',
    'BOYACA': 'Andina',
    'CALDAS': 'Andina',
    'CUNDINAMARCA': 'Andina',
    'HUILA': 'Andina',
    'NORTE DE SANTANDER': 'Andina',
    'QUINDIO': 'Andina',
    'RISARALDA': 'Andina',
    'SANTANDER': 'Andina',
    'TOLIMA': 'Andina',
    'SANTAFE DE BOGOTA D.C': 'Andina',

    'ATLANTICO': 'Caribe',
    'BOLIVAR': 'Caribe',
    'CESAR': 'Caribe',
    'CORDOBA': 'Caribe',
    'LA GUAJIRA': 'Caribe',
    'MAGDALENA': 'Caribe',
    'SUCRE': 'Caribe',

    'CHOCO': 'Pacífica',
    'CAUCA': 'Pacífica',
    'NARIÑO': 'Pacífica',
    'VALLE DEL CAUCA': 'Pacífica',

    'ARAUCA': 'Orinoquía',
    'CASANARE': 'Orinoquía',
    'META': 'Orinoquía',
    'VICHADA': 'Orinoquía',

    'AMAZONAS': 'Amazonía',
    'CAQUETA': 'Amazonía',
    'GUAINIA': 'Amazonía',
    'GUAVIARE': 'Amazonía',
    'PUTUMAYO': 'Amazonía',
    'VAUPES': 'Amazonía',

    'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA': 'Insular'
}

REGION_COLORS = {
    'Andina': '#2563eb',    # Azul Real
    'Caribe': '#f59e0b',    # Ámbar / Amarillo Sol
    'Pacífica': '#06b6d4',  # Turquesa / Cian Pacífico
    'Orinoquía': '#ea580c', # Naranja Atardecer
    'Amazonía': '#16a34a',  # Verde Selva
    'Insular': '#9333ea'    # Violeta
}

NAME_FORMAT = {
    'SANTAFE DE BOGOTA D.C': 'Bogotá D.C.',
    'VALLE DEL CAUCA': 'Valle del Cauca',
    'NORTE DE SANTANDER': 'Norte de Santander',
    'LA GUAJIRA': 'La Guajira',
    'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA': 'San Andrés y Providencia'
}

def format_dept_name(dpt):
    if dpt in NAME_FORMAT:
        return NAME_FORMAT[dpt]
    return dpt.title()

def point_in_poly(x, y, poly):
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def point_in_geom(x, y, geom):
    gtype = geom['type']
    coords = geom['coordinates']
    if gtype == 'Polygon':
        if point_in_poly(x, y, coords[0]):
            for hole in coords[1:]:
                if point_in_poly(x, y, hole):
                    return False
            return True
        return False
    elif gtype == 'MultiPolygon':
        for poly in coords:
            if point_in_poly(x, y, poly[0]):
                in_hole = False
                for hole in poly[1:]:
                    if point_in_poly(x, y, hole):
                        in_hole = True
                        break
                if not in_hole:
                    return True
        return False
    return False

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    xlsx_path = os.path.join(base_dir, 'wle_2026_colombia_imagenes (1).xlsx')
    dept_geojson_path = os.path.join(base_dir, 'data', 'colombia_departamentos.geojson')
    
    if not os.path.exists(xlsx_path):
        print(f"Error: {xlsx_path} not found")
        sys.exit(1)
        
    print("Loading Colombia departments GeoJSON...")
    with open(dept_geojson_path, 'r', encoding='utf-8') as f:
        geo_data = json.load(f)

    # Precalculate bounding boxes and boundary points for nearest match fallback
    dept_polys = []
    for f in geo_data['features']:
        name = f['properties']['NOMBRE_DPT']
        geom = f['geometry']
        all_pts = []
        if geom['type'] == 'Polygon':
            for ring in geom['coordinates']: all_pts.extend(ring)
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                for ring in poly: all_pts.extend(ring)
        minx = min(p[0] for p in all_pts)
        maxx = max(p[0] for p in all_pts)
        miny = min(p[1] for p in all_pts)
        maxy = max(p[1] for p in all_pts)
        dept_polys.append({
            'name': name,
            'region': REGION_MAP.get(name, 'Otra'),
            'geom': geom,
            'bbox': (minx, miny, maxx, maxy),
            'pts': all_pts
        })

    def match_department(lng, lat):
        # 1. Exact point in polygon
        for d in dept_polys:
            minx, miny, maxx, maxy = d['bbox']
            if minx <= lng <= maxx and miny <= lat <= maxy:
                if point_in_geom(lng, lat, d['geom']):
                    return d['name'], d['region']
        # 2. Nearest point fallback (for coastal beaches/bays slightly outside simplified vector polygons)
        best_dist = 999.0
        best_dept = None
        for d in dept_polys:
            minx, miny, maxx, maxy = d['bbox']
            # quick distance to bbox
            if lng < minx - 0.5 or lng > maxx + 0.5 or lat < miny - 0.5 or lat > maxy + 0.5:
                continue
            for px, py in d['pts'][::3]: # sampled for speed
                dist = (px - lng)**2 + (py - lat)**2
                if dist < best_dist:
                    best_dist = dist
                    best_dept = d
        if best_dept and best_dist < 0.25: # within ~25-30 km of coast
            return best_dept['name'], best_dept['region']
        return 'Desconocido', 'Desconocida'

    print("Extracting data and hyperlinks from Excel file...")
    with zipfile.ZipFile(xlsx_path) as z:
        # Load relationships
        rels_tree = ET.fromstring(z.read('xl/worksheets/_rels/sheet1.xml.rels'))
        rel_map = {r.attrib['Id']: r.attrib.get('Target', '') for r in rels_tree}
        
        # Load shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            sstree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in sstree.findall('ns:si', ns):
                shared_strings.append(''.join([t.text or '' for t in si.findall('.//ns:t', ns)]))
                
        s1_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        cell_links = {}
        for h in s1_tree.findall('ns:hyperlinks/ns:hyperlink', ns):
            ref = h.attrib.get('ref')
            r_id = h.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            if ref and r_id in rel_map:
                cell_links[ref] = rel_map[r_id]
                
        rows = s1_tree.findall('ns:sheetData/ns:row', ns)
        print(f"Total rows in sheet 1: {len(rows)}")
        
        all_photos = []
        geojson_features = []
        
        # Row 1 is header
        excel_epoch = datetime(1899, 12, 30)
        
        for r in rows[1:]:
            row_idx = r.attrib.get('r')
            cols = {}
            for c in r.findall('ns:c', ns):
                col_letter = ''.join([ch for ch in c.attrib.get('r', '') if ch.isalpha()])
                t = c.attrib.get('t')
                v = c.find('ns:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    val = shared_strings[int(val)]
                cols[col_letter] = val
                
            autor = cols.get('A', '').strip()
            nombre = cols.get('B', '').strip()
            fecha_raw = cols.get('C', '').strip()
            desc = cols.get('D', '').strip()
            gps_raw = cols.get('E', '').strip()
            
            map_url = cell_links.get(f'F{row_idx}', '')
            img_url = cell_links.get(f'G{row_idx}', '')
            commons_url = cell_links.get(f'H{row_idx}', '')
            
            # Format date
            fecha_iso = ''
            try:
                if fecha_raw:
                    days = float(fecha_raw)
                    dt = excel_epoch + timedelta(days=days)
                    fecha_iso = dt.strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                fecha_iso = fecha_raw
                
            # Parse Coordinates
            lat, lng = None, None
            has_gps = False
            dept_name = 'Sin GPS'
            region_name = 'Sin Región'
            
            if gps_raw and 'sin coordenadas' not in gps_raw.lower() and ',' in gps_raw:
                try:
                    parts = gps_raw.split(',')
                    raw_lat = float(parts[0].strip())
                    raw_lng = float(parts[1].strip())
                    
                    # Sanitize known typos (e.g. -7.40348 -> -74.0348, 7.415267 -> -74.15267, -7.883198 -> 7.883198)
                    fixed_lat = raw_lat
                    fixed_lng = raw_lng
                    
                    if -10 < fixed_lng < 0:
                        fixed_lng = fixed_lng * 10
                    elif 0 < fixed_lng < 10:
                        fixed_lng = -fixed_lng * 10
                        
                    if fixed_lat < -5 and fixed_lng < -70:
                        fixed_lat = abs(fixed_lat)
                        
                    lat = round(fixed_lat, 6)
                    lng = round(fixed_lng, 6)
                    has_gps = True
                    
                    dept_raw, reg = match_department(lng, lat)
                    dept_name = dept_raw
                    region_name = reg
                except Exception as e:
                    has_gps = False
                    
            # Thumbnail URL via official Wikimedia Special:FilePath
            import urllib.parse
            thumb_url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(nombre)}?width=640"

            item = {
                'id': int(row_idx) - 1,
                'autor': autor,
                'nombre': nombre,
                'fecha': fecha_iso,
                'desc': desc,
                'gps_raw': gps_raw,
                'lat': lat,
                'lng': lng,
                'has_gps': has_gps,
                'map_url': map_url,
                'img_url': img_url,
                'thumb_url': thumb_url,
                'commons_url': commons_url,
                'departamento': format_dept_name(dept_name) if dept_name not in ['Sin GPS', 'Desconocido'] else dept_name,
                'departamento_raw': dept_name,
                'region': region_name,
                'region_color': REGION_COLORS.get(region_name, '#94a3b8')
            }
            all_photos.append(item)
            
            if has_gps:
                feature = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [lng, lat]
                    },
                    'properties': {
                        'id': item['id'],
                        'autor': autor,
                        'nombre': nombre,
                        'fecha': fecha_iso,
                        'desc': desc,
                        'img_url': img_url,
                        'thumb_url': thumb_url,
                        'commons_url': commons_url,
                        'map_url': map_url,
                        'departamento': item['departamento'],
                        'departamento_raw': dept_name,
                        'region': region_name,
                        'region_color': item['region_color']
                    }
                }
                geojson_features.append(feature)

    print(f"Total photos parsed: {len(all_photos)}")
    print(f"Photos with valid GPS on map: {len(geojson_features)}")

    # Statistics summaries
    author_counts = {}
    region_counts = {}
    dept_counts = {}
    
    for p in all_photos:
        autor = p['autor']
        author_counts[autor] = author_counts.get(autor, {'total': 0, 'con_gps': 0})
        author_counts[autor]['total'] += 1
        if p['has_gps']:
            author_counts[autor]['con_gps'] += 1
            
        if p['has_gps']:
            reg = p['region']
            region_counts[reg] = region_counts.get(reg, 0) + 1
            dpt = p['departamento']
            dept_counts[dpt] = dept_counts.get(dpt, 0) + 1

    sorted_authors = sorted(
        [{'autor': k, 'total': v['total'], 'con_gps': v['con_gps']} for k, v in author_counts.items()],
        key=lambda x: x['total'],
        reverse=True
    )

    stats = {
        'total_fotos': len(all_photos),
        'fotos_con_gps': len(geojson_features),
        'fotos_sin_gps': len(all_photos) - len(geojson_features),
        'total_autores': len(author_counts),
        'conteo_regiones': region_counts,
        'conteo_departamentos': dept_counts,
        'top_autores': sorted_authors[:25]
    }

    # Save outputs
    out_dir = os.path.join(base_dir, 'data')
    os.makedirs(out_dir, exist_ok=True)
    
    puntos_geojson_path = os.path.join(out_dir, 'wle_colombia_puntos.geojson')
    with open(puntos_geojson_path, 'w', encoding='utf-8') as f:
        json.dump({
            'type': 'FeatureCollection',
            'features': geojson_features
        }, f, ensure_ascii=False)
    print(f"Saved: {puntos_geojson_path} ({os.path.getsize(puntos_geojson_path) / 1024:.1f} KB)")

    fotos_json_path = os.path.join(out_dir, 'wle_colombia_fotos.json')
    with open(fotos_json_path, 'w', encoding='utf-8') as f:
        json.dump(all_photos, f, ensure_ascii=False)
    print(f"Saved: {fotos_json_path} ({os.path.getsize(fotos_json_path) / 1024:.1f} KB)")

    stats_json_path = os.path.join(out_dir, 'wle_colombia_stats.json')
    with open(stats_json_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"Saved: {stats_json_path}")

    print("\nRegional Distribution:")
    for reg, count in sorted(region_counts.items(), key=lambda x: x[1], reverse=True):
        print(f" - {reg}: {count} fotos geolocalizadas")

if __name__ == '__main__':
    main()
