/* ═══════════════════════════════════════════════════════════════
   Travel Planner — app.js
   Handles: Nav, Destinations, Currency, Planner, Chatbot
═══════════════════════════════════════════════════════════════ */

// ─── Currency Rates (USD base) ────────────────────────────────
const FX_RATES = {
  USD: { rate: 1,       symbol: '$',   name: 'US Dollar' },
  EUR: { rate: 0.92,    symbol: '€',   name: 'Euro' },
  GBP: { rate: 0.79,    symbol: '£',   name: 'British Pound' },
  INR: { rate: 83.12,   symbol: '₹',   name: 'Indian Rupee' },
  JPY: { rate: 149.50,  symbol: '¥',   name: 'Japanese Yen' },
  AUD: { rate: 1.53,    symbol: 'A$',  name: 'Australian Dollar' },
  CAD: { rate: 1.36,    symbol: 'C$',  name: 'Canadian Dollar' },
  SGD: { rate: 1.34,    symbol: 'S$',  name: 'Singapore Dollar' },
  AED: { rate: 3.67,    symbol: 'د.إ', name: 'UAE Dirham' },
  THB: { rate: 35.20,   symbol: '฿',   name: 'Thai Baht' },
};

let activeCurrency = 'USD';

function convertCurrency(amountUSD, toCurrency) {
  const rate = FX_RATES[toCurrency]?.rate || 1;
  return amountUSD * rate;
}

function formatCurrency(amountUSD, currency = activeCurrency) {
  const fx = FX_RATES[currency] || FX_RATES.USD;
  const converted = amountUSD * fx.rate;
  const decimals = ['JPY', 'INR', 'THB'].includes(currency) ? 0 : 0;
  return fx.symbol + Math.round(converted).toLocaleString();
}

// ─── Toast Notifications ──────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Navigation ───────────────────────────────────────────────
function initNav() {
  const nav = document.querySelector('.nav');
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('nav-mobile-menu');

  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
    // Trigger on load
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
    });
  }

  // Auth state in nav
  updateNavAuth();

  // Dropdown listener
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('nav-account-dropdown');
    if (dropdown) {
      if (dropdown.contains(e.target)) {
        // Toggle if clicking the button itself
        if (e.target.closest('.nav-account-icon')) {
          dropdown.classList.toggle('open');
        }
      } else {
        dropdown.classList.remove('open');
      }
    }
  });
}

async function updateNavAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    const navAuthArea = document.getElementById('nav-auth');
    if (!navAuthArea) return;
    if (data.authenticated) {
      navAuthArea.innerHTML = `
        <div class="nav-dropdown" id="nav-account-dropdown">
          <button class="nav-account-icon" title="My Account">👤</button>
          <div class="nav-dropdown-menu">
            <div class="nav-dropdown-header">
              <div class="nav-dropdown-header-name">${data.name}</div>
              <div class="nav-dropdown-header-email">${data.email || ''}</div>
            </div>
            <a href="/account" class="nav-dropdown-item">✈️ Your Trip Plans</a>
            <a href="/account" class="nav-dropdown-item">🎒 Booked Trips</a>
            <a href="/account" class="nav-dropdown-item">⚙️ Profile Settings</a>
            <div class="nav-dropdown-item danger" onclick="logout()">🚪 Sign out</div>
          </div>
        </div>
      `;
    } else {
      navAuthArea.innerHTML = `
        <a href="/login" class="btn btn-outline-light btn-sm">Sign in</a>
        <a href="/register" class="btn btn-primary btn-sm">Get started</a>
      `;
    }
  } catch (e) {}
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
}

// ─── Destinations ─────────────────────────────────────────────
let allDestinations = [];
let activeFilter = 'all';

async function initDestinations() {
  const grid = document.getElementById('destinations-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/destinations');
    allDestinations = await res.json();
    renderDestinations(allDestinations);
  } catch (e) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Unable to load destinations.</p>';
  }

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeFilter = tab.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filtered = activeFilter === 'all'
        ? allDestinations
        : allDestinations.filter(d => d.category === activeFilter);
      renderDestinations(filtered);
    });
  });
}

