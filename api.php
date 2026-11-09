<?php
/**
 * API opcional en PHP para consultar los datos de Wiki Loves Earth Colombia 2026
 * 
 * Endpoints:
 * - api.php?action=puntos [&region=Andina] [&departamento=Antioquia] [&autor=Supertita]
 * - api.php?action=regiones
 * - api.php?action=departamentos
 * - api.php?action=stats
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$action = isset($_GET['action']) ? $_GET['action'] : 'puntos';
$dataDir = __DIR__ . '/data';

switch ($action) {
    case 'regiones':
        $file = $dataDir . '/colombia_regiones.geojson';
        if (file_exists($file)) {
            readfile($file);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Archivo de regiones no encontrado']);
        }
        break;

    case 'departamentos':
        $file = $dataDir . '/colombia_departamentos.geojson';
        if (file_exists($file)) {
            readfile($file);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Archivo de departamentos no encontrado']);
        }
        break;

    case 'stats':
        $file = $dataDir . '/wle_colombia_stats.json';
        if (file_exists($file)) {
            readfile($file);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Estadísticas no encontradas']);
        }
        break;

    case 'wikidia':
        $file = $dataDir . '/wikidia_puntos.geojson';
        if (file_exists($file)) {
            readfile($file);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Datos de WikiDía aún no sincronizados']);
        }
        break;

    case 'wikidia_stats':
        $file = $dataDir . '/wikidia_stats.json';
        if (file_exists($file)) {
            readfile($file);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Estadísticas de WikiDía no encontradas']);
        }
        break;

    case 'sync_wikidia':
        $syncScript = __DIR__ . '/scripts/sync_wikidia.php';
        if (file_exists($syncScript)) {
            ob_start();
            include $syncScript;
            $output = ob_get_clean();
            $stats = file_exists($dataDir . '/wikidia_stats.json') 
                ? json_decode(file_get_contents($dataDir . '/wikidia_stats.json'), true) 
                : [];
            echo json_encode([
                'status' => 'ok',
                'message' => 'Sincronización ejecutada con éxito',
                'output' => trim($output),
                'stats' => $stats
            ], JSON_UNESCAPED_UNICODE);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Script de sincronización no encontrado']);
        }
        break;

    case 'puntos':
    default:
        $file = $dataDir . '/wle_colombia_puntos.geojson';
        if (!file_exists($file)) {
            http_response_code(404);
            echo json_encode(['error' => 'Datos de puntos no encontrados']);
            exit;
        }

        // Si no hay filtros por GET, servir el archivo directamente de forma ultra rápida
        $region = isset($_GET['region']) ? trim($_GET['region']) : '';
        $departamento = isset($_GET['departamento']) ? trim($_GET['departamento']) : '';
        $autor = isset($_GET['autor']) ? trim($_GET['autor']) : '';

        if (empty($region) && empty($departamento) && empty($autor)) {
            readfile($file);
            exit;
        }

        // Filtrar en PHP
        $geojson = json_decode(file_get_contents($file), true);
        if (!$geojson || !isset($geojson['features'])) {
            http_response_code(500);
            echo json_encode(['error' => 'Error al decodificar GeoJSON']);
            exit;
        }

        $filtered = array_filter($geojson['features'], function ($feature) use ($region, $departamento, $autor) {
            $props = $feature['properties'];
            if (!empty($region) && strcasecmp($props['region'], $region) !== 0) {
                return false;
            }
            if (!empty($departamento) && strcasecmp($props['departamento'], $departamento) !== 0) {
                return false;
            }
            if (!empty($autor) && strcasecmp($props['autor'], $autor) !== 0) {
                return false;
            }
            return true;
        });

        echo json_encode([
            'type' => 'FeatureCollection',
            'features' => array_values($filtered)
        ], JSON_UNESCAPED_UNICODE);
        break;
}
?>
