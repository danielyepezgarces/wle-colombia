/**
 * Wiki Loves Earth Colombia 2026 - Interactive Map & Photo Explorer
 * Modern Vanilla JS implementation with Leaflet & MarkerCluster
 * Optimizado para alto rendimiento y visualización de fotos con y sin GPS
 */

// Global State
const state = {
  map: null,
  allPoints: [],        // Fotografías con coordenadas para el mapa
  filteredPoints: [],   // Puntos filtrados activos en Leaflet
  allPhotos: [],        // Colección completa de las 2.387 fotos (con y sin GPS)
  filteredPhotos: [],   // Colección filtrada activa para galería lateral y visor
  regionsGeoJSON: null,
  departmentsGeoJSON: null,
  regionsLayer: null,
  departmentsLayer: null,
  clusterGroup: null,
  activeRegion: 'all',
  activeDepartment: 'all',
  activeAuthor: 'all',
  searchQuery: '',
  showRegionsLayer: true,
  showDepartmentsLayer: false,
  currentLightboxIndex: -1,
  stats: window.PHP_STATS || null,
  galleryPage: 1,
  galleryPageSize: 24
};

// Region color palette (High-contrast distinct chromatic palette)
const REGION_COLORS = {
  'Andina': '#2563eb',     // Azul Real
  'Caribe': '#f59e0b',     // Ámbar / Amarillo Sol
  'Pacífica': '#06b6d4',   // Turquesa / Cian Pacífico
  'Orinoquía': '#ea580c',  // Naranja Atardecer Llanero
  'Amazonía': '#16a34a',   // Verde Selva Amazónica
  'Insular': '#9333ea',     // Violeta / Púrpura
  'Sin Región': '#94a3b8'  // Gris Slate para fotos sin GPS
};

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  setupEventListeners();
  await loadData();
  populateFilterDropdowns();
  updateFilters();
});

/**
 * Initialize Leaflet Map centered on Colombia
 */
function initMap() {
  const COLOMBIA_CENTER = [4.570868, -74.297333];
  const DEFAULT_ZOOM = 6;

  state.map = L.map('map', {
    center: COLOMBIA_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    minZoom: 4,
    maxZoom: 18
  });

  // Zoom control on top-left
  L.control.zoom({ position: 'topleft' }).addTo(state.map);

  // Recenter Colombia Control
  const RecenterControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-recenter-bar');
      const btn = L.DomUtil.create('a', 'leaflet-control-recenter-btn', container);
      btn.id = 'recenter-btn';
      btn.href = '#';
      btn.title = 'Centrar mapa en Colombia';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Centrar mapa en Colombia');
      btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        state.map.setView(COLOMBIA_CENTER, DEFAULT_ZOOM);
      });
      return container;
    }
  });
  state.map.addControl(new RecenterControl());

  // 100% Free / Open Source Tile Layers
  const wikimedia = L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, &copy; <a href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use" target="_blank">Wikimedia Maps</a>',
    maxZoom: 19
  });

  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>)',
    subdomains: 'abc',
    maxZoom: 17
  });

  // Default basemap: Wikimedia Foundation Official Maps
  wikimedia.addTo(state.map);

  // Layer control for Basemaps
  const baseMaps = {
    '<i class="fa-solid fa-earth-americas"></i> Wikimedia Maps': wikimedia,
    '<i class="fa-solid fa-map"></i> OpenStreetMap': osm,
    '<i class="fa-solid fa-mountain"></i> OpenTopoMap (Relieve)': openTopo
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(state.map);

  // Initialize MarkerClusterGroup
  state.clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      let c = 'marker-cluster-';
      if (count < 10) c += 'small';
      else if (count < 50) c += 'medium';
      else c += 'large';

      return new L.DivIcon({
        html: `<div><span>${count}</span></div>`,
        className: 'marker-cluster ' + c,
        iconSize: new L.Point(40, 40)
      });
    }
  });

  state.map.addLayer(state.clusterGroup);
}

/**
 * Load Data files asynchronously
 * (departments GeoJSON is lazy-loaded only when requested to save bandwidth)
 */