function renderDestinations(destinations) {
  const grid = document.getElementById('destinations-grid');
  if (!grid) return;

  if (!destinations.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;">No destinations found.</p>';
    return;
  }

  grid.innerHTML = destinations.map(d => `
    <div class="destination-card" onclick="openDestination(${d.id})">
      <div class="destination-card-img">
        <img src="${d.image_url}" alt="${d.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800'">
        <span class="destination-card-badge">${d.category || 'travel'}</span>
      </div>
      <div class="destination-card-body">
        <div class="destination-card-header">
          <div>
            <div class="destination-card-title">${d.name}</div>
            <div class="destination-card-country">${d.country}</div>
          </div>
          <div class="destination-card-rating">⭐ ${parseFloat(d.rating).toFixed(1)}</div>
        </div>
        <p class="destination-card-desc">${d.short_desc}</p>
        <div class="destination-card-footer">
          <div class="destination-card-cost">
            From <strong id="dest-cost-${d.id}">${formatCurrency(d.avg_cost_usd)}</strong>
          </div>
          <div class="destination-card-season">🗓 ${d.best_season}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function openDestination(id) {
  const dest = allDestinations.find(d => d.id === id);
  if (!dest) return;
  // Pre-fill planner and navigate
  sessionStorage.setItem('selectedDestination', JSON.stringify(dest));
  window.location.href = '/planner';
}

// ─── Planner Multi-step Form ──────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 6;
let plannerData = {};
let mapInstance = null;

const COST_BASES = {
  accommodation: { hostel: 20, hotel: 55, airbnb: 45, resort: 110, villa: 150 },
  flight: { economy: 250, business: 750, first: 1800 },
  food: { budget: 15, 'mid-range': 35, 'fine-dining': 85, mixed: 30 },
  car: 35 // per day
};

function initPlanner() {
  if (!document.querySelector('.planner-page')) return;

  // Pre-fill from selected destination
  const savedDest = sessionStorage.getItem('selectedDestination');
  if (savedDest) {
    try {
      const dest = JSON.parse(savedDest);
      const destInput = document.getElementById('destination-name');
      if (destInput) destInput.value = dest.name;
      plannerData.destination_id = dest.id;
      plannerData.destination_name = dest.name;
      sessionStorage.removeItem('selectedDestination');
    } catch(e) {}
  }

  // Pre-fill from selected package
  const savedPackage = sessionStorage.getItem('selectedPackage');
  if (savedPackage) {
    try {
      const pkg = JSON.parse(savedPackage);
      const destInput = document.getElementById('destination-name');
      if (destInput) destInput.value = pkg.destination;
      plannerData.destination_name = pkg.destination;
      plannerData.package_name = pkg.title;
      plannerData.package_discount = pkg.discount;
      plannerData.package_savings = pkg.original_price - pkg.discounted_price;
      // Set default 7 nights for packages
      const today = new Date();
      const returnDate = new Date(today);
      returnDate.setDate(today.getDate() + 7);
      document.getElementById('travel-date').value = today.toISOString().split('T')[0];
      document.getElementById('return-date').value = returnDate.toISOString().split('T')[0];
      document.getElementById('travelers').value = 2; // Default for packages
      sessionStorage.removeItem('selectedPackage');
      
      showToast(`Package selected: ${pkg.title} - Save $${pkg.original_price - pkg.discounted_price}!`, 'success');
    } catch(e) {}
  }

  // Star rating
  document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', () => {
      const val = parseInt(star.dataset.value);
      star.closest('.star-rating').querySelectorAll('.star').forEach((s, i) => {
        s.classList.toggle('active', i < val);
      });
      plannerData.accommodation_stars = val;
    });
  });

  // Option cards
  document.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      const group = card.dataset.group;
      card.closest('.option-cards').querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      plannerData[group] = card.dataset.value;
      updateBudget();
    });
  });

  // Car rental toggle
  const carToggle = document.getElementById('car-rental-toggle');
  if (carToggle) {
    carToggle.addEventListener('change', () => {
      plannerData.car_rental = carToggle.checked;
      document.getElementById('car-type-row').style.display = carToggle.checked ? 'block' : 'none';
      updateBudget();
    });
  }

  // Form input listeners
  ['travel-date', 'return-date', 'travelers'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateBudget);
  });

  // Currency switcher
  document.querySelectorAll('.currency-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCurrency = btn.dataset.currency;
      document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBudget();
      // Also update destination cards if present
      if (allDestinations.length) renderDestinations(
        activeFilter === 'all' ? allDestinations : allDestinations.filter(d => d.category === activeFilter)
      );
    });
  });

  const paymentMethodEl = document.getElementById('payment-method');
  if (paymentMethodEl) {
    const setPaymentMethod = (value) => {
      plannerData.payment_method = value;
      const sumPayment = document.getElementById('sum-payment');
      if (sumPayment) sumPayment.textContent = formatPaymentMethod(value);
      updatePaymentCards(value);
    };

    paymentMethodEl.addEventListener('change', () => setPaymentMethod(paymentMethodEl.value));
    document.querySelectorAll('.payment-method-card').forEach(card => {
      card.addEventListener('click', () => {
        const method = card.dataset.method;
        paymentMethodEl.value = method;
        setPaymentMethod(method);
      });
    });

    setPaymentMethod(paymentMethodEl.value || 'credit_card');
  }

  updateBudget();
  updateStepUI();
}

function calcNights() {
  const d1 = document.getElementById('travel-date')?.value;
  const d2 = document.getElementById('return-date')?.value;
  if (!d1 || !d2) return 5;
  const diff = (new Date(d2) - new Date(d1)) / 86400000;
  return diff > 0 ? diff : 5;
}

function calcTravelers() {
  return parseInt(document.getElementById('travelers')?.value || 1);
}

function updateBudget() {
  const nights = calcNights();
  const travelers = calcTravelers();
  const accomType = plannerData.accommodation_type || 'hostel';
  const flightClass = plannerData.flight_class || 'economy';
  const food = plannerData.food_preference || 'budget';
  const hasCar = plannerData.car_rental || false;
  const carType = plannerData.car_type || 'economy';

  const accomCostUSD = (COST_BASES.accommodation[accomType] || 90) * nights * travelers;
  const flightCostUSD = (COST_BASES.flight[flightClass] || 400) * travelers;
  const foodCostUSD = (COST_BASES.food[food] || 50) * nights * travelers;
  const carCostUSD = hasCar ? COST_BASES.car * nights : 0;
  const totalUSD = accomCostUSD + flightCostUSD + foodCostUSD + carCostUSD;

  // Update display
  const totalEl = document.getElementById('budget-total');
  if (totalEl) {
    const fx = FX_RATES[activeCurrency] || FX_RATES.USD;
    const total = totalUSD * fx.rate;
    totalEl.textContent = Math.round(total).toLocaleString();
    document.getElementById('budget-symbol').textContent = fx.symbol;
    document.getElementById('budget-nights').textContent = `${nights} nights · ${travelers} traveller${travelers>1?'s':''}`;
  }

  const ids = { 'budget-accom': accomCostUSD, 'budget-flight': flightCostUSD, 'budget-food': foodCostUSD, 'budget-car': carCostUSD };
  Object.entries(ids).forEach(([id, usd]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatCurrency(usd, activeCurrency);
  });

  plannerData.total_budget_usd = Math.round(totalUSD);
  plannerData.currency = activeCurrency;
  plannerData.total_budget_display = formatCurrency(plannerData.total_budget_usd, activeCurrency);
  plannerData.budget_currency = activeCurrency;
}

window.togglePaymentUI = function() {
  const isCard = document.querySelector('input[name="pay_type"][value="card"]').checked;
  const payUiCard = document.getElementById('pay-ui-card');
  const payUiUpi = document.getElementById('pay-ui-upi');
  if(payUiCard && payUiUpi) {
    payUiCard.style.display = isCard ? 'block' : 'none';
    payUiUpi.style.display = !isCard ? 'block' : 'none';
  }
};

function nextStep() {
  if (!validateStep(currentStep)) return;
  collectStepData(currentStep);
  if (currentStep < TOTAL_STEPS) {
    currentStep++;
    updateStepUI();
    if (currentStep === 4) populateSummary();
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    updateStepUI();
  }
}

function updateStepUI() {
  document.querySelectorAll('.form-step').forEach((step, idx) => {
    step.classList.toggle('active', idx + 1 === currentStep);
  });
  document.querySelectorAll('.step-item').forEach((item, idx) => {
    item.classList.remove('active', 'completed');
    if (idx + 1 === currentStep) item.classList.add('active');
    if (idx + 1 < currentStep) item.classList.add('completed');
  });
  const prevBtn = document.getElementById('prev-btn');
  if (prevBtn) prevBtn.style.display = (currentStep === 1 || currentStep === 6 || currentStep === 5) ? 'none' : 'inline-flex';
  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) nextBtn.style.display = currentStep >= 5 ? 'none' : 'inline-flex';
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.style.display = currentStep === 4 ? 'inline-flex' : 'none';
  if (currentStep === 6) {
    // Wait for the step to be fully visible before initialising Leaflet.
    // A short frame-based delay is more reliable than a fixed timeout.
    requestAnimationFrame(() => {
      setTimeout(() => {
        initMap().catch(() => {});
      }, 200);
    });
  }
}

function validateStep(step) {
  if (step === 1) {
    const dest = document.getElementById('destination-name')?.value.trim();
    const dep = document.getElementById('departure-city')?.value.trim();
    if (!dest) { showToast('Please enter a destination', 'error'); return false; }
    if (!dep) { showToast('Please enter your departure city', 'error'); return false; }
  }
  if (step === 2) {
    const d1 = document.getElementById('travel-date')?.value;
    const d2 = document.getElementById('return-date')?.value;
    if (!d1 || !d2) { showToast('Please select travel dates', 'error'); return false; }
    if (new Date(d2) <= new Date(d1)) { showToast('Return date must be after departure', 'error'); return false; }
  }
  return true;
}

function collectStepData(step) {
  const get = id => document.getElementById(id)?.value;
  if (step === 1) {
    plannerData.destination_name = get('destination-name');
    plannerData.departure_city = get('departure-city');
  }
  if (step === 2) {
    plannerData.travel_date = get('travel-date');
    plannerData.return_date = get('return-date');
    plannerData.travelers = parseInt(get('travelers') || 1);
  }
  if (step === 3) {
    plannerData.notes = get('trip-notes');
  }
  if (step === 4) {
    plannerData.payment_method = get('payment-method') || 'credit_card';
  }
}

function formatPaymentMethod(method) {
  const map = {
    phone_pay: 'PhonePe',
    google_pay: 'Google Pay',
    credit_card: 'Credit Card'
  };
  return map[method] || 'Credit Card';
}

function updatePaymentCards(selectedMethod) {
  document.querySelectorAll('.payment-method-card').forEach(card => {
    card.classList.toggle('active', card.dataset.method === selectedMethod);
  });
}

function populateSummary() {
  collectStepData(4);
  const fields = {
    'sum-destination': plannerData.destination_name || '—',
    'sum-departure': plannerData.departure_city || '—',
    'sum-dates': plannerData.travel_date && plannerData.return_date
      ? `${plannerData.travel_date} → ${plannerData.return_date}` : '—',
    'sum-travelers': plannerData.travelers || 1,
    'sum-accommodation': `${plannerData.accommodation_type || 'hotel'} (${plannerData.accommodation_stars || 3}★)`,
    'sum-flight': plannerData.flight_class || 'economy',
    'sum-food': plannerData.food_preference || 'mixed',
    'sum-car': plannerData.car_rental ? `Yes — ${plannerData.car_type || 'economy'}` : 'No',
    'sum-budget': plannerData.total_budget_display || formatCurrency(plannerData.total_budget_usd || 0, plannerData.currency || activeCurrency),
    'sum-currency': plannerData.budget_currency || activeCurrency,
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

async function submitPlan() {
  collectStepData(4);
  const btn = document.getElementById('pay-save-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Processing…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(plannerData)
    });
    const data = await res.json();

    if (res.status === 401) {
      showToast('Please sign in to save your plan', 'error');
      setTimeout(() => window.location.href = '/login', 1200);
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Save failed');

    showToast('Payment successful! Loading map...');
    plannerData.id = data.id; // Store ID for book route
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
      currentStep = 6;
      updateStepUI(); // updateStepUI now handles initMap with proper timing
    }, 1000);
  } catch (err) {
    showToast(err.message || 'Payment failed', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function savePlanOnly() {
  collectStepData(4);
  const btn = document.getElementById('submit-btn');
  if (!btn) return;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...plannerData,
        payment_method: plannerData.payment_method || 'credit_card'
      })
    });
    const data = await res.json();

    if (res.status === 401) {
      showToast('Please sign in to save your plan', 'error');
      setTimeout(() => window.location.href = '/login', 1200);
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Unable to save plan');

    plannerData.id = data.id;
    showToast('Trip plan saved to My Trip Plans! You can continue to payment when ready.', 'success');
    updateStepUI();
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function geocodeCity(city) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (e) {}
  return null;
}

async function initMap() {
  const mapEl = document.getElementById('hotel-map');
  if (!mapEl) return;

  // Destroy any existing Leaflet instance cleanly
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  // Reset the container so Leaflet can re-initialise it
  mapEl.innerHTML = '';
  mapEl._leaflet_id = null; // clear Leaflet's internal flag

  const destName = plannerData.destination_name || 'Paris';
  const depName  = plannerData.departure_city  || 'London';

  mapInstance = L.map('hotel-map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance);

  // Force Leaflet to recalculate container size immediately
  mapInstance.invalidateSize();

  const [depCoords, destCoords] = await Promise.all([
    geocodeCity(depName),
    geocodeCity(destName)
  ]);

  const fallbackOrigin = [51.5074, -0.1278]; // London
  const fallbackDest   = [48.8566,  2.3522]; // Paris

  const origin      = depCoords  || fallbackOrigin;
  const destination = destCoords || fallbackDest;

  const iconOrigin = L.divIcon({ html: '<div style="font-size:24px;">🛫</div>', className: '', iconSize: [24,24], iconAnchor: [12,12] });
  const iconDest   = L.divIcon({ html: '<div style="font-size:24px;">🛬</div>', className: '', iconSize: [24,24], iconAnchor: [12,12] });

  // Departure marker
  const originMarker = L.marker(origin, { icon: iconOrigin }).addTo(mapInstance)
    .bindPopup('Departure: ' + depName);
  originMarker.bindTooltip('Departure: ' + depName, { permanent: true, direction: 'top', offset: [0, -10] });

  // Destination marker
  const destinationMarker = L.marker(destination, { icon: iconDest }).addTo(mapInstance)
    .bindPopup('Destination: ' + destName);
  destinationMarker.bindTooltip('Destination: ' + destName, { permanent: true, direction: 'top', offset: [0, -10] });

  // Dashed flight path
  const latlngs = [origin, destination];
  L.polyline(latlngs, { color: '#10b981', dashArray: '8, 8', weight: 4, opacity: 0.8 }).addTo(mapInstance);

  // Fit map to show both markers, then invalidate size once tiles settle
  mapInstance.fitBounds(latlngs, { padding: [50, 50] });
  setTimeout(() => mapInstance && mapInstance.invalidateSize(), 500);

  // Nearby hotel markers around destination
  const hotels = [
    { name: 'Oasis Backpackers',   price: 25, offset: [ 0.005,  0.005], desc: 'Vibrant atmosphere, highly reviewed.' },
    { name: 'Green Garden Hostel', price: 18, offset: [-0.005,  0.008], desc: 'Eco-friendly and very affordable.' },
    { name: 'Downtown Budget Inn', price: 35, offset: [ 0.002, -0.006], desc: 'Central location without the premium price tag.' }
  ];

  hotels.forEach(h => {
    const mll    = [destination[0] + h.offset[0], destination[1] + h.offset[1]];
    const marker = L.marker(mll).addTo(mapInstance);
    marker.bindPopup(
      `<b>${h.name}</b><br>$${h.price}/night<br>` +
      `<button onclick="selectHotel('${h.name}',${h.price},'${h.desc}')" ` +
      `style="margin-top:5px;border:none;background:var(--green-500);color:#fff;padding:3px 8px;border-radius:4px;cursor:pointer;">Select</button>`
    );
  });
}

function selectHotel(name, price, desc) {
  document.getElementById('selected-hotel-info').style.display = 'block';
  document.getElementById('hotel-name').textContent = name;
  document.getElementById('hotel-desc').textContent = desc;
  
  const fx = FX_RATES[activeCurrency] || FX_RATES.USD;
  const converted = price * fx.rate;
  document.getElementById('hotel-price').textContent = fx.symbol + Math.round(converted) + ' / night';
}

async function confirmBooking() {
  const btn = document.getElementById('confirm-booking-btn');
  btn.innerHTML = '<span class="spinner"></span> Booking...';
  btn.disabled = true;
  
  try {
    const res = await fetch(`/api/plans/${plannerData.id}/book`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    if (!res.ok) throw new Error('Booking failed');
    
    showToast('🎉 Booking Confirmed! Redirecting to your account...');
    setTimeout(() => {
      window.location.href = '/account#booked';
    }, 1500);
  } catch (err) {
    showToast(err.message, 'error');
    btn.innerHTML = '✅ Confirm Booking';
    btn.disabled = false;
  }
}

async function directBookPlan(planId) {
  try {
    const res = await fetch(`/api/plans/${planId}/book`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    if (!res.ok) throw new Error('Booking failed');
    
    showToast('🎉 Booking Confirmed!');
    await loadUserPlans();
    
    // Automatically switch to booked tab
    document.querySelector('.account-tab[data-tab="booked"]')?.click();
  } catch (err) {
    showToast(err.message || 'Failed to confirm booking', 'error');
  }
}

// ─── Auth Forms ───────────────────────────────────────────────
function initAuth() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type=submit]');
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const alert = document.getElementById('auth-alert');

      btn.innerHTML = '<span class="spinner"></span>';
      btn.disabled = true;
      alert.style.display = 'none';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) {
          alert.className = 'alert alert-error';
          alert.textContent = data.error;
          alert.style.display = 'block';
          btn.innerHTML = 'Sign in';
          btn.disabled = false;
          return;
        }
        showToast(`Welcome back, ${data.user.name.split(' ')[0]}!`);
        setTimeout(() => window.location.href = '/planner', 800);
      } catch (err) {
        alert.textContent = err.message;
        alert.style.display = 'block';
        btn.innerHTML = 'Sign in';
        btn.disabled = false;
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type=submit]');
      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const alert = document.getElementById('auth-alert');

      btn.innerHTML = '<span class="spinner"></span>';
      btn.disabled = true;
      alert.style.display = 'none';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Account created! Please check your email to verify your account.');
        // Show success message and hide form
        const successAlert = document.getElementById('auth-success');
        successAlert.textContent = `Account created successfully! We've sent a verification email to ${email}. Please check your email and click the verification link to activate your account.`;
        successAlert.style.display = 'block';
        alert.style.display = 'none';
        registerForm.style.display = 'none';
      } catch (err) {
        alert.textContent = err.message;
        alert.style.display = 'block';
        btn.innerHTML = 'Create account';
        btn.disabled = false;
      }
    });
  }
}

