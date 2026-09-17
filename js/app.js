/**
 * Wiki Loves Earth Colombia 2026 - Interactive Map & Photo Explorer
 * Modern Vanilla JS implementation with Leaflet & MarkerCluster
 */

// Global State
const state = {
  map: null,
  allPoints: [],
  filteredPoints: [],
  allPhotos: [],
  filteredPhotos: [],
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
  stats: null
};

// Region color palette
const REGION_COLORS = {
  'Andina': '#2563eb',
  'Caribe': '#0891b2',
  'Pacífica': '#059669',
  'Orinoquía': '#d97706',
  'Amazonía': '#15803d',
  'Insular': '#7c3aed'
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
  // Colombia geographical center coordinates
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

  // Recenter Colombia Control stacked cleanly by Leaflet in topleft, preventing any overlap
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

  // 100% Free / Open Source Tile Layers (Zero commercial watermarks, Wikimedia Foundation compliant)
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

  // Layer control for Basemaps (All 100% OSS / Free Culture)
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
 * Load GeoJSON data files
 */
async function loadData() {
  try {
    showLoading(true);

    // If served by PHP with embedded data, load directly without static fetch
    if (window.PHP_INITIAL_DATA) {
      state.allPoints = window.PHP_INITIAL_DATA.puntos?.features || [];
      state.filteredPoints = [...state.allPoints];
      state.allPhotos = window.PHP_INITIAL_DATA.fotos || [];
      state.filteredPhotos = [...state.allPhotos];
      state.regionsGeoJSON = window.PHP_INITIAL_DATA.regiones;
      state.departmentsGeoJSON = window.PHP_INITIAL_DATA.departamentos;
      state.stats = window.PHP_INITIAL_DATA.stats;

      renderStatsSummary();
      renderRegionsLayer();
      renderDepartmentsLayer();
      showLoading(false);
      return;
    }

    const [puntosRes, fotosRes, regionesRes, deptsRes, statsRes] = await Promise.all([
      fetch('data/wle_colombia_puntos.geojson').then(r => r.json()),
      fetch('data/wle_colombia_fotos.json').then(r => r.json()),
      fetch('data/colombia_regiones.geojson').then(r => r.json()),
      fetch('data/colombia_departamentos.geojson').then(r => r.json()),
      fetch('data/wle_colombia_stats.json').then(r => r.json())
    ]);

    state.allPoints = puntosRes.features || [];
    state.filteredPoints = [...state.allPoints];
    state.allPhotos = fotosRes || [];
    state.filteredPhotos = [...state.allPhotos];
    state.regionsGeoJSON = regionesRes;
    state.departmentsGeoJSON = deptsRes;
    state.stats = statsRes;

    renderStatsSummary();
    renderRegionsLayer();
    renderDepartmentsLayer();

    showLoading(false);
  } catch (error) {
    console.error('Error cargando datos:', error);
    showLoading(false);
    alert('Error cargando datos del mapa. Asegúrate de ejecutar el servidor local.');
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
      const color = feature.properties.color || '#3b82f6';
      return {
        fillColor: color,
        weight: 2,
        opacity: 0.8,
        color: color,
        dashArray: '3',
        fillOpacity: 0.15
      };
    },
    onEachFeature: function(feature, layer) {
      const props = feature.properties;
      const count = (state.stats?.conteo_regiones && state.stats.conteo_regiones[props.nombre_region]) || 0;
      
      layer.bindTooltip(`
        <div style="font-weight:700; color:#ffffff; font-size:13px; margin-bottom:2px;"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${props.color}; margin-right:6px; vertical-align:middle;"></span>Región ${props.nombre_region}</div>
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
          // Select region filter
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
 * Render Departments Polygons Layer
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

  // Zoom to fit bounds if filtered to a specific region/dept
  if (state.activeRegion !== 'all' || state.activeDepartment !== 'all' || state.activeAuthor !== 'all') {
    if (markers.length > 0 && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  } else if (state.searchQuery.trim() !== '') {
    if (markers.length > 0 && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }
}

/**
 * Dynamic Faceted Filtering Engine
 * Cross-updates counts across Regions, Departments, and Authors dynamically.
 * @param {string|null} sourceEvent - 'region', 'department', 'author', 'search', or null
 */
function updateFilters(sourceEvent = null) {
  const query = state.searchQuery.toLowerCase().trim();

  // Helper to check if item matches text search
  function matchesText(item) {
    if (!query) return true;
    const tTitle = (item.nombre || '').toLowerCase();
    const tDesc = (item.desc || '').toLowerCase();
    const tAuthor = (item.autor || '').toLowerCase();
    const tDept = (item.departamento || '').toLowerCase();
    return tTitle.includes(query) || tDesc.includes(query) || tAuthor.includes(query) || tDept.includes(query);
  }

  // 1. Calculate matching photos across all dimensions for map & gallery
  state.filteredPoints = state.allPoints.filter(feature => {
    const p = feature.properties;
    if (state.activeRegion !== 'all' && p.region !== state.activeRegion) return false;
    if (state.activeDepartment !== 'all' && p.departamento !== state.activeDepartment) return false;
    if (state.activeAuthor !== 'all' && p.autor !== state.activeAuthor) return false;
    return matchesText(p);
  });

  state.filteredPhotos = state.allPhotos.filter(photo => {
    if (state.activeRegion !== 'all' && photo.region !== state.activeRegion) return false;
    if (state.activeDepartment !== 'all' && photo.departamento !== state.activeDepartment) return false;
    if (state.activeAuthor !== 'all' && photo.autor !== state.activeAuthor) return false;
    return matchesText(photo);
  });

  // 2. Cross-calculate dynamic facet counts for REGIONS:
  // (given activeDepartment, activeAuthor, and searchQuery)
  const regionFacetCounts = {
    'Andina': 0, 'Caribe': 0, 'Pacífica': 0, 'Orinoquía': 0, 'Amazonía': 0, 'Insular': 0
  };
  let totalForRegions = 0;

  state.allPoints.forEach(feature => {
    const p = feature.properties;
    if (state.activeDepartment !== 'all' && p.departamento !== state.activeDepartment) return;
    if (state.activeAuthor !== 'all' && p.autor !== state.activeAuthor) return;
    if (!matchesText(p)) return;

    totalForRegions++;
    if (p.region && regionFacetCounts[p.region] !== undefined) {
      regionFacetCounts[p.region]++;
    }
  });

  // Update Region Chips UI in real time
  const chips = document.querySelectorAll('.chip-btn');
  chips.forEach(chip => {
    const reg = chip.dataset.region;
    const countSpan = chip.querySelector('.chip-count');
    if (reg === 'all') {
      if (countSpan) countSpan.innerText = `(${totalForRegions})`;
      chip.classList.toggle('active', state.activeRegion === 'all');
    } else {
      const count = regionFacetCounts[reg] || 0;
      if (countSpan) countSpan.innerText = `(${count})`;
      chip.classList.toggle('active', state.activeRegion === reg);
      chip.classList.toggle('disabled', count === 0 && state.activeRegion !== reg);
    }
  });

  // 3. Cross-calculate dynamic facet counts for DEPARTMENTS:
  // (given activeRegion, activeAuthor, and searchQuery)
  const deptFacetCounts = {};
  let totalForDepts = 0;

  state.allPoints.forEach(feature => {
    const p = feature.properties;
    if (state.activeRegion !== 'all' && p.region !== state.activeRegion) return;
    if (state.activeAuthor !== 'all' && p.autor !== state.activeAuthor) return;
    if (!matchesText(p)) return;

    totalForDepts++;
    const dpt = p.departamento;
    if (dpt && dpt !== 'Sin GPS' && dpt !== 'Desconocido') {
      deptFacetCounts[dpt] = (deptFacetCounts[dpt] || 0) + 1;
    }
  });

  // Update Department Select Options dynamically
  if (sourceEvent !== 'department') {
    const deptSelect = document.getElementById('filter-department');
    const currentVal = state.activeDepartment;
    deptSelect.innerHTML = `<option value="all">Todos los Departamentos (${totalForDepts})</option>`;

    const sortedDepts = Object.entries(deptFacetCounts).sort((a, b) => b[1] - a[1]);
    let stillValid = false;

    sortedDepts.forEach(([dept, count]) => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = `${dept} (${count})`;
      if (dept === currentVal) {
        opt.selected = true;
        stillValid = true;
      }
      deptSelect.appendChild(opt);
    });

    if (!stillValid && currentVal !== 'all') {
      state.activeDepartment = 'all';
    }
  }

  // 4. Cross-calculate dynamic facet counts for AUTHORS:
  // (given activeRegion, activeDepartment, and searchQuery)
  const authorFacetCounts = {};
  let totalMatchingAuthors = 0;

  state.allPoints.forEach(feature => {
    const p = feature.properties;
    if (state.activeRegion !== 'all' && p.region !== state.activeRegion) return;
    if (state.activeDepartment !== 'all' && p.departamento !== state.activeDepartment) return;
    if (!matchesText(p)) return;

    totalMatchingAuthors++;
    const autor = p.autor;
    if (autor) {
      authorFacetCounts[autor] = (authorFacetCounts[autor] || 0) + 1;
    }
  });

  // Update Author Select Options dynamically
  if (sourceEvent !== 'author') {
    const authorSelect = document.getElementById('filter-author');
    const currentVal = state.activeAuthor;
    const authorCount = Object.keys(authorFacetCounts).length;
    authorSelect.innerHTML = `<option value="all">Todos los Fotógrafos (${authorCount})</option>`;

    const sortedAuthors = Object.entries(authorFacetCounts).sort((a, b) => b[1] - a[1]);
    let stillValid = false;

    sortedAuthors.forEach(([author, count]) => {
      const opt = document.createElement('option');
      opt.value = author;
      opt.textContent = `${author} (${count})`;
      if (author === currentVal) {
        opt.selected = true;
        stillValid = true;
      }
      authorSelect.appendChild(opt);
    });

    if (!stillValid && currentVal !== 'all') {
      state.activeAuthor = 'all';
    }
  }

  // Update Map Markers, Gallery Preview, and Badges
  updateMapMarkers();
  renderGalleryPreview();
  updateFilteredCountBadge();
  updateExportBadge();
}

function updateExportBadge() {
  const exportBadge = document.getElementById('export-count-badge');
  if (exportBadge) {
    const count = state.filteredPoints.length;
    exportBadge.innerText = count.toLocaleString();
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
  document.getElementById('stat-regions').innerText = Object.keys(state.stats.conteo_regiones || {}).length;
}

/**
 * Initial population of filter dropdowns
 */
function populateFilterDropdowns() {
  updateFilters(null);
}

/**
 * Render sidebar gallery thumbnails
 */
function renderGalleryPreview() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';

  const photosToShow = state.filteredPoints.slice(0, 18);

  if (photosToShow.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#9ca3af; padding:20px; font-size:12px;">No hay fotos que coincidan con los filtros seleccionados.</div>';
    return;
  }

  photosToShow.forEach(feature => {
    const props = feature.properties;
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.title = `${props.nombre} - ${props.autor}`;
    card.onclick = () => {
      const coords = feature.geometry.coordinates;
      state.map.flyTo([coords[1], coords[0]], 14, { duration: 1 });
      setTimeout(() => {
        openLightboxById(props.id);
      }, 500);
    };

    const thumb = props.thumb_url || props.img_url;
    card.innerHTML = `
      <img src="${thumb}" alt="${escapeHTML(props.nombre)}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${props.img_url}';" />
      <div class="card-caption">${escapeHTML(props.nombre)}</div>
    `;
    grid.appendChild(card);
  });
}

function updateFilteredCountBadge() {
  const badge = document.getElementById('filtered-count-badge');
  if (badge) {
    badge.innerText = `${state.filteredPoints.length} de ${state.allPoints.length} fotos`;
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

      // When selecting a region, highlight its polygon on the map
      if (state.activeRegion !== 'all' && state.regionsGeoJSON) {
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

  // Search input
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search-btn');

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearBtn.style.display = state.searchQuery ? 'block' : 'none';

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateFilters('search');
    }, 250);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.style.display = 'none';
    updateFilters('search');
  });

  // Layer Toggles with Mutual Exclusion (Strictly only one active at a time)
  const toggleRegionsBtn = document.getElementById('toggle-regions-layer');
  const toggleDeptsBtn = document.getElementById('toggle-depts-layer');

  toggleRegionsBtn.addEventListener('click', () => {
    state.showRegionsLayer = !state.showRegionsLayer;
    if (state.showRegionsLayer) {
      // Deactivate departments layer
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

  toggleDeptsBtn.addEventListener('click', () => {
    state.showDepartmentsLayer = !state.showDepartmentsLayer;
    if (state.showDepartmentsLayer) {
      // Deactivate regions layer
      state.showRegionsLayer = false;
      toggleRegionsBtn.classList.remove('active');
      if (state.regionsLayer && state.map.hasLayer(state.regionsLayer)) {
        state.map.removeLayer(state.regionsLayer);
      }
      if (state.departmentsLayer) {
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

  // Mobile sidebar toggle
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      mobileToggle.innerHTML = sidebar.classList.contains('open') 
        ? '<i class="fa-solid fa-xmark"></i> <span>Cerrar</span>' 
        : '<i class="fa-solid fa-filter"></i> <span>Filtros</span>';
    });
  }

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
 * Formatted with the exact columns from the original data sheet.
 */
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Cargando la librería de exportación a Excel. Intenta de nuevo en unos segundos.');
    return;
  }

  // Use the active filtered items
  const items = state.filteredPoints.length > 0
    ? state.filteredPoints.map(f => ({
        ...f.properties,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0]
      }))
    : state.filteredPhotos;

  if (!items || items.length === 0) {
    alert('No hay registros coincidentes con los filtros actuales para exportar.');
    return;
  }

  // Build rows matching exactly the requested columns
  const rows = items.map(item => {
    let gpsVal = item.gps_raw || '';
    if (!gpsVal && item.lat && item.lng) {
      gpsVal = `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`;
    }
    let mapLink = item.map_url || '';
    if (!mapLink && item.lat && item.lng) {
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

  // Auto-size columns for comfortable reading
  ws['!cols'] = [
    { wch: 20 }, // Usuario / Autor
    { wch: 36 }, // Nombre de Archivo
    { wch: 24 }, // Fecha Subida
    { wch: 50 }, // Descripción
    { wch: 25 }, // Ubicación GPS
    { wch: 35 }, // Ver en Mapa
    { wch: 45 }, // Enlace Directo Imagen
    { wch: 45 }, // Página Wikimedia Commons
    { wch: 45 }, // Vista Previa
    { wch: 22 }, // Departamento
    { wch: 18 }  // Región Natural
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Imágenes WLE Colombia 2026');

  // Build dynamic filename based on active filters
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
 */
window.openLightboxById = function(id) {
  const index = state.filteredPoints.findIndex(f => f.properties.id === id);
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
  if (state.currentLightboxIndex < 0 || state.currentLightboxIndex >= state.filteredPoints.length) return;

  const currentFeature = state.filteredPoints[state.currentLightboxIndex];
  const props = currentFeature.properties;
  const coords = currentFeature.geometry.coordinates;

  document.getElementById('lightbox-title').innerText = props.nombre;
  document.getElementById('lightbox-img').src = props.img_url;
  const authorElem = document.getElementById('lightbox-author');
  if (authorElem) {
    const userCommonsUrl = `https://commons.wikimedia.org/wiki/User:${encodeURIComponent(props.autor || '')}`;
    authorElem.innerHTML = `<a href="${userCommonsUrl}" target="_blank" rel="noopener noreferrer" class="author-user-link" title="Ver perfil de ${escapeHTML(props.autor || '')} en Wikimedia Commons"><strong>${escapeHTML(props.autor || 'Anónimo')}</strong> <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.75rem; margin-left:4px;"></i></a>`;
  }
  document.getElementById('lightbox-date').innerText = props.fecha || 'Sin fecha';
  document.getElementById('lightbox-desc').innerText = props.desc || 'Sin descripción';
  document.getElementById('lightbox-location').innerText = `${props.departamento}, Región ${props.region}`;
  document.getElementById('lightbox-coords').innerText = `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`;

  document.getElementById('lightbox-commons-link').href = props.commons_url;
  document.getElementById('lightbox-maps-link').href = props.map_url;
  document.getElementById('lightbox-download-link').href = props.img_url;

  document.getElementById('lightbox-counter').innerText = `${state.currentLightboxIndex + 1} de ${state.filteredPoints.length}`;
}

/**
 * Navigate through photos in Lightbox
 */
window.navigateLightbox = function(step) {
  const newIndex = state.currentLightboxIndex + step;
  if (newIndex >= 0 && newIndex < state.filteredPoints.length) {
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
