/*
  Google Places Autocomplete + optional Map widget.
  - Autocomplete restricted by selected country from CheckoutChamp countries.
  - On place selection, fills state, city, street (address1), and postalCode.
  - Optional map that lets user drop a marker; saves lat/lng in hidden inputs.
*/

let autocompleteInstance = null; // legacy Autocomplete fallback
let placeElementInstance = null; // new PlaceAutocompleteElement or web component
let mapInstance = null;
let markerInstance = null;
let mapsScriptLoaded = false;
let mapIdConfigured = '';

function ensureMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (mapsScriptLoaded) return resolve();
    if (!apiKey) return reject(new Error('Google Maps API key missing'));
    const existing = document.querySelector('script[data-gmaps]');
    if (existing) {
      existing.addEventListener('load', () => { mapsScriptLoaded = true; resolve(); });
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&v=weekly`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-gmaps', '1');
    script.onload = () => { mapsScriptLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function parseAddressComponents(components) {
  const hasType = (c, type) => Array.isArray(c?.types) ? c.types.includes(type) : (c?.types === type || c?.type === type);
  const get = (type) => (components || []).find(c => hasType(c, type)) || {};
  const shortText = (c) => c?.short_name || c?.shortText || '';
  const longText = (c) => c?.long_name || c?.longText || '';
  const state = shortText(get('administrative_area_level_1'));
  const city = longText(get('locality')) || longText(get('postal_town')) || longText(get('sublocality'));
  const postalCode = longText(get('postal_code'));
  const streetNumber = longText(get('street_number'));
  const route = longText(get('route'));
  const street = [route, streetNumber].filter(Boolean).join(' ');
  return { state, city, postalCode, street };
}

function fillParsedAddress(parsed) {
  if (parsed.city) document.getElementById('city').value = parsed.city;
  if (parsed.state) document.getElementById('state').value = parsed.state;
  if (parsed.postalCode) document.getElementById('postalCode').value = parsed.postalCode;
  if (parsed.street) document.getElementById('address1').value = parsed.street;
}

function onPlaceSelected(place) {
  const comps = place?.address_components || [];
  const parsed = parseAddressComponents(comps);
  fillParsedAddress(parsed);
  const loc = place?.geometry?.location;
  if (loc) {
    const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
    const latEl = document.getElementById('latitude');
    const lngEl = document.getElementById('longitude');
    if (latEl) latEl.value = String(lat);
    if (lngEl) lngEl.value = String(lng);
    if (mapInstance) {
      mapInstance.setCenter({ lat, lng });
      mapInstance.setZoom(15);
      setMarker({ lat, lng });
    }
  }
}

function initLegacyAutocomplete(google, selectedCountryCode) {
  const addressInput = document.getElementById('address1');
  if (!addressInput) return;
  const options = { componentRestrictions: selectedCountryCode ? { country: selectedCountryCode } : undefined, fields: ['address_components', 'geometry'] };
  autocompleteInstance = new google.maps.places.Autocomplete(addressInput, options);
  autocompleteInstance.addListener('place_changed', () => {
    const place = autocompleteInstance.getPlace();
    onPlaceSelected(place);
  });
}

function initPlaceAutocompleteElement(google, selectedCountryCode) {
  // Prefer new PlaceAutocompleteElement via importLibrary
  try {
    const addressInput = document.getElementById('address1');
    if (!addressInput) return false;
    // Create web component if available; otherwise use class element API
    if (typeof window !== 'undefined') {
      // Insert the web component and hide the original input
      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = '8px';
      const paeEl = document.createElement('gmp-place-autocomplete');
      paeEl.setAttribute('placeholder', addressInput.getAttribute('placeholder') || 'Start typing your address');
      paeEl.style.display = 'block';
      paeEl.style.width = '100%';
      // Restrict country and (optionally) bias to address types
      try {
        if (selectedCountryCode) paeEl.includedRegionCodes = [selectedCountryCode];
        // Use a supported primary type; fallback will remove if provider errors
        // paeEl.includedPrimaryTypes = ['street_address'];
        paeEl.includedPrimaryTypes = ['geocode'];
      } catch(_) {}
      // Insert before the hidden input
      addressInput.parentNode.insertBefore(wrapper, addressInput);
      wrapper.appendChild(paeEl);
      addressInput.style.display = 'none';

      paeEl.addEventListener('gmp-select', async (e) => {
        try {
          const prediction = e?.detail?.placePrediction || e?.placePrediction;
          if (prediction && typeof prediction.toPlace === 'function') {
            const place = prediction.toPlace();
            await place.fetchFields({ fields: ['addressComponents','location'] });
            // Normalize for downstream parser
            onPlaceSelected({
              address_components: place.addressComponents,
              geometry: { location: { lat: place.location?.lat, lng: place.location?.lng } }
            });
          }
        } catch (_) { /* swallow */ }
      });
      paeEl.addEventListener('gmp-error', (ev) => {
        try {
          const msg = String(ev?.detail?.error || ev?.error || '');
          if (msg.includes('Invalid included_primary_types')) {
            // Remove restriction if provider rejects the type list
            paeEl.includedPrimaryTypes = undefined;
          }
        } catch(_) {}
        // eslint-disable-next-line no-console
        console.error('PlaceAutocompleteElement error', ev?.detail || ev);
      });

      placeElementInstance = paeEl;
      return true;
    }
  } catch (_) {
    // ignore and fallback to legacy
  }
  return false;
}

function updateAutocompleteCountry(google, countryCode) {
  const code = countryCode || undefined;
  if (placeElementInstance) {
    try { placeElementInstance.includedRegionCodes = code ? [code] : undefined; } catch(_) {}
  }
  if (autocompleteInstance && autocompleteInstance.setComponentRestrictions) {
    const options = { componentRestrictions: code ? { country: code } : undefined };
    autocompleteInstance.setComponentRestrictions(options.componentRestrictions);
  }
}

function initMap(google, providedMapId) {
  const container = document.getElementById('mapContainer');
  const mapDiv = document.getElementById('map');
  if (!container || !mapDiv) return;
  container.style.display = '';
  const center = { lat: 37.7749, lng: -122.4194 };
  const attrMapId = mapDiv?.dataset?.mapId || mapDiv?.getAttribute('data-map-id') || '';
  const chosenMapId = providedMapId || attrMapId || '';
  mapIdConfigured = chosenMapId;
  const options = { center, zoom: 10, disableDefaultUI: true };
  if (chosenMapId) options.mapId = chosenMapId;
  mapInstance = new google.maps.Map(mapDiv, options);
  mapInstance.addListener('click', (e) => {
    const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setMarker(latLng);
    const latEl = document.getElementById('latitude');
    const lngEl = document.getElementById('longitude');
    if (latEl) latEl.value = latLng.lat.toString();
    if (lngEl) lngEl.value = latLng.lng.toString();
  });
}

function setMarker(position) {
  if (!mapInstance) return;
  if (markerInstance) {
    if (typeof markerInstance.setMap === 'function') {
      markerInstance.setMap(null);
    } else {
      try { markerInstance.map = null; } catch(_) {}
    }
    markerInstance = null;
  }
  try {
    const AdvancedMarkerElement = google?.maps?.marker?.AdvancedMarkerElement;
    if (AdvancedMarkerElement && mapIdConfigured) {
      markerInstance = new AdvancedMarkerElement({ map: mapInstance, position });
    } else {
      markerInstance = new google.maps.Marker({ map: mapInstance, position });
    }
  } catch (_) {
    markerInstance = new google.maps.Marker({ map: mapInstance, position });
  }
}

async function setupAddressAutocomplete({ countrySelectId = 'country', enableMap = true } = {}) {
  // Fetch API key from server
  const keyRes = await fetch('/api/maps-key');
  const keyData = await keyRes.json();
  const apiKey = keyData?.message?.key;
  const mapIdFromApi = keyData?.message?.mapId;
  const selectedCountryCode = document.getElementById(countrySelectId)?.value;
  if (!apiKey) return; // gracefully skip maps
  await ensureMapsScript(apiKey);
  const google = window.google;
  // Ensure places library is loaded (new loader)
  if (google?.maps?.importLibrary) {
    try { await google.maps.importLibrary('places'); } catch(_) {}
    if (enableMap) {
      try { await google.maps.importLibrary('marker'); } catch(_) {}
    }
  }
  // Try new PlaceAutocompleteElement first, fallback to legacy Autocomplete
  const initializedNew = initPlaceAutocompleteElement(google, selectedCountryCode);
  if (!initializedNew) {
    initLegacyAutocomplete(google, selectedCountryCode);
  }
  if (enableMap) initMap(google, mapIdFromApi);

  const countrySelect = document.getElementById(countrySelectId);
  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      const code = countrySelect.value;
      updateAutocompleteCountry(google, code);
    });
  }
}

export { setupAddressAutocomplete };