// ─── Chatbot ──────────────────────────────────────────────────
const BOT_RESPONSES = [
  {
    triggers: ['hello', 'hi', 'hey', 'hola'],
    response: "Hello! 👋 I'm your travel assistant. Ask me about destinations, visa requirements, best seasons to travel, or help planning your next adventure!"
  },
  {
    triggers: ['paris', 'france'],
    response: "Paris is magical year-round! 🗼 Best visited Apr–Jun or Sep–Oct to avoid crowds. Must-dos: Louvre, Eiffel Tower, Montmartre, and endless café au laits. Budget ~$2,200 per person for a week."
  },
  {
    triggers: ['tokyo', 'japan'],
    response: "Tokyo is extraordinary! 🌸 Spring (Mar–May) offers cherry blossoms, autumn (Sep–Nov) has stunning foliage. Don't miss Shibuya crossing, Tsukiji market, and a day trip to Nikko. Budget ~$2,500/week."
  },
  {
    triggers: ['bali', 'indonesia'],
    response: "Bali is a dream! 🌴 Dry season (Apr–Oct) is best. Split your time between Ubud (culture, rice terraces) and Seminyak/Canggu (beaches, surf). Very affordable at ~$1,200/week."
  },
  {
    triggers: ['maldives'],
    response: "The Maldives is pure paradise! 🐠 Best Nov–Apr (dry season). Overwater villas are iconic — book 6+ months ahead. Snorkelling and diving are world-class. Budget $4,500+ for a memorable week."
  },
  {
    triggers: ['visa', 'passport', 'documents'],
    response: "Visa requirements vary by nationality. I recommend checking your government's official travel advisory site or the IATA Travel Centre for the most current entry requirements. Always check 3–6 months before your trip! 📋"
  },
  {
    triggers: ['budget', 'cheap', 'affordable', 'cost', 'price'],
    response: "Great budget destinations include Bali ($1,200/wk), Southeast Asia generally, Portugal, and Colombia. For the best value, travel shoulder season (just before or after peak), book flights 6–8 weeks ahead, and mix hostels with affordable hotels! 💰"
  },
  {
    triggers: ['best time', 'when', 'season', 'weather'],
    response: "It depends on the destination! Generally: Europe is best May–Sep, Southeast Asia Nov–Apr, Caribbean Dec–Apr, East Africa Jul–Oct for safaris. Use our planner to check specific destinations. ☀️"
  },
  {
    triggers: ['flight', 'plane', 'airline', 'fly'],
    response: "For the best flight deals: book 6–8 weeks ahead for domestic, 3–6 months for international. Tue/Wed departures tend to be cheapest. Consider Google Flights' price tracking or Skyscanner for fare alerts! ✈️"
  },
  {
    triggers: ['hotel', 'accommodation', 'stay', 'hostel', 'airbnb'],
    response: "Accommodation choice depends on travel style! Hostels ($20–50/night) for solo/budget travellers, Airbnb for families or longer stays, boutique hotels for experience. Our planner lets you compare costs by accommodation type. 🏨"
  },
  {
    triggers: ['plan', 'planner', 'trip', 'itinerary'],
    response: "Use our Travel Planner to build your full trip! Select your destination, dates, accommodation type, flight class, and food preferences — we'll estimate your total budget in any currency. Head to the Planner page to get started. 🗺️"
  },
  {
    triggers: ['safari', 'kenya', 'africa'],
    response: "A Kenya safari is bucket-list material! 🦁 The Great Migration (Jul–Oct in Masai Mara) is unmissable. Combine with the coast for a beach finish. Budget $3,500+ for a week including a quality lodge. Highly recommend a guided tour."
  },
  {
    triggers: ['recommend', 'suggestion', 'where should', 'where to go'],
    response: "Depends on what you love! For beaches: Maldives or Bali. For culture: Tokyo or Paris. For adventure: Machu Picchu or Kenya. For romance: Santorini. For city life: New York. Tell me more about your travel style and I'll get specific! 🌍"
  },
  {
    triggers: ['santorini', 'greece'],
    response: "Santorini is breathtaking! 🌅 Best May–Oct, avoid August crowds if possible. Stay in Oia or Fira for caldera views. Sunsets here are genuinely legendary. Budget $2,800/week. Combine with Athens or Mykonos for a fuller trip."
  },
  {
    triggers: ['new york', 'nyc', 'manhattan'],
    response: "New York is electric! 🗽 Best Apr–Jun and Sep–Nov. Don't miss: Central Park, The High Line, MOMA, Brooklyn Bridge, and the food scene in every borough. Budget $3,000+/week — it's pricey but worth it."
  },
];

