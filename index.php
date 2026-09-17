<?php
/**
 * Wiki Loves Earth Colombia 2026 - Mapa Interactivo y Explorador de Biodiversidad
 * Aplicación Web Full PHP Vanilla
 * 
 * Diseñado por Daniel Yepez Garces (User:Danielyepezgarces) para Wikimedia Colombia
 */

// Cabeceras de seguridad y rendimiento
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');

$baseDir = __DIR__;
$dataDir = $baseDir . '/data';

// Manejador de endpoints de API en PHP Vanilla
if (isset($_GET['api'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    $api = trim($_GET['api']);
    switch ($api) {
        case 'stats':
            if (file_exists("$dataDir/wle_colombia_stats.json")) {
                readfile("$dataDir/wle_colombia_stats.json");
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Estadísticas no encontradas']);
            }
            exit;

        case 'puntos':
            if (file_exists("$dataDir/wle_colombia_puntos.geojson")) {
                readfile("$dataDir/wle_colombia_puntos.geojson");
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Puntos no encontrados']);
            }
            exit;

        case 'regiones':
            if (file_exists("$dataDir/colombia_regiones.geojson")) {
                readfile("$dataDir/colombia_regiones.geojson");
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Regiones no encontradas']);
            }
            exit;

        case 'departamentos':
            if (file_exists("$dataDir/colombia_departamentos.geojson")) {
                readfile("$dataDir/colombia_departamentos.geojson");
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Departamentos no encontrados']);
            }
            exit;

        case 'export_csv':
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="wle_colombia_2026_' . date('Y-m-d') . '.csv"');
            $output = fopen('php://output', 'w');
            fputs($output, "\xEF\xBB\xBF"); // BOM UTF-8 para compatibilidad con Excel
            fputcsv($output, ['Usuario / Autor', 'Nombre de Archivo', 'Fecha Subida (Hora Colombia COT)', 'Descripción (Español)', 'Ubicación GPS', 'Ver en Mapa', 'Enlace Directo Imagen', 'Página Wikimedia Commons', 'Vista Previa', 'Departamento', 'Región Natural']);
            if (file_exists("$dataDir/wle_colombia_fotos.json")) {
                $photos = json_decode(file_get_contents("$dataDir/wle_colombia_fotos.json"), true);
                foreach ($photos as $p) {
                    fputcsv($output, [
                        $p['autor'] ?? '',
                        $p['nombre'] ?? '',
                        $p['fecha'] ?? '',
                        $p['desc'] ?? '',
                        $p['gps_raw'] ?? '',
                        $p['map_url'] ?? '',
                        $p['img_url'] ?? '',
                        $p['commons_url'] ?? '',
                        $p['thumb_url'] ?? '',
                        $p['departamento'] ?? '',
                        $p['region'] ?? ''
                    ]);
                }
            }
            fclose($output);
            exit;

        default:
            echo json_encode(['status' => 'ok', 'endpoints' => ['stats', 'puntos', 'regiones', 'departamentos', 'export_csv']]);
            exit;
    }
}

// Carga y preprocesamiento de datos del lado del servidor
$statsFile = "$dataDir/wle_colombia_stats.json";
$stats = file_exists($statsFile) ? json_decode(file_get_contents($statsFile), true) : [
    'total_fotos' => 2387,
    'fotos_con_gps' => 906,
    'total_autores' => 74,
    'conteo_regiones' => [],
    'conteo_departamentos' => [],
    'top_autores' => []
];

$totalFotos = number_format($stats['total_fotos'] ?? 2387);
$fotosGps = number_format($stats['fotos_con_gps'] ?? 906);
$totalAutores = number_format($stats['total_autores'] ?? 74);
$totalRegiones = count($stats['conteo_regiones'] ?? []);

$regiones = [
    'Andina' => ['class' => 'dot-andina', 'count' => $stats['conteo_regiones']['Andina'] ?? 683],
    'Pacífica' => ['class' => 'dot-pacifica', 'count' => $stats['conteo_regiones']['Pacífica'] ?? 102],
    'Caribe' => ['class' => 'dot-caribe', 'count' => $stats['conteo_regiones']['Caribe'] ?? 60],
    'Amazonía' => ['class' => 'dot-amazonia', 'count' => $stats['conteo_regiones']['Amazonía'] ?? 39],
    'Orinoquía' => ['class' => 'dot-orinoquia', 'count' => $stats['conteo_regiones']['Orinoquía'] ?? 21],
    'Insular' => ['class' => 'dot-insular', 'count' => $stats['conteo_regiones']['Insular'] ?? 1],
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wiki Loves Earth Colombia 2026 - Mapa Interactivo</title>
  <meta name="description" content="Visualizador cartográfico interactivo de las fotografías del concurso Wiki Loves Earth Colombia 2026 clasificado por regiones naturales y departamentos.">

  <!-- Favicon: Biodiversidad Esfera -->
  <link rel="icon" type="image/png" href="https://upload.wikimedia.org/wikipedia/commons/c/ca/Biodiversidad_esfera.png">

  <!-- Font Awesome Icons (Wikimedia Toolforge cdnjs con fallback local) -->
  <link rel="stylesheet" href="https://tools-static.wmflabs.org/cdnjs/ajax/libs/font-awesome/6.5.1/css/all.min.css" onerror="this.onerror=null;this.href='vendor/font-awesome/css/all.min.css';" />

  <!-- Leaflet CSS (Wikimedia Toolforge cdnjs con fallback local a vendor/) -->
  <link rel="stylesheet" href="https://tools-static.wmflabs.org/cdnjs/ajax/libs/leaflet/1.9.4/leaflet.css" onerror="this.onerror=null;this.href='vendor/leaflet/leaflet.css';" />
  <!-- Leaflet MarkerCluster CSS (Wikimedia Toolforge cdnjs con fallback local a vendor/) -->
  <link rel="stylesheet" href="https://tools-static.wmflabs.org/cdnjs/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css" onerror="this.onerror=null;this.href='vendor/leaflet.markercluster/MarkerCluster.css';" />
  <link rel="stylesheet" href="https://tools-static.wmflabs.org/cdnjs/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css" onerror="this.onerror=null;this.href='vendor/leaflet.markercluster/MarkerCluster.Default.css';" />

  <!-- App Custom Styles -->
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

  <!-- Mobile Toggle Button -->
  <button id="mobile-sidebar-toggle" class="mobile-toggle-btn" aria-label="Abrir panel de filtros">
    <i class="fa-solid fa-filter"></i> <span>Filtros</span>
  </button>

  <div id="app-layout">
    <!-- Sidebar / Filter Panel -->
    <aside id="sidebar" role="region" aria-label="Filtros y Estadísticas">
      <!-- Header -->
      <header class="sidebar-header">
        <div class="brand-badge">
          <div class="brand-icon">
            <img src="https://upload.wikimedia.org/wikipedia/commons/c/ca/Biodiversidad_esfera.png" alt="Biodiversidad Esfera">
          </div>
          <div class="brand-titles">
            <h1>Wiki Loves Earth <span class="year-tag">2026</span></h1>
            <p>Fotografías de la biodiversidad de Colombia</p>
          </div>
        </div>
      </header>

      <!-- Quick Stats (Pre-renderizados en PHP) -->
      <div class="stats-summary">
        <div class="stat-item">
          <span class="stat-num" id="stat-total-photos"><?= htmlspecialchars($totalFotos) ?></span>
          <span class="stat-label">Total Fotos</span>
        </div>
        <div class="stat-item">
          <span class="stat-num" id="stat-gps-photos"><?= htmlspecialchars($fotosGps) ?></span>
          <span class="stat-label">En Mapa</span>
        </div>
        <div class="stat-item">
          <span class="stat-num" id="stat-authors"><?= htmlspecialchars($totalAutores) ?></span>
          <span class="stat-label">Autores</span>
        </div>
        <div class="stat-item">
          <span class="stat-num" id="stat-regions"><?= htmlspecialchars($totalRegiones) ?></span>
          <span class="stat-label">Regiones</span>
        </div>
      </div>

      <!-- Scrollable Body -->
      <div class="sidebar-body">
        
        <!-- Search -->
        <div class="form-group">
          <label for="search-input" class="section-label">
            <span>Buscar Foto / Especie / Autor</span>
          </label>
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input type="text" id="search-input" class="input-control" placeholder="Ej: Tucán, Cundinamarca, AmiGueko..." autocomplete="off">
            <button id="clear-search-btn" class="clear-search-btn" title="Limpiar búsqueda"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <!-- Filter by Natural Region (Filtros Facetados Dinámicos) -->
        <div class="form-group">
          <div class="section-label">
            <span>Filtrar por Región Natural</span>
            <button id="reset-filters-btn" style="background:none; border:none; color:var(--accent); font-size:0.75rem; cursor:pointer;">Limpiar</button>
          </div>
          <div class="region-chips" id="region-chips">
            <button class="chip-btn active" data-region="all">
              <span>Todas</span> <span class="chip-count">(<?= htmlspecialchars($fotosGps) ?>)</span>
            </button>
            <?php foreach ($regiones as $regNombre => $regInfo): ?>
            <button class="chip-btn" data-region="<?= htmlspecialchars($regNombre) ?>">
              <span class="dot-indicator <?= htmlspecialchars($regInfo['class']) ?>"></span>
              <span><?= htmlspecialchars($regNombre) ?></span> <span class="chip-count">(<?= htmlspecialchars($regInfo['count']) ?>)</span>
            </button>
            <?php endforeach; ?>
          </div>
        </div>

        <!-- Filter by Department -->
        <div class="form-group">
          <label for="filter-department" class="section-label">
            <span>Departamento de Colombia</span>
          </label>
          <select id="filter-department" class="select-control">
            <option value="all">Todos los Departamentos (<?= htmlspecialchars($fotosGps) ?>)</option>
            <?php 
            if (!empty($stats['conteo_departamentos'])) {
                $sortedDepts = $stats['conteo_departamentos'];
                arsort($sortedDepts);
                foreach ($sortedDepts as $dpt => $count) {
                    if ($dpt !== 'Sin GPS' && $dpt !== 'Desconocido') {
                        echo '<option value="' . htmlspecialchars($dpt) . '">' . htmlspecialchars($dpt) . ' (' . htmlspecialchars($count) . ')</option>';
                    }
                }
            }
            ?>
          </select>
        </div>

        <!-- Filter by Author / Photographer -->
        <div class="form-group">
          <label for="filter-author" class="section-label">
            <span>Fotógrafo / Usuario Wikimedia</span>
          </label>
          <select id="filter-author" class="select-control">
            <option value="all">Todos los Fotógrafos (<?= htmlspecialchars($totalAutores) ?>)</option>
            <?php 
            if (!empty($stats['top_autores'])) {
                foreach ($stats['top_autores'] as $autor) {
                    echo '<option value="' . htmlspecialchars($autor['autor']) . '">' . htmlspecialchars($autor['autor']) . ' (' . htmlspecialchars($autor['con_gps']) . ')</option>';
                }
            }
            ?>
          </select>
        </div>

        <!-- Layer Toggles (Exclusivos) -->
        <div class="form-group">
          <div class="section-label">
            <span>Capas Cartográficas</span>
          </div>
          <div class="layer-toggles">
            <button id="toggle-regions-layer" class="layer-btn active" title="Activar polígonos de las 6 regiones naturales">
              <i class="fa-solid fa-layer-group"></i> 6 Regiones
            </button>
            <button id="toggle-depts-layer" class="layer-btn" title="Activar límites de los 33 departamentos">
              <i class="fa-solid fa-map-location-dot"></i> 33 Departamentos
            </button>
          </div>
        </div>

        <!-- Export to Excel Button -->
        <div class="form-group">
          <button id="export-excel-btn" class="btn-export-excel" title="Descargar datos filtrados en formato Excel (.xlsx)">
            <i class="fa-solid fa-file-excel"></i>
            <span id="export-btn-label">Exportar a Excel (.xlsx)</span>
            <span id="export-count-badge" class="export-badge"><?= htmlspecialchars($fotosGps) ?></span>
          </button>
        </div>

        <!-- Photos Gallery Preview -->
        <div class="photo-gallery-preview">
          <div class="section-label">
            <span>Explorador de Fotos</span>
            <span id="filtered-count-badge" class="badge-count">Cargando...</span>
          </div>
          <div id="gallery-grid" class="gallery-grid">
            <!-- Dynamically populated -->
          </div>
        </div>

      </div>

      <!-- Footer -->
      <footer class="sidebar-footer">
        <div class="footer-author">
          Web diseñada por <a href="https://meta.wikimedia.org/wiki/User:Danielyepezgarces" target="_blank" rel="noopener noreferrer">Daniel Yepez Garces</a> para <a href="https://co.wikimedia.org/" target="_blank" rel="noopener noreferrer">Wikimedia Colombia</a>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span>Datos: <a href="https://commons.wikimedia.org/wiki/Commons:Wiki_Loves_Earth_2026_in_Colombia" target="_blank" rel="noopener noreferrer">WLE Colombia</a></span>
          <span>Cartografía: IGAC / DANE</span>
        </div>
      </footer>
    </aside>

    <!-- Map Container -->
    <main id="map-container" role="main">
      <div id="map"></div>

      <!-- Map Legend -->
      <div class="map-legend">
        <div class="legend-title">
          <span>Regiones Naturales</span>
        </div>
        <div class="legend-items">
          <div class="legend-row">
            <span class="legend-color-box" style="background: var(--reg-andina);"></span>
            <span>Región Andina (Cordilleras)</span>
          </div>
          <div class="legend-row">
            <span class="legend-color-box" style="background: var(--reg-caribe);"></span>
            <span>Región Caribe (Norte Costero)</span>
          </div>
          <div class="legend-row">
            <span class="legend-color-box" style="background: var(--reg-pacifica);"></span>
            <span>Región Pacífica (Chocó Biogeográfico)</span>
          </div>
          <div class="legend-row">
            <span class="legend-color-box" style="background: var(--reg-orinoquia);"></span>
            <span>Región Orinoquía (Llanos)</span>
          </div>
          <div class="legend-row">
            <span class="legend-color-box" style="background: var(--reg-amazonia);"></span>
            <span>Región Amazonía (Selva Sur)</span>
          </div>
          <div class="legend-row">
            <span class="legend-color-box" style="background: var(--reg-insular);"></span>
            <span>Región Insular (San Andrés y Providencia)</span>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Native Lightbox Modal Dialog -->
  <dialog id="lightbox-dialog" aria-labelledby="lightbox-title">
    <div class="lightbox-content">
      <div class="lightbox-header">
        <h2 id="lightbox-title" style="font-size:1.1rem; font-weight:600;">Detalles de la Fotografía</h2>
        <div style="display:flex; align-items:center; gap:12px;">
          <span id="lightbox-counter" style="font-size:0.8rem; color:var(--text-muted);">1 de 906</span>
          <button onclick="closeLightbox()" class="icon-btn" title="Cerrar (Esc)"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="lightbox-body">
        <div class="lightbox-image-view">
          <img id="lightbox-img" src="" alt="Fotografía WLE Colombia" loading="lazy" />
        </div>
        <div class="lightbox-details">
          <div class="detail-row">
            <label>Fotógrafo / Usuario</label>
            <div class="value" id="lightbox-author">-</div>
          </div>
          <div class="detail-row">
            <label>Ubicación</label>
            <div class="value" id="lightbox-location">-</div>
          </div>
          <div class="detail-row">
            <label>Coordenadas GPS</label>
            <div class="value" id="lightbox-coords">-</div>
          </div>
          <div class="detail-row">
            <label>Fecha de Subida (COT)</label>
            <div class="value" id="lightbox-date">-</div>
          </div>
          <div class="detail-row">
            <label>Descripción</label>
            <div class="value" id="lightbox-desc" style="line-height:1.4; font-size:0.85rem;">-</div>
          </div>

          <div style="margin-top:auto; display:flex; flex-direction:column; gap:8px;">
            <a id="lightbox-commons-link" class="btn-popup btn-popup-primary" href="#" target="_blank" rel="noopener noreferrer">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Ver en Wikimedia Commons
            </a>
            <div style="display:flex; gap:8px;">
              <a id="lightbox-maps-link" class="btn-popup btn-popup-outline" href="#" target="_blank" rel="noopener noreferrer" style="flex:1;">
                <i class="fa-solid fa-location-dot"></i> Google Maps
              </a>
              <a id="lightbox-download-link" class="btn-popup btn-popup-outline" href="#" target="_blank" download style="flex:1;">
                <i class="fa-solid fa-download"></i> Descargar HD
              </a>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:8px;">
              <button onclick="navigateLightbox(-1)" class="btn-popup btn-popup-outline" style="flex:1; margin-right:4px;">
                <i class="fa-solid fa-chevron-left"></i> Anterior
              </button>
              <button onclick="navigateLightbox(1)" class="btn-popup btn-popup-outline" style="flex:1; margin-left:4px;">
                Siguiente <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </dialog>

  <!-- Leaflet JS (Wikimedia Toolforge cdnjs con fallback local) -->
  <script src="https://tools-static.wmflabs.org/cdnjs/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
  <script>window.L || document.write('<script src="vendor/leaflet/leaflet.js"><\/script>')</script>

  <!-- Leaflet MarkerCluster JS (Wikimedia Toolforge cdnjs con fallback local) -->
  <script src="https://tools-static.wmflabs.org/cdnjs/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>
  <script>window.L && L.MarkerClusterGroup || document.write('<script src="vendor/leaflet.markercluster/leaflet.markercluster.js"><\/script>')</script>

  <!-- SheetJS XLSX (Wikimedia Toolforge cdnjs con fallback local) -->
  <script src="https://tools-static.wmflabs.org/cdnjs/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <script>window.XLSX || document.write('<script src="vendor/xlsx/xlsx.full.min.js"><\/script>')</script>

  <!-- Pre-cargado de datos dinámicos en PHP Vanilla para carga inmediata -->
  <script>
    window.PHP_INITIAL_DATA = {
      puntos: <?= file_exists("$dataDir/wle_colombia_puntos.geojson") ? file_get_contents("$dataDir/wle_colombia_puntos.geojson") : 'null' ?>,
      fotos: <?= file_exists("$dataDir/wle_colombia_fotos.json") ? file_get_contents("$dataDir/wle_colombia_fotos.json") : 'null' ?>,
      regiones: <?= file_exists("$dataDir/colombia_regiones.geojson") ? file_get_contents("$dataDir/colombia_regiones.geojson") : 'null' ?>,
      departamentos: <?= file_exists("$dataDir/colombia_departamentos.geojson") ? file_get_contents("$dataDir/colombia_departamentos.geojson") : 'null' ?>,
      stats: <?= file_exists("$dataDir/wle_colombia_stats.json") ? file_get_contents("$dataDir/wle_colombia_stats.json") : 'null' ?>
    };
  </script>

  <!-- App Application JS -->
  <script src="js/app.js"></script>
</body>
</html>