async function loadData() {
  try {
    showLoading(true);

    const [puntosRes, fotosRes, regionesRes, statsRes] = await Promise.all([
      fetch('data/wle_colombia_puntos.geojson').then(r => r.json()),
      fetch('data/wle_colombia_fotos.json').then(r => r.json()),
      fetch('data/colombia_regiones.geojson').then(r => r.json()),
      state.stats ? Promise.resolve(state.stats) : fetch('data/wle_colombia_stats.json').then(r => r.json())
    ]);

    state.allPoints = puntosRes.features || [];
    state.allPhotos = fotosRes || [];
    state.filteredPhotos = [...state.allPhotos];
    state.regionsGeoJSON = regionesRes;
    state.stats = statsRes;

    renderStatsSummary();
    renderRegionsLayer();
    showLoading(false);
  } catch (error) {
    console.error('Error cargando datos:', error);
    showLoading(false);
  }
}

/**
 * Render Region Polygons Layer
 */
function renderRegionsLayer() {
  if (state.regionsLayer) {
    state.map.removeLayer(state.regionsLayer);
  }

  state.regionsLayer = L.geoJSON(state.regionsGeoJSON, {
    style: function(feature) {
      const regName = feature.properties.nombre_region;
      const color = REGION_COLORS[regName] || feature.properties.color || '#2563eb';
      return {
        fillColor: color,
        weight: 2,
        opacity: 0.85,
        color: color,
        dashArray: '3',
        fillOpacity: 0.2
      };
    },
    onEachFeature: function(feature, layer) {
      const props = feature.properties;
      const regColor = REGION_COLORS[props.nombre_region] || props.color || '#2563eb';
      const count = (state.stats?.conteo_regiones && state.stats.conteo_regiones[props.nombre_region]) || 0;
      
      layer.bindTooltip(`
        <div style="font-weight:700; color:#ffffff; font-size:13px; margin-bottom:2px;"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${regColor}; margin-right:6px; vertical-align:middle;"></span>Región ${props.nombre_region}</div>
        <div style="font-size:12px; color:#38bdf8; font-weight:600;">${count} fotos geolocalizadas</div>
        <div style="font-size:11px; color:#e2e8f0; margin-top:4px;">Departamentos: ${props.departamentos.slice(0, 4).join(', ')}${props.departamentos.length > 4 ? '...' : ''}</div>
      `, { sticky: true, className: 'region-tooltip' });

      layer.on({
        mouseover: function(e) {
          const l = e.target;
          l.setStyle({
            weight: 3,
            fillOpacity: 0.35
          });
          l.bringToFront();
        },
        mouseout: function(e) {
          state.regionsLayer.resetStyle(e.target);
        },
        click: function(e) {
          const chip = document.querySelector(`.chip-btn[data-region="${props.nombre_region}"]`);
          if (chip) chip.click();
        }
      });
    }
  });

  if (state.showRegionsLayer) {
    state.regionsLayer.addTo(state.map);
  }
}

/**
 * Render Departments Polygons Layer (Lazy loaded)
 */
function renderDepartmentsLayer() {
  if (state.departmentsLayer) {
    state.map.removeLayer(state.departmentsLayer);
  }

  state.departmentsLayer = L.geoJSON(state.departmentsGeoJSON, {
    style: function(feature) {
      return {
        fillColor: '#64748b',
        weight: 1.5,
        opacity: 0.7,
        color: '#94a3b8',
        fillOpacity: 0.08
      };
    },
    onEachFeature: function(feature, layer) {
      const props = feature.properties;
      const count = (state.stats?.conteo_departamentos && state.stats.conteo_departamentos[props.nombre_formato]) || 0;

      layer.bindTooltip(`
        <div style="font-weight:700; color:#ffffff; font-size:12px;">${props.nombre_formato}</div>
        <div style="font-size:11px; color:#38bdf8; margin-top:2px;">Región ${props.region} &bull; ${count} fotos</div>
      `, { sticky: true, className: 'dept-tooltip' });

      layer.on({
        mouseover: function(e) {
          e.target.setStyle({ weight: 2.5, color: '#38bdf8', fillOpacity: 0.25 });
        },
        mouseout: function(e) {
          state.departmentsLayer.resetStyle(e.target);
        },
        click: function(e) {
          const select = document.getElementById('filter-department');
          if (select) {
            select.value = props.nombre_formato;
            select.dispatchEvent(new Event('change'));
          }
        }
      });
    }
  });

  if (state.showDepartmentsLayer) {
    state.departmentsLayer.addTo(state.map);
  }
}

/**
 * Create custom colored Leaflet icon based on region
 */