const QUICK_REPLIES = [
  'Best destinations 🌍',
  'Budget tips 💰',
  'Visa advice 📋',
  'Best seasons ☀️',
];

let chatOpen = false;
let chatMessages = [];

function initChatbot() {
  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  if (!fab || !panel) return;

  fab.addEventListener('click', () => {
    chatOpen = !chatOpen;
    panel.classList.toggle('open', chatOpen);
    fab.textContent = chatOpen ? '✕' : '💬';
    if (chatOpen && chatMessages.length === 0) {
      setTimeout(() => addBotMessage("Hi there! ✈️ I'm your travel assistant. Ask me anything about destinations, budgets, or trip planning!"), 400);
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chatOpen = false;
      panel.classList.remove('open');
      fab.textContent = '💬';
    });
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // Quick replies
  document.querySelectorAll('.quick-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.textContent.replace(/[^\w\s]/gi, '').trim();
      const inputEl = document.getElementById('chat-input');
      if (inputEl) inputEl.value = text;
      sendMessage();
    });
  });
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';

  addUserMessage(text);
  // Hide quick replies after first message
  const qr = document.querySelector('.chat-quick-replies');
  if (qr) qr.style.display = 'none';

  // Show typing indicator
  const typing = showTyping();
  const delay = 800 + Math.random() * 600;

  setTimeout(() => {
    removeTyping(typing);
    const response = getBotResponse(text);
    addBotMessage(response);
  }, delay);
}

