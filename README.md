# 🌿 Wiki Loves Earth Colombia 2026 - Mapa Interactivo

Aplicación web interactiva para visualizar las fotografías del concurso **Wiki Loves Earth Colombia 2026**, organizadas en un mapa centrado en Colombia con agrupamiento de puntos (*marker clustering*), visor de fotos de alta resolución (*lightbox*), enlaces directos a Wikimedia Commons / Google Maps y filtros avanzados por **Regiones Naturales de Colombia**, **Departamentos**, **Autores** y **Búsqueda por texto**.

---

## 🗺️ ¿Cómo se determinaron las Regiones de Colombia y el GeoJSON?

Para responder a la pregunta de cuál es el GeoJSON más fácil y la mejor manera de sacar las regiones de Colombia:

1. **La Fuente Base Oficial de Departamentos**:
   - Usamos el GeoJSON de Colombia ([referenciado en el gist de John Guerra](https://gist.github.com/john-guerra/43c7656821069d00dcbc)), que contiene los **33 departamentos/distritos oficiales** de Colombia (los 32 departamentos + Bogotá D.C.) basados en cartografía oficial del IGAC / DANE.

2. **La Mejor Manera de Agrupar por Regiones Naturales**:
   - En Colombia no existe una división política de "regiones naturales" como entidades gubernamentales independientes; las 6 regiones biogeográficas oficiales reconocidas por el IGAC y el DANE se componen a nivel territorial agrupando los departamentos así:
     - **Región Andina**: Antioquia, Boyacá, Caldas, Cundinamarca, Huila, Norte de Santander, Quindío, Risaralda, Santander, Tolima y Bogotá D.C.
     - **Región Caribe**: Atlántico, Bolívar, Cesar, Córdoba, La Guajira, Magdalena y Sucre.
     - **Región Pacífica**: Chocó, Cauca, Nariño y Valle del Cauca.
     - **Región Orinoquía**: Arauca, Casanare, Meta y Vichada.
     - **Región Amazonía**: Amazonas, Caquetá, Guainía, Guaviare, Putumayo y Vaupés.
     - **Región Insular**: Archipiélago de San Andrés, Providencia y Santa Catalina.
   - En este proyecto generamos dos capas GeoJSON complementarias en `data/`:
     - `data/colombia_regiones.geojson`: Los polígonos unificados (*dissolved*) de las **6 grandes regiones naturales**, cada una con su color característico.
     - `data/colombia_departamentos.geojson`: Los polígonos de los **33 departamentos** con su región asignada y metadatos.

3. **Conversión y Cruce Espacial de los Datos de Excel**:
   - El archivo `wle_2026_colombia_imagenes (1).xlsx` contenía 2.387 registros de fotos.
   - El script `scripts/convert_wle_data.py`:
     - Extrae las fechas, autores, descripciones y los hipervínculos originales a Wikimedia Commons y fotos originales.
     - Corrige errores tipográficos menores de longitud/latitud que venían en los metadatos (por ejemplo `-7.40` en lugar de `-74.0`).
     - Realiza un cruce espacial de punto en polígono (*Point-in-Polygon ray-casting*) y asignación por proximidad costera para fotos en playas o islas (Cartagena, Tayrona, Gorgona).
     - Genera miniaturas optimizadas mediante el servicio oficial `Special:FilePath` de Wikimedia para carga instantánea en navegador y móvil.
     - Produce `data/wle_colombia_puntos.geojson` con **906 puntos geolocalizados** clasificados al 100% en sus respectivas regiones.

---

## 📊 Estadísticas del Concurso en el Mapa

- **Total de Fotografías en el archivo**: 2.387 fotos
- **Fotografías con coordenadas GPS en el Mapa**: 906 fotos
- **Autores / Fotógrafos únicos**: 74 usuarios
- **Distribución por Región Natural**:
  - **Andina**: 683 fotos
  - **Pacífica**: 102 fotos
  - **Caribe**: 60 fotos
  - **Amazonía**: 39 fotos
  - **Orinoquía**: 21 fotos
  - **Insular**: 1 foto

---

## 🚀 Cómo Ejecutar la Aplicación

### Opción 1: Servidor CLI de PHP (Recomendado)
```bash
php -S 0.0.0.0:8080
```
Luego abre tu navegador en: [http://localhost:8080/](http://localhost:8080/) o [http://localhost:8080/index.php](http://localhost:8080/index.php)

### Opción 2: Con Docker
```bash
docker run -d --name wle-php -p 8080:8080 -v "$PWD":/var/www/html -w /var/www/html php:8.4-cli php -S 0.0.0.0:8080
```

### Opción 3: En un Servidor Web (Apache, Nginx, Wikimedia Toolforge)
Copia la carpeta en el directorio web (ej. `/var/www/html`, `public_html` o Wikimedia Toolforge PHP webservice).
El archivo `index.php` procesa y precarga la aplicación de forma inmediata junto a sus endpoints API (`?api=stats`, `?api=puntos`, `?api=export_csv`).

---

## 🛠️ Tecnologías y Estándares Wikimedia

- **Aplicación Web Full PHP Vanilla (`index.php`)**: Estructurada en PHP nativo sin dependencias de frameworks externos. Pre-renderiza estadísticas en el servidor, incluye un router API interno (`?api=stats`, `?api=puntos`, `?api=regiones`, `?api=departamentos`, `?api=export_csv`) y mantiene paridad estática con `index.html` para entornos sin PHP.
- **Motor de Filtros Facetados Dinámicos (Reactivo en tiempo real)**: Al seleccionar cualquier criterio (por ejemplo, un usuario o una palabra clave de búsqueda), se recalculan al vuelo los conteos disponibles en cada región (`Andina (12)`, `Caribe (0)`, etc.), atenuando las regiones sin coincidencias y filtrando los departamentos y fotógrafos disponibles de forma interdependiente.
- **Exclusión Mutua de Capas Cartográficas**: Conmutadores de capa estrictamente exclusivos entre la capa de las 6 Regiones Naturales y la de los 33 Departamentos, impidiendo que ambas capas se superpongan en el mapa.
- **Diseño Sobrio y Plano (Estilo Wikimedia Codex)**: Eliminación de gradientes llamativos y brillos en la barra lateral, utilizando una interfaz sobria en tonos slate/carbón mate, tipografía legible y controles planos.
- **Wikimedia Maps (`maps.wikimedia.org`) / OpenStreetMap / OpenTopoMap**: Capas base 100% Open Source y de cultura libre (ODbL / CC-BY-SA), sin marcas de agua comerciales, conformes a los estándares de la Fundación Wikimedia.
- **Wikimedia Toolforge cdnjs (`tools-static.wmflabs.org`)**: Todas las librerías frontend (Leaflet, MarkerCluster, Font Awesome y SheetJS) se cargan desde el CDN oficial de Wikimedia Toolforge con fallback automático a la carpeta local `vendor/`, respetando las directivas de privacidad de la Fundación Wikimedia (sin CDNs de terceros ni fuentes externas).
- **Exportación a Excel Dinámica (.xlsx)**: Descarga en `.xlsx` los resultados según los filtros activos, conservando exactamente las columnas originales:
  1. `Usuario / Autor`
  2. `Nombre de Archivo`
  3. `Fecha Subida (Hora Colombia COT)`
  4. `Descripción (Español)`
  5. `Ubicación GPS`
  6. `Ver en Mapa`
  7. `Enlace Directo Imagen`
  8. `Página Wikimedia Commons`
  9. `Vista Previa`
  *(adicionalmente incluye `Departamento` y `Región Natural`).*
- **Leaflet.js & MarkerCluster**: Agrupamiento fluido de más de 900 marcadores sin degradar el rendimiento.
- **HTML5 Nativo `<dialog>`**: Visor de fotos (*lightbox*) accesible, con soporte para teclado (flechas y Esc).
- **Turf.js & Python**: Generación de GeoJSONs, unión de geometrías regionales y cruce espacial de coordenadas.
- **Font Awesome 6 & Iconografía Oficial**: Iconografía vectorial profesional alojada en Toolforge, incorporando la esfera oficial de biodiversidad de Wikimedia (`Biodiversidad_esfera.png`).

---

## 👤 Créditos y Autoría

Web diseñada por **[Daniel Yepez Garces](https://meta.wikimedia.org/wiki/User:Danielyepezgarces)** para **[Wikimedia Colombia](https://co.wikimedia.org/)**.