function createMarkerIcon(regionName) {
  const color = REGION_COLORS[regionName] || '#10b981';
  return L.divIcon({
    className: 'custom-photo-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 6px rgba(0,0,0,0.5), 0 0 10px ${color}80;
        cursor: pointer;
        transition: transform 0.2s ease;
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

/**
 * Build rich interactive popup HTML
 */
function createPopupContent(props) {
  const safeTitle = escapeHTML(props.nombre || 'Foto Wiki Loves Earth');
  const safeAuthor = escapeHTML(props.autor || 'Anónimo');
  const safeDesc = escapeHTML(props.desc || 'Sin descripción disponible');
  const safeDept = escapeHTML(props.departamento || 'Colombia');
  const safeRegion = escapeHTML(props.region || 'Natural');
  const regColor = REGION_COLORS[props.region] || '#10b981';
  const thumbUrl = props.thumb_url || props.img_url;

  return `
    <div class="popup-card">
      <div class="popup-img-wrapper" onclick="openLightboxById(${props.id})">
        <img 
          src="${thumbUrl}" 
          alt="${safeTitle}" 
          loading="lazy" 
          decoding="async"
          onerror="this.onerror=null; this.src='${props.img_url}';" 
        />
        <div class="popup-badge-region">
          <span class="dot-indicator" style="background:${regColor};"></span>
          <span>${safeRegion} &bull; ${safeDept}</span>
        </div>
      </div>
      <div class="popup-body">
        <div class="popup-title">${safeTitle}</div>
        <div class="popup-desc">${safeDesc}</div>
        <div class="popup-meta">
          <div class="popup-meta-item">
            <i class="fa-solid fa-user"></i>
            <a href="https://commons.wikimedia.org/wiki/User:${encodeURIComponent(props.autor || '')}" target="_blank" rel="noopener noreferrer" class="author-user-link" title="Ver perfil de ${safeAuthor} en Wikimedia Commons">
              <strong>${safeAuthor}</strong>
            </a>
          </div>
          <div class="popup-meta-item">
            <i class="fa-solid fa-calendar-day"></i>
            <span>${props.fecha || '2026'}</span>
          </div>
        </div>
        <div class="popup-actions">
          <button class="btn-popup btn-popup-primary" onclick="openLightboxById(${props.id})">
            <i class="fa-solid fa-eye"></i> Ver Foto
          </button>
          <a class="btn-popup btn-popup-outline" href="${props.commons_url}" target="_blank" rel="noopener noreferrer">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Commons
          </a>
          <a class="btn-popup btn-popup-outline" href="${props.map_url}" target="_blank" rel="noopener noreferrer">
            <i class="fa-solid fa-location-dot"></i> Maps
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Update and filter markers on the map
 */
function updateMapMarkers() {
  state.clusterGroup.clearLayers();

  const markers = [];
  const bounds = L.latLngBounds();

  // Actualizar markers únicamente con fotos que disponen de coordenadas válidas
  state.filteredPoints.forEach(feature => {
    const coords = feature.geometry.coordinates; // [lng, lat]
    const latLng = [coords[1], coords[0]];
    const props = feature.properties;

    const marker = L.marker(latLng, {
      icon: createMarkerIcon(props.region)
    });

    marker.bindPopup(() => createPopupContent(props), {
      maxWidth: 340,
      className: 'custom-photo-popup'
    });

    markers.push(marker);
    bounds.extend(latLng);
  });

  state.clusterGroup.addLayers(markers);

  // Manejo de aviso flotante cuando no hay puntos en el mapa pero sí fotos sin GPS
  const mapContainer = document.getElementById('map-container');
  let noGpsNotice = document.getElementById('map-no-gps-notice');

  if (state.filteredPoints.length === 0 && state.filteredPhotos.length > 0) {
    if (!noGpsNotice) {
      noGpsNotice = document.createElement('div');
      noGpsNotice.id = 'map-no-gps-notice';
      noGpsNotice.className = 'map-no-gps-notice';
      mapContainer.appendChild(noGpsNotice);
    }
    noGpsNotice.innerHTML = `<i class="fa-solid fa-location-crosshairs-slash"></i> Mostrando ${state.filteredPhotos.length.toLocaleString()} fotos sin coordenadas GPS en la galería lateral`;
    noGpsNotice.style.display = 'flex';
  } else if (noGpsNotice) {
    noGpsNotice.style.display = 'none';
  }

  // Centrar mapa según selección
  if (markers.length > 0 && bounds.isValid()) {
    if (state.activeRegion !== 'all' || state.activeDepartment !== 'all' || state.activeAuthor !== 'all') {
      state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    } else if (state.searchQuery.trim() !== '') {
      state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }
}

/**
 * Dynamic Faceted Filtering Engine
 * Filtra en tiempo real fotos CON y SIN ubicación para el sidebar y mapa
 */
function updateFilters(sourceEvent = null) {
  const query = state.searchQuery.toLowerCase().trim();

  // Helper de búsqueda textual en título, descripción, autor, departamento y región
  function matchesText(item) {
    if (!query) return true;
    const tTitle = (item.nombre || '').toLowerCase();
    const tDesc = (item.desc || '').toLowerCase();
    const tAuthor = (item.autor || '').toLowerCase();
    const tDept = (item.departamento || '').toLowerCase();
    const tRegion = (item.region || '').toLowerCase();
    return tTitle.includes(query) || tDesc.includes(query) || tAuthor.includes(query) || tDept.includes(query) || tRegion.includes(query);
  }

  // Resetear paginación de galería
  state.galleryPage = 1;

  // 1. Filtrar la totalidad de fotografías (con y sin GPS)
  state.filteredPhotos = state.allPhotos.filter(photo => {
    // Filtro por región o "Sin Región" (fotos sin GPS)
    if (state.activeRegion !== 'all') {
      if (state.activeRegion === 'Sin Región') {
        if (photo.has_gps && photo.region !== 'Sin Región') return false;
      } else if (photo.region !== state.activeRegion) {
        return false;
      }
    }

    // Filtro por departamento o "Sin GPS"
    if (state.activeDepartment !== 'all') {
      if (state.activeDepartment === 'Sin GPS') {
        if (photo.has_gps && photo.departamento !== 'Sin GPS') return false;
      } else if (photo.departamento !== state.activeDepartment) {
        return false;
      }
    }

    // Filtro por autor
    if (state.activeAuthor !== 'all' && photo.autor !== state.activeAuthor) {
      return false;
    }

    return matchesText(photo);
  });

  // 2. Extraer puntos para el mapa de las fotos filtradas que sí tienen coordenadas GPS
  state.filteredPoints = state.filteredPhotos
    .filter(p => p.has_gps && p.lat != null && p.lng != null)
    .map(p => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat]
      },
      properties: p
    }));

  // 3. Conteos dinámicos facetados para REGIONES (incluye "Sin Región" / Sin GPS)
  const regionFacetCounts = {
    'Andina': 0, 'Caribe': 0, 'Pacífica': 0, 'Orinoquía': 0, 'Amazonía': 0, 'Insular': 0, 'Sin Región': 0
  };
  let totalForRegions = 0;

  state.allPhotos.forEach(p => {
    if (state.activeDepartment !== 'all') {
      if (state.activeDepartment === 'Sin GPS') {
        if (p.has_gps && p.departamento !== 'Sin GPS') return;
      } else if (p.departamento !== state.activeDepartment) {
        return;
      }
    }
    if (state.activeAuthor !== 'all' && p.autor !== state.activeAuthor) return;
    if (!matchesText(p)) return;

    totalForRegions++;
    const regKey = p.region && regionFacetCounts[p.region] !== undefined ? p.region : 'Sin Región';
    regionFacetCounts[regKey] = (regionFacetCounts[regKey] || 0) + 1;
  });

  // Actualizar botones / chips de regiones
  const chips = document.querySelectorAll('.chip-btn');
  chips.forEach(chip => {
    const reg = chip.dataset.region;
    const countSpan = chip.querySelector('.chip-count');
    if (reg === 'all') {
      if (countSpan) countSpan.innerText = `(${totalForRegions.toLocaleString()})`;
      chip.classList.toggle('active', state.activeRegion === 'all');
    } else {
      const count = regionFacetCounts[reg] || 0;
      if (countSpan) countSpan.innerText = `(${count.toLocaleString()})`;
      chip.classList.toggle('active', state.activeRegion === reg);
      chip.classList.toggle('disabled', count === 0 && state.activeRegion !== reg);
    }
  });

  // 4. Conteos dinámicos facetados para DEPARTAMENTOS
  const deptFacetCounts = {};
  let totalForDepts = 0;

  state.allPhotos.forEach(p => {
    if (state.activeRegion !== 'all') {
      if (state.activeRegion === 'Sin Región') {
        if (p.has_gps && p.region !== 'Sin Región') return;
      } else if (p.region !== state.activeRegion) {
        return;
      }
    }
    if (state.activeAuthor !== 'all' && p.autor !== state.activeAuthor) return;
    if (!matchesText(p)) return;

    totalForDepts++;
    const dpt = p.departamento || 'Sin GPS';
    deptFacetCounts[dpt] = (deptFacetCounts[dpt] || 0) + 1;
  });

  // Actualizar dropdown de departamentos
  if (sourceEvent !== 'department') {
    const deptSelect = document.getElementById('filter-department');
    const currentVal = state.activeDepartment;
    deptSelect.options.length = 0;

    const defaultDeptOpt = document.createElement('option');
    defaultDeptOpt.value = 'all';
    defaultDeptOpt.textContent = `Todos los Departamentos (${totalForDepts.toLocaleString()})`;
    if (currentVal === 'all') defaultDeptOpt.selected = true;
    deptSelect.appendChild(defaultDeptOpt);

    // Opción explícita de fotos sin GPS si existen fotos coincidentes
    const sinGpsCount = deptFacetCounts['Sin GPS'] || 0;
    if (sinGpsCount > 0) {
      const sinGpsOpt = document.createElement('option');
      sinGpsOpt.value = 'Sin GPS';
      sinGpsOpt.textContent = `📍 Sin Coordenadas GPS (${sinGpsCount.toLocaleString()})`;
      if (currentVal === 'Sin GPS') sinGpsOpt.selected = true;
      deptSelect.appendChild(sinGpsOpt);
    }

    const sortedDepts = Object.entries(deptFacetCounts)
      .filter(([dept]) => dept !== 'Sin GPS' && dept !== 'Desconocido')
      .sort((a, b) => b[1] - a[1]);

    let stillValid = currentVal === 'all' || (currentVal === 'Sin GPS' && sinGpsCount > 0);

    sortedDepts.forEach(([dept, count]) => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = `${dept} (${count.toLocaleString()})`;
      if (dept === currentVal) {
        opt.selected = true;
        stillValid = true;
      }
      deptSelect.appendChild(opt);
    });

    if (!stillValid && currentVal !== 'all') {
      state.activeDepartment = 'all';
      defaultDeptOpt.selected = true;
    }
  }

  // 5. Conteos dinámicos facetados para AUTORES
  const authorFacetCounts = {};
  let totalMatchingPhotos = 0;

  state.allPhotos.forEach(p => {
    if (state.activeRegion !== 'all') {
      if (state.activeRegion === 'Sin Región') {
        if (p.has_gps && p.region !== 'Sin Región') return;
      } else if (p.region !== state.activeRegion) {
        return;
      }
    }
    if (state.activeDepartment !== 'all') {
      if (state.activeDepartment === 'Sin GPS') {
        if (p.has_gps && p.departamento !== 'Sin GPS') return;
      } else if (p.departamento !== state.activeDepartment) {
        return;
      }
    }
    if (!matchesText(p)) return;

    totalMatchingPhotos++;
    const autor = p.autor;
    if (autor) {
      authorFacetCounts[autor] = (authorFacetCounts[autor] || 0) + 1;
    }
  });

  // Actualizar dropdown de autores
  if (sourceEvent !== 'author') {
    const authorSelect = document.getElementById('filter-author');
    const currentVal = state.activeAuthor;
    authorSelect.options.length = 0;

    const defaultAuthorOpt = document.createElement('option');
    defaultAuthorOpt.value = 'all';
    defaultAuthorOpt.textContent = `Todos los Fotógrafos (${totalMatchingPhotos.toLocaleString()})`;
    if (currentVal === 'all') defaultAuthorOpt.selected = true;
    authorSelect.appendChild(defaultAuthorOpt);

    const sortedAuthors = Object.entries(authorFacetCounts).sort((a, b) => b[1] - a[1]);
    let stillValid = currentVal === 'all';

    sortedAuthors.forEach(([author, count]) => {
      const opt = document.createElement('option');
      opt.value = author;
      opt.textContent = `${author} (${count.toLocaleString()})`;
      if (author === currentVal) {
        opt.selected = true;
        stillValid = true;
      }
      authorSelect.appendChild(opt);
    });

    if (!stillValid && currentVal !== 'all') {
      state.activeAuthor = 'all';
      defaultAuthorOpt.selected = true;
    }
  }

  // Actualizar mapa, galería y etiquetas
  updateMapMarkers();
  renderGalleryPreview();
  updateFilteredCountBadge();
  updateExportBadge();
}

function updateExportBadge() {
  const exportBadge = document.getElementById('export-count-badge');
  if (exportBadge) {
    exportBadge.innerText = state.filteredPhotos.length.toLocaleString();
  }
}

/**
 * Render Quick Stats Bar in Sidebar
 */
function renderStatsSummary() {
  if (!state.stats) return;
  document.getElementById('stat-total-photos').innerText = state.stats.total_fotos.toLocaleString();
  document.getElementById('stat-gps-photos').innerText = state.stats.fotos_con_gps.toLocaleString();
  document.getElementById('stat-authors').innerText = state.stats.total_autores.toLocaleString();
}

/**
 * Initial population of filter dropdowns
 */
function populateFilterDropdowns() {
  updateFilters(null);
}

/**
 * Render sidebar gallery thumbnails with pagination
 * Muestra tanto fotos con GPS como fotos sin GPS
 */
function renderGalleryPreview() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';

  const photos = state.filteredPhotos;
  const countToShow = state.galleryPage * state.galleryPageSize;
  const photosToShow = photos.slice(0, countToShow);

  if (photosToShow.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#9ca3af; padding:20px; font-size:12px;">No hay fotos que coincidan con los filtros seleccionados.</div>';
    return;
  }

  photosToShow.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.title = `${photo.nombre} - ${photo.autor}` + (photo.has_gps ? '' : ' (Sin ubicación GPS)');

    card.onclick = () => {
      if (photo.has_gps && photo.lat != null && photo.lng != null) {
        state.map.flyTo([photo.lat, photo.lng], 14, { duration: 1 });
        setTimeout(() => {
          openLightboxById(photo.id);
        }, 450);
      } else {
        openLightboxById(photo.id);
      }
    };

    const thumb = photo.thumb_url || photo.img_url;
    const noGpsBadge = !photo.has_gps 
      ? '<span class="card-badge-no-gps" title="Foto sin coordenadas GPS"><i class="fa-solid fa-location-crosshairs-slash"></i> Sin GPS</span>' 
      : '';

    card.innerHTML = `
      ${noGpsBadge}
      <img src="${thumb}" alt="${escapeHTML(photo.nombre)}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${photo.img_url}';" />
      <div class="card-caption">${escapeHTML(photo.nombre)}</div>
    `;
    grid.appendChild(card);
  });

  // Botón para cargar más fotos de manera progresiva
  if (photos.length > countToShow) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'gallery-load-more';
    loadMoreBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Cargar más fotos (${(photos.length - countToShow).toLocaleString()} restantes)`;
    loadMoreBtn.onclick = () => {
      state.galleryPage++;
      renderGalleryPreview();
    };
    grid.appendChild(loadMoreBtn);
  }
}

function updateFilteredCountBadge() {
  const badge = document.getElementById('filtered-count-badge');
  if (badge) {
    if (state.filteredPhotos.length === state.filteredPoints.length) {
      badge.innerText = `${state.filteredPhotos.length.toLocaleString()} fotos`;
    } else {
      badge.innerText = `${state.filteredPhotos.length.toLocaleString()} fotos (${state.filteredPoints.length.toLocaleString()} en mapa)`;
    }
  }
}

/**
 * Setup UI Event Listeners
 */
function setupEventListeners() {
  // Region chips
  const chips = document.querySelectorAll('.chip-btn');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (chip.classList.contains('disabled')) return;

      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      state.activeRegion = chip.dataset.region;

      // Resaltar polígono si es una región geográfica válida
      if (state.activeRegion !== 'all' && state.activeRegion !== 'Sin Región' && state.regionsGeoJSON) {
        const regionFeature = state.regionsGeoJSON.features.find(
          f => f.properties.nombre_region === state.activeRegion
        );
        if (regionFeature) {
          const bboxLayer = L.geoJSON(regionFeature);
          state.map.fitBounds(bboxLayer.getBounds(), { padding: [40, 40] });
        }
      } else if (state.activeRegion === 'all') {
        state.map.setView([4.570868, -74.297333], 6);
      }

      updateFilters('region');
    });
  });

  // Department Select
  const deptSelect = document.getElementById('filter-department');
  deptSelect.addEventListener('change', (e) => {
    state.activeDepartment = e.target.value;
    updateFilters('department');
  });

  // Author Select
  const authorSelect = document.getElementById('filter-author');
  authorSelect.addEventListener('change', (e) => {
    state.activeAuthor = e.target.value;
    updateFilters('author');
  });

  // Search input con debounce
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search-btn');

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearBtn.style.display = state.searchQuery ? 'block' : 'none';

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateFilters('search');
    }, 200);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.style.display = 'none';
    updateFilters('search');
  });

  // Toggle de capas con carga diferida (lazy load de departamentos)
  const toggleRegionsBtn = document.getElementById('toggle-regions-layer');
  const toggleDeptsBtn = document.getElementById('toggle-depts-layer');

  toggleRegionsBtn.addEventListener('click', () => {
    state.showRegionsLayer = !state.showRegionsLayer;
    if (state.showRegionsLayer) {
      state.showDepartmentsLayer = false;
      toggleDeptsBtn.classList.remove('active');
      if (state.departmentsLayer && state.map.hasLayer(state.departmentsLayer)) {
        state.map.removeLayer(state.departmentsLayer);
      }
      if (state.regionsLayer) {
        state.regionsLayer.addTo(state.map);
      }
    } else {
      if (state.regionsLayer && state.map.hasLayer(state.regionsLayer)) {
        state.map.removeLayer(state.regionsLayer);
      }
    }
    toggleRegionsBtn.classList.toggle('active', state.showRegionsLayer);
  });

  toggleDeptsBtn.addEventListener('click', async () => {
    state.showDepartmentsLayer = !state.showDepartmentsLayer;
    if (state.showDepartmentsLayer) {
      state.showRegionsLayer = false;
      toggleRegionsBtn.classList.remove('active');
      if (state.regionsLayer && state.map.hasLayer(state.regionsLayer)) {
        state.map.removeLayer(state.regionsLayer);
      }
      if (!state.departmentsGeoJSON) {
        showLoading(true);
        try {
          state.departmentsGeoJSON = await fetch('data/colombia_departamentos.geojson').then(r => r.json());
          renderDepartmentsLayer();
        } catch (err) {
          console.error('Error al cargar departamentos:', err);
        } finally {
          showLoading(false);
        }
      } else if (state.departmentsLayer) {
        state.departmentsLayer.addTo(state.map);
      }
    } else {
      if (state.departmentsLayer && state.map.hasLayer(state.departmentsLayer)) {
        state.map.removeLayer(state.departmentsLayer);
      }
    }
    toggleDeptsBtn.classList.toggle('active', state.showDepartmentsLayer);
  });

  // Reset Filters Button
  document.getElementById('reset-filters-btn').addEventListener('click', resetAllFilters);

  // Export to Excel Button
  const exportBtn = document.getElementById('export-excel-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToExcel);
  }

  // Recenter Map Button
  document.getElementById('recenter-btn').addEventListener('click', () => {
    state.map.setView([4.570868, -74.297333], 6);
  });

  // Mobile sidebar handlers
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarClose = document.getElementById('sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');

  function openMobileSidebar() {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('sidebar-open');
  }

  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }

  if (mobileToggle) mobileToggle.addEventListener('click', openMobileSidebar);
  if (sidebarClose) sidebarClose.addEventListener('click', closeMobileSidebar);
  if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);

  // Lightbox keyboard navigation
  document.addEventListener('keydown', (e) => {
    const dialog = document.getElementById('lightbox-dialog');
    if (!dialog.open) return;

    if (e.key === 'ArrowRight') navigateLightbox(1);
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'Escape') dialog.close();
  });
}