function getBotResponse(text) {
  const lower = text.toLowerCase();
  for (const entry of BOT_RESPONSES) {
    if (entry.triggers.some(t => lower.includes(t))) {
      return entry.response;
    }
  }
  return "That's a great question! 🤔 I specialize in travel planning. Try asking about specific destinations like Paris or Tokyo, budget tips, visa requirements, or the best travel seasons. I'm here to help plan your perfect trip!";
}

function addUserMessage(text) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const msg = document.createElement('div');
  msg.className = 'msg msg-user';
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  chatMessages.push({ role: 'user', text });
}

function addBotMessage(text) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const msg = document.createElement('div');
  msg.className = 'msg msg-bot';
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  chatMessages.push({ role: 'bot', text });
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typing-' + Date.now();
  el.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function removeTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ─── Account Dashboard ───────────────────────────────────
async function initAccount() {
  if (!document.querySelector('.account-page')) return;

  // Load user info
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    if (data.authenticated) {
      document.getElementById('account-name').textContent = data.name;
      document.getElementById('account-email').textContent = data.email;
    } else {
      window.location.href = '/login';
      return;
    }
    const hashes = window.location.hash;
    if(hashes === '#booked') {
      document.querySelector('[data-tab="booked"]').click();
    }
  } catch (e) {
    window.location.href = '/login';
    return;
  }

  // Load plans
  await loadUserPlans();

  // Tab switching
  document.querySelectorAll('.account-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.account-section').forEach(s => s.classList.remove('active'));
      document.getElementById(tab.dataset.tab + '-section').classList.add('active');
    });
  });
}

