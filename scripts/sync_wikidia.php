<?php
/**
 * Wiki Loves Earth Colombia / WikiDía 2026
 * Sincronizador automatizado desde Wikimedia Commons
 * Runtime: PHP 8.4
 *
 * Categoría: Category:Caminata fotográfica en el Museo Quinta de Bolívar
 */

// Configuración base
$category = 'Category:Caminata fotográfica en el Museo Quinta de Bolívar';
$dataDir = __DIR__ . '/../data';
$cacheFile = "$dataDir/wikidia_puntos.geojson";
$fotosFile = "$dataDir/wikidia_fotos.json";
$statsFile = "$dataDir/wikidia_stats.json";

// Coordenadas oficiales Casa Museo Quinta de Bolívar (Bogotá D.C.)
$defaultLat = 4.602492;
$defaultLon = -74.065487;
$departamento = 'Bogotá D.C.';
$region = 'Andina';

$userAgent = 'WikiDiaApp/1.0 (https://co.wikimedia.org/; contacto@wikimedia.co)';

echo "▶ Consultando Wikimedia Commons: '$category'...\n";

$allPages = [];
$continueParam = '';

do {
    $params = [
        'action'        => 'query',
        'generator'     => 'categorymembers',
        'gcmtitle'      => $category,
        'gcmnamespace'  => 6, // Solo File:
        'gcmlimit'      => 500,
        'prop'          => 'imageinfo|coordinates',
        'iiprop'        => 'timestamp|user|url|size|extmetadata',
        'format'        => 'json'
    ];

    if (!empty($continueParam)) {
        $params['gcmcontinue'] = $continueParam;
    }

    $url = 'https://commons.wikimedia.org/w/api.php?' . http_build_query($params);

    $context = stream_context_create([
        'http' => [
            'method'  => 'GET',
            'header'  => "User-Agent: $userAgent\r\nAccept: application/json\r\n",
            'timeout' => 15
        ]
    ]);

    $raw = @file_get_contents($url, false, $context);
    if (!$raw) {
        echo "[!] No se pudo conectar a la API de Commons o la categoría aún no tiene archivos.\n";
        break;
    }

    $json = json_decode($raw, true);
    if (!empty($json['query']['pages'])) {
        foreach ($json['query']['pages'] as $pid => $page) {
            $allPages[$pid] = $page;
        }
    }

    $continueParam = $json['continue']['gcmcontinue'] ?? '';
} while (!empty($continueParam));

$features = [];
$fotos = [];
$autoresCount = [];

foreach ($allPages as $page) {
    if (empty($page['imageinfo'])) {
        continue;
    }

    $info = $page['imageinfo'][0];
    $meta = $info['extmetadata'] ?? [];

    // Priorizar coordenadas de geolocalización específicas
    $lat = isset($page['coordinates'][0]['lat'])
        ? (float)$page['coordinates'][0]['lat']
        : (isset($meta['GPSLatitude']['value']) ? (float)$meta['GPSLatitude']['value'] : $defaultLat);

    $lon = isset($page['coordinates'][0]['lon'])
        ? (float)$page['coordinates'][0]['lon']
        : (isset($meta['GPSLongitude']['value']) ? (float)$meta['GPSLongitude']['value'] : $defaultLon);

    $tituloLimpio = preg_replace('/^File:/i', '', $page['title']);
    $autor = $info['user'] ?? 'Anónimo';
    $fecha = $info['timestamp'] ?? date('c');
    $desc = strip_tags($meta['ImageDescription']['value'] ?? $tituloLimpio);

    // Miniatura optimizada de Wikimedia Commons
    $thumbUrl = "https://commons.wikimedia.org/wiki/Special:FilePath/" . rawurlencode($tituloLimpio) . "?width=640";

    $prop = [
        'nombre'       => $tituloLimpio,
        'autor'        => $autor,
        'fecha'        => $fecha,
        'desc'         => $desc,
        'region'       => $region,
        'departamento' => $departamento,
        'lat'          => $lat,
        'lng'          => $lon,
        'has_gps'      => true,
        'commons_url'  => $info['descriptionurl'] ?? "https://commons.wikimedia.org/wiki/{$page['title']}",
        'img_url'      => $info['url'] ?? '',
        'thumb_url'    => $thumbUrl,
        'gps_raw'      => "$lat, $lon",
        'map_url'      => "https://www.google.com/maps?q=$lat,$lon",
        'evento'       => 'WikiDía 2026 - Caminata Quinta de Bolívar'
    ];

    $fotos[] = $prop;
    $autoresCount[$autor] = ($autoresCount[$autor] ?? 0) + 1;

    $features[] = [
        'type' => 'Feature',
        'geometry' => [
            'type' => 'Point',
            'coordinates' => [$lon, $lat]
        ],
        'properties' => $prop
    ];
}

// Estructurar FeatureCollection GeoJSON
$geojson = [
    'type' => 'FeatureCollection',
    'metadata' => [
        'evento'            => 'WikiDía Colombia 2026',
        'actividad'         => 'Caminata fotográfica en el Museo Quinta de Bolívar',
        'categoria_commons' => $category,
        'ultima_sync'       => date('c'),
        'total'             => count($features)
    ],
    'features' => $features
];

$stats = [
    'total_fotos'      => count($features),
    'fotos_con_gps'    => count($features),
    'total_autores'    => count($autoresCount),
    'ultima_sync'      => date('c'),
    'categoria_url'    => "https://commons.wikimedia.org/wiki/" . rawurlencode(str_replace(' ', '_', $category))
];

@mkdir($dataDir, 0775, true);
file_put_contents($cacheFile, json_encode($geojson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
file_put_contents($fotosFile, json_encode($fotos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
file_put_contents($statsFile, json_encode($stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo "[+] Sincronizacion finalizada.\n";
echo "  • Total de fotos encontradas: " . count($features) . "\n";
echo "  • Archivos generados en data/:\n";
echo "    - $cacheFile\n";
echo "    - $fotosFile\n";
echo "    - $statsFile\n";