/**
 * Reset all filters to default
 */
function resetAllFilters() {
  state.activeRegion = 'all';
  state.activeDepartment = 'all';
  state.activeAuthor = 'all';
  state.searchQuery = '';

  document.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active'));
  document.querySelector('.chip-btn[data-region="all"]').classList.add('active');
  document.getElementById('filter-department').value = 'all';
  document.getElementById('filter-author').value = 'all';
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search-btn').style.display = 'none';

  state.map.setView([4.570868, -74.297333], 6);
  updateFilters();
}

/**
 * Export filtered search results to Excel (.xlsx)
 * Incluye todas las fotos filtradas con indicación de coordenadas
 */
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Cargando la librería de exportación a Excel. Intenta de nuevo en unos segundos.');
    return;
  }

  const items = state.filteredPhotos;

  if (!items || items.length === 0) {
    alert('No hay registros coincidentes con los filtros actuales para exportar.');
    return;
  }

  const rows = items.map(item => {
    let gpsVal = item.gps_raw || '';
    if (!gpsVal && item.has_gps && item.lat && item.lng) {
      gpsVal = `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`;
    } else if (!gpsVal || !item.has_gps) {
      gpsVal = 'Sin coordenadas GPS';
    }

    let mapLink = item.map_url || '';
    if (!mapLink && item.has_gps && item.lat && item.lng) {
      mapLink = `https://maps.google.com/?q=${item.lat},${item.lng}`;
    }

    return {
      'Usuario / Autor': item.autor || '',
      'Nombre de Archivo': item.nombre || '',
      'Fecha Subida (Hora Colombia COT)': item.fecha || '',
      'Descripción (Español)': item.desc || '',
      'Ubicación GPS': gpsVal,
      'Ver en Mapa': mapLink,
      'Enlace Directo Imagen': item.img_url || '',
      'Página Wikimedia Commons': item.commons_url || '',
      'Vista Previa': item.thumb_url || item.img_url || '',
      'Departamento': item.departamento || '',
      'Región Natural': item.region || ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 20 },
    { wch: 36 },
    { wch: 24 },
    { wch: 50 },
    { wch: 25 },
    { wch: 35 },
    { wch: 45 },
    { wch: 45 },
    { wch: 45 },
    { wch: 22 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Imágenes WLE Colombia 2026');

  const dateStr = new Date().toISOString().slice(0, 10);
  let filterPart = 'todas';
  if (state.activeRegion !== 'all') {
    filterPart = `region_${state.activeRegion.toLowerCase()}`;
  } else if (state.activeDepartment !== 'all') {
    filterPart = `dpto_${state.activeDepartment.toLowerCase().replace(/\s+/g, '_')}`;
  } else if (state.activeAuthor !== 'all') {
    filterPart = `autor_${state.activeAuthor.toLowerCase().replace(/\s+/g, '_')}`;
  }
  if (state.searchQuery) {
    filterPart += `_busqueda`;
  }

  const filename = `wle_2026_colombia_${filterPart}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Open Native Lightbox Modal by Photo ID
 * Funciona para cualquier foto (con o sin coordenadas GPS)
 */
window.openLightboxById = function(id) {
  const index = state.filteredPhotos.findIndex(p => p.id === id);
  if (index !== -1) {
    state.currentLightboxIndex = index;
    renderLightboxContent();
    const dialog = document.getElementById('lightbox-dialog');
    dialog.showModal();
  }
};

/**
 * Render Lightbox Details
 */
function renderLightboxContent() {
  if (state.currentLightboxIndex < 0 || state.currentLightboxIndex >= state.filteredPhotos.length) return;

  const photo = state.filteredPhotos[state.currentLightboxIndex];

  document.getElementById('lightbox-title').innerText = photo.nombre;
  document.getElementById('lightbox-img').src = photo.img_url;

  const authorElem = document.getElementById('lightbox-author');
  if (authorElem) {
    const userCommonsUrl = `https://commons.wikimedia.org/wiki/User:${encodeURIComponent(photo.autor || '')}`;
    authorElem.innerHTML = `<a href="${userCommonsUrl}" target="_blank" rel="noopener noreferrer" class="author-user-link" title="Ver perfil de ${escapeHTML(photo.autor || '')} en Wikimedia Commons"><strong>${escapeHTML(photo.autor || 'Anónimo')}</strong> <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.75rem; margin-left:4px;"></i></a>`;
  }

  document.getElementById('lightbox-date').innerText = photo.fecha || 'Sin fecha';
  document.getElementById('lightbox-desc').innerText = photo.desc || 'Sin descripción disponible';

  // Manejo de ubicación para fotos con y sin GPS
  const mapsLink = document.getElementById('lightbox-maps-link');
  if (photo.has_gps && photo.lat != null && photo.lng != null) {
    document.getElementById('lightbox-location').innerText = `${photo.departamento}, Región ${photo.region}`;
    document.getElementById('lightbox-coords').innerText = `${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)}`;
    mapsLink.href = photo.map_url || `https://maps.google.com/?q=${photo.lat},${photo.lng}`;
    mapsLink.style.display = 'inline-flex';
  } else {
    document.getElementById('lightbox-location').innerText = 'Sin ubicación GPS registrada en metadatos';
    document.getElementById('lightbox-coords').innerText = 'No disponibles';
    mapsLink.style.display = 'none';
  }

  document.getElementById('lightbox-commons-link').href = photo.commons_url;
  document.getElementById('lightbox-download-link').href = photo.img_url;
  document.getElementById('lightbox-counter').innerText = `${state.currentLightboxIndex + 1} de ${state.filteredPhotos.length.toLocaleString()}`;
}

/**
 * Navigate through photos in Lightbox
 */
window.navigateLightbox = function(step) {
  const newIndex = state.currentLightboxIndex + step;
  if (newIndex >= 0 && newIndex < state.filteredPhotos.length) {
    state.currentLightboxIndex = newIndex;
    renderLightboxContent();
  }
};

window.closeLightbox = function() {
  document.getElementById('lightbox-dialog').close();
};

function showLoading(show) {
  const loader = document.getElementById('map-loader');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