async function loadUserPlans() {
  try {
    const res = await fetch('/api/plans', { credentials: 'include' });
    const plans = await res.json();
    
    const drafts = plans.filter(p => !p.status || p.status === 'draft');
    const booked = plans.filter(p => p.status === 'confirmed');
    
    renderPlans(drafts, 'plans-list');
    renderPlans(booked, 'booked-list', true);
  } catch (e) {
    document.getElementById('plans-list').innerHTML = '<p style="text-align:center;color:var(--text-muted)">Unable to load plans.</p>';
  }
}

function renderPlans(plans, containerId, isBooked = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!plans.length) {
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;">No ${isBooked ? 'booked trips' : 'trip plans'} yet. <a href="/planner" style="color:var(--green-500)">${isBooked ? 'Book a trip!' : 'Create your first plan'}</a></p>`;
    return;
  }

  container.innerHTML = plans.map(plan => `
    <div class="plan-card">
      <div class="plan-card-header">
        <img src="${plan.image_url || 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800'}" alt="${plan.destination_name}">
        <span class="plan-card-badge">${isBooked ? '🎉 Confirmed' : plan.destination_name}</span>
      </div>
      <div class="plan-card-body">
        <div class="plan-card-title">${plan.destination_name}</div>
        <div class="plan-card-dates">${plan.travel_date} → ${plan.return_date}</div>
        <div class="plan-card-details">
          <div class="plan-card-detail">🛏 ${plan.accommodation_type} (${plan.accommodation_stars}★)</div>
          <div class="plan-card-detail">✈️ ${plan.flight_class}</div>
          <div class="plan-card-detail">👥 ${plan.travelers} traveler${plan.travelers > 1 ? 's' : ''}</div>
          <div class="plan-card-detail">🍽 ${plan.food_preference}</div>
        </div>
        <div class="plan-card-budget">${formatCurrency(plan.total_budget_usd, plan.currency)}</div>
        <div class="plan-card-actions">
          ${isBooked ? '' : `
            <button class="plan-card-btn primary" onclick="directBookPlan(${plan.id})" style="background-color: var(--green-600); border-color: var(--green-600);">✅ Book It</button>
            <button class="plan-card-btn primary" onclick="editPlan(${plan.id})">Edit Plan</button>
          `}
          <button class="plan-card-btn secondary" onclick="deletePlan(${plan.id})">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function deletePlan(id) {
  if (!confirm('Are you sure you want to delete this plan?')) return;
  try {
    const res = await fetch(`/api/plans/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) {
      showToast('Plan deleted successfully');
      loadUserPlans();
    } else {
      showToast('Failed to delete plan', 'error');
    }
  } catch (e) {
    showToast('Failed to delete plan', 'error');
  }
}

function editPlan(id) {
  // For now, redirect to planner. Could be enhanced to pre-fill
  window.location.href = '/planner';
}

// ─── Offer Packages ────────────────────────────────────
const OFFER_PACKAGES = [
  {
    id: 1,
    title: 'Bali Paradise Escape',
    subtitle: '7 nights in Ubud + beach resort',
    image: 'https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=800',
    original_price: 1800,
    discounted_price: 1299,
    discount: '28% OFF',
    features: [
      'Round-trip flights from major cities',
      '5-star beachfront resort in Seminyak',
      'Traditional Balinese villa in Ubud',
      'Daily breakfast & cultural tours',
      'Airport transfers included'
    ],
    destination: 'Bali'
  },
  {
    id: 2,
    title: 'Tokyo City Explorer',
    subtitle: '6 nights in the heart of Tokyo',
    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
    original_price: 2200,
    discounted_price: 1599,
    discount: '27% OFF',
    features: [
      'Direct flights from major hubs',
      'Central Shibuya hotel with city views',
      'JR Pass for unlimited travel',
      'Guided tours of temples & markets',
      'Traditional kaiseki dinner experience'
    ],
    destination: 'Tokyo'
  },
  {
    id: 3,
    title: 'Santorini Sunset Romance',
    subtitle: '5 nights in cliffside luxury',
    image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800',
    original_price: 2500,
    discounted_price: 1899,
    discount: '24% OFF',
    features: [
      'Scenic flights with Aegean views',
      'Cliffside cave hotel in Oia',
      'Private sunset yacht cruise',
      'Wine tasting in volcanic vineyards',
      'Spa treatments & couples massage'
    ],
    destination: 'Santorini'
  },
  {
    id: 4,
    title: 'Morocco Desert Adventure',
    subtitle: '8 nights from Marrakech to Sahara',
    image: 'https://images.unsplash.com/photo-1539650116574-75c0c6d0b7ef?w=800',
    original_price: 1600,
    discounted_price: 1199,
    discount: '25% OFF',
    features: [
      'Flights to Marrakech',
      'Riad stay in Medina & desert camp',
      'Camel trek in Sahara dunes',
      'Cooking classes & hammam experience',
      'Atlas Mountains hiking tour'
    ],
    destination: 'Morocco'
  }
];

function initPackages() {
  const grid = document.getElementById('packages-grid');
  if (!grid) return;

  grid.innerHTML = OFFER_PACKAGES.map(pkg => `
    <div class="package-card" onclick="selectPackage(${pkg.id})">
      <div class="package-card-discount">${pkg.discount}</div>
      <div class="package-card-img">
        <img src="${pkg.image}" alt="${pkg.title}" loading="lazy">
      </div>
      <div class="package-card-body">
        <div class="package-card-title">${pkg.title}</div>
        <div class="package-card-subtitle">${pkg.subtitle}</div>
        <ul class="package-card-features">
          ${pkg.features.map(feature => `<li>${feature}</li>`).join('')}
        </ul>
        <div class="package-card-pricing">
          <div>
            <div class="package-card-price">$${pkg.discounted_price}</div>
            <div class="package-card-original">$${pkg.original_price}</div>
          </div>
        </div>
        <button class="package-card-btn">Book Now - Save $${pkg.original_price - pkg.discounted_price}</button>
      </div>
    </div>
  `).join('');
}

function selectPackage(packageId) {
  const pkg = OFFER_PACKAGES.find(p => p.id === packageId);
  if (!pkg) return;

  // Pre-fill planner with package details
  sessionStorage.setItem('selectedPackage', JSON.stringify(pkg));
  window.location.href = '/planner';
}

// ─── Initialize ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initDestinations();
  initPackages();
  initPlanner();
  initAuth();
  initAccount();
  initChatbot();
});