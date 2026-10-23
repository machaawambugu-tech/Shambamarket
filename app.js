
import { supabase } from "./supabase-config.js";

/* =========================================================
   SHAMBAMARKET — APP ENGINE
   Matches the IDs in the current index.html
   Backend: Supabase
   ========================================================= */

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const CONFIG = {
  table: "listings",
  photoBucket: "listing-photos",
  currency: "KES",
  pageSize: 12
};

const state = {
  user: null,
  listings: [],
  filtered: [],
  selectedListing: null,
  cart: loadCart(),
  category: "",
  search: "",
  county: "",
  sort: "newest",
  page: 1,
  authMode: "login",
  loading: false
};

const departments = {
  "Fresh Produce": ["Fruits", "Vegetables", "Nuts"],
  "Crops & Grains": [
    "Starchy Foods", "Grains", "Cereals", "Legumes",
    "Spices", "Herbal Products"
  ],
  "Farm Tools & Equipment": ["Farm Tools & Equipment"],
  "Agricultural Inputs & Fertilizers": [
    "Agricultural Inputs & Fertilizers"
  ],
  "Livestock & Poultry": ["Livestock & Poultry"],
  "Animal & Farm Products": ["Animal & Farm Products"],
  "Farm Services": ["Farm Services"]
};

const escapeHTML = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

const money = (value) =>
  `${CONFIG.currency} ${Number(value || 0).toLocaleString("en-KE", {
    maximumFractionDigits: 2
  })}`;

function notify(message, type = "info") {
  const toast = $("toast");

  if (toast) {
    toast.textContent = message;
    toast.dataset.type = type;
    toast.hidden = false;

    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4500);
  } else {
    console.info(`[ShambaMarket] ${message}`);
  }
}

function setStatus(id, message, type = "info") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.dataset.type = type;
}

function setButtonBusy(button, busy, busyText = "Please wait...") {
  if (!button) return;

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

/* =========================================================
   WHITE + GREEN THEME
   Existing CSS files remain untouched.
   ========================================================= */

function applyTheme() {
  const style = document.createElement("style");
  style.id = "shambamarket-runtime-theme";

  style.textContent = `
    :root {
      color-scheme: light;
      --sm-green-950: #123b26;
      --sm-green-900: #174a2d;
      --sm-green-800: #21643b;
      --sm-green-700: #287a45;
      --sm-green-600: #328c50;
      --sm-green-100: #e9f5ec;
      --sm-green-50: #f5fbf6;
      --sm-white: #ffffff;
      --sm-ink: #203328;
      --sm-muted: #66776b;
      --sm-border: #dce8de;
      --sm-radius: 14px;
      --sm-shadow: 0 8px 24px rgba(20, 65, 36, .08);
    }

    body {
      background: #fff !important;
      color: var(--sm-ink) !important;
    }

    .sm-header, .sm-auth-card, .sm-panel,
    .sm-product-card, .sm-category, .sm-section {
      background-color: #fff;
    }

    .sm-header {
      border-bottom: 1px solid var(--sm-border);
    }

    .sm-brand, .sm-brand span {
      color: var(--sm-green-800);
    }

    .sm-primary, button.sm-primary {
      background: var(--sm-green-700) !important;
      color: white !important;
      border: 1px solid var(--sm-green-700) !important;
      border-radius: 10px;
      cursor: pointer;
    }

    .sm-primary:hover, button.sm-primary:hover {
      background: var(--sm-green-900) !important;
    }

    .sm-secondary, button.sm-secondary,
    .sm-category {
      background: white !important;
      color: var(--sm-green-800) !important;
      border: 1px solid var(--sm-border) !important;
      border-radius: 10px;
      cursor: pointer;
    }

    button:hover, .sm-category:hover {
      border-color: var(--sm-green-600) !important;
    }

    button:disabled {
      opacity: .6;
      cursor: not-allowed;
    }

    input, select, textarea {
      background: #fff !important;
      color: var(--sm-ink) !important;
      border: 1px solid #cddbd0 !important;
      border-radius: 9px;
    }

    input:focus, select:focus, textarea:focus {
      outline: 2px solid #9bd0a8;
      outline-offset: 1px;
    }

    .sm-category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 10px;
    }

    .sm-category {
      padding: 13px 10px;
      min-height: 48px;
    }

    .sm-product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
    }

    .sm-product-card {
      border: 1px solid var(--sm-border);
      border-radius: var(--sm-radius);
      overflow: hidden;
      box-shadow: var(--sm-shadow);
      min-width: 0;
    }

    .sm-product-card img {
      display: block;
      width: 100%;
      height: 180px;
      object-fit: cover;
      background: var(--sm-green-50);
    }

    .sm-product-body {
      padding: 15px;
    }

    .sm-product-body h3 {
      margin-top: 0;
      overflow-wrap: anywhere;
    }

    .sm-price {
      color: var(--sm-green-800);
      font-weight: 750;
    }

    .sm-muted {
      color: var(--sm-muted);
    }

    .sm-filter-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin: 16px 0;
    }

    .sm-filter-bar input,
    .sm-filter-bar select {
      width: 100%;
      min-width: 0;
      padding: 12px;
    }

    .sm-status[data-type="error"] { color: #a32626; }
    .sm-status[data-type="success"] { color: var(--sm-green-800); }

    #toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      max-width: min(360px, calc(100vw - 40px));
      background: var(--sm-green-950);
      color: white;
      padding: 14px 18px;
      border-radius: 12px;
      box-shadow: var(--sm-shadow);
    }

    #toast[hidden] { display: none !important; }

    .sm-inline-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .sm-inline-actions button {
      padding: 9px 12px;
    }

    .sm-empty {
      padding: 24px;
      background: var(--sm-green-50);
      border: 1px dashed #bdd7c3;
      border-radius: var(--sm-radius);
      text-align: center;
    }

    .sm-product-meta {
      font-size: .92rem;
      color: var(--sm-muted);
      line-height: 1.6;
    }

    .sm-cart-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding: 14px 0;
      border-bottom: 1px solid var(--sm-border);
    }

    .sm-cart-row input {
      width: 85px;
      padding: 8px;
    }

    [hidden] { display: none !important; }

    @media (max-width: 600px) {
      .sm-header { flex-wrap: wrap; gap: 10px; }
      .sm-nav { display: flex; flex-wrap: wrap; gap: 6px; }
      .sm-nav button { padding: 8px; }
      .sm-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .sm-product-card img { height: 130px; }
      .sm-product-body { padding: 10px; }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function showPage(pageId) {
  const target = $(pageId);

  if (!target || !target.classList.contains("app-page")) {
    notify("That page is not available yet.");
    return;
  }

  $$(".app-page").forEach((page) => {
    page.hidden = page.id !== pageId;
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAuth(mode = "login") {
  state.authMode = mode;
  showPage("auth-page");

  if (window.shambaUI?.setAuthMode) {
    window.shambaUI.setAuthMode(mode);
  }

  $("auth-form").hidden = false;
  $("recovery-panel").hidden = true;
  $("new-password-panel").hidden = true;
  setStatus("auth-status", "");
}

function requireSignIn(action) {
  if (state.user) return true;

  openAuth("login");
  setStatus("auth-status", `Please sign in to ${action}.`);
  return false;
}

function updateAccountUI() {
  const label = $("account-label");
  const login = $("header-login-button");
  const logout = $("logout-button");

  if (label) {
    label.textContent = state.user
      ? `Signed in: ${state.user.email || "account"}`
      : "Browsing as guest";
  }

  if (login) login.hidden = Boolean(state.user);
  if (logout) logout.hidden = !state.user;
}

/* =========================================================
   AUTHENTICATION
   ========================================================= */

async function refreshSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    state.user = data.session?.user || null;
  } catch (error) {
    console.error("Session check failed:", error);
    state.user = null;
  }

  updateAccountUI();
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const name = $("auth-name").value.trim();
  const role = $("auth-role").value;
  const confirm = $("signup-password-confirm").value;
  const signup = state.authMode === "signup";
  const button = $("auth-submit");

  if (!email || !password) {
    setStatus("auth-status", "Enter your email and password.", "error");
    return;
  }

  if (signup && password !== confirm) {
    setStatus("auth-status", "Your passwords do not match.", "error");
    return;
  }

  if (signup && !name) {
    setStatus("auth-status", "Enter your full name.", "error");
    return;
  }

  setButtonBusy(button, true);
  setStatus("auth-status", signup ? "Creating account..." : "Signing in...");

  try {
    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            account_type: role
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        state.user = data.user;
        updateAccountUI();
        showPage("market-page");
        notify("Account created successfully!", "success");
      } else {
        setStatus(
          "auth-status",
          "Account request received. Check your email to verify your account.",
          "success"
        );
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      state.user = data.user;
      updateAccountUI();
      showPage("market-page");
      notify("Welcome back!", "success");
      await loadListings();
    }
  } catch (error) {
    console.error("Authentication failed:", error);
    setStatus("auth-status", error.message || "Authentication failed.", "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    state.user = null;
    updateAccountUI();
    showPage("market-page");
    notify("You have signed out.");
  } catch (error) {
    notify(error.message || "Could not sign out.", "error");
  }
}

async function requestPasswordRecovery(event) {
  event.preventDefault();

  const email = $("recovery-email").value.trim();
  if (!email) return;

  const button = event.submitter;
  setButtonBusy(button, true);
  setStatus("recovery-status", "Requesting recovery email...");

  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) throw error;

    setStatus(
      "recovery-status",
      "If the account exists, a recovery email has been requested. Check your inbox.",
      "success"
    );
  } catch (error) {
    setStatus("recovery-status", error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function updatePassword(event) {
  event.preventDefault();

  const password = $("new-password").value;
  const confirm = $("new-password-confirm").value;

  if (password.length < 8 || password !== confirm) {
    setStatus("new-password-status", "Use at least 8 characters and make both passwords match.", "error");
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    setStatus("new-password-status", "Password updated successfully.", "success");
    notify("Your password has been updated.", "success");
  } catch (error) {
    setStatus("new-password-status", error.message, "error");
  }
}

/* =========================================================
   LISTINGS — USE SELECT * TO AVOID STALE COLUMN LISTS
   ========================================================= */

function isPublished(listing) {
  // If the status column exists, only show published listings.
  // If it doesn't exist in an older schema, treat rows as visible
  // only when the public SELECT policy permits them.
  if (!Object.prototype.hasOwnProperty.call(listing, "status")) {
    return true;
  }

  return String(listing.status || "").toLowerCase() === "published";
}

async function loadListings() {
  const status = $("market-status");
  if (status) status.textContent = "Loading marketplace listings...";

  try {
    const { data, error } = await supabase
      .from(CONFIG.table)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.listings = (data || []).filter(isPublished);
    filterListings();
  } catch (error) {
    console.error("Could not load listings:", error);

    if (status) {
      status.textContent =
        `Could not load listings: ${error.message}. Check the listings table and its public read permissions.`;
      status.dataset.type = "error";
    }

    const grid = $("product-list");
    if (grid) {
      grid.innerHTML = `
        <div class="sm-empty">
          <h3>Marketplace temporarily unavailable</h3>
          <p>We couldn't retrieve listings from Supabase.</p>
          <button class="sm-secondary" type="button" data-action="reload-listings">
            Try again
          </button>
        </div>`;
    }
  }
}

function getListingCategory(listing) {
  return listing.subcategory || listing.category || "Other";
}

function filterListings() {
  const search = state.search.toLowerCase();

  let items = state.listings.filter((item) => {
    const haystack = [
      item.product_name,
      item.name,
      item.category,
      item.subcategory,
      item.description,
      item.county,
      item.town,
      item.farmer_name
    ].filter(Boolean).join(" ").toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesCounty =
      !state.county ||
      String(item.county || "").toLowerCase() === state.county.toLowerCase();

    const category = state.category.toLowerCase();
    const matchesCategory = !category || [
      item.category,
      item.subcategory
    ].some((value) =>
      String(value || "").toLowerCase() === category
    );

    return matchesSearch && matchesCounty && matchesCategory;
  });

  switch (state.sort) {
    case "price-low":
      items.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      break;
    case "price-high":
      items.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      break;
    case "name":
      items.sort((a, b) =>
        String(a.product_name || a.name || "").localeCompare(
          String(b.product_name || b.name || "")
        )
      );
      break;
    default:
      items.sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
  }

  state.filtered = items;
  state.page = Math.max(1, state.page);
  renderListings();
}

function renderListings() {
  const grid = $("product-list");
  const status = $("market-status");
  if (!grid) return;

  const start = (state.page - 1) * CONFIG.pageSize;
  const visible = state.filtered.slice(start, start + CONFIG.pageSize);

  if (status) {
    status.textContent = `${state.filtered.length} listing(s) found`;
    status.dataset.type = "info";
  }

  if (!visible.length) {
    grid.innerHTML = `
      <div class="sm-empty">
        <h3>No matching listings yet</h3>
        <p>Try another search or category, or check back later.</p>
        <button type="button" class="sm-secondary" data-action="clear-filters">
          Clear filters
        </button>
      </div>`;
  } else {
    grid.innerHTML = visible.map((item) => {
      const id = escapeHTML(item.id);
      const name = escapeHTML(item.product_name || item.name || "Farm listing");
      const category = escapeHTML(getListingCategory(item));
      const county = escapeHTML(item.county || item.town || "Kenya");
      const farmer = escapeHTML(item.farmer_name || "Local farmer");
      const image = item.photo_url
        ? escapeHTML(item.photo_url)
        : "";

      return `
        <article class="sm-product-card">
          ${
            image
              ? `<img src="${image}" alt="${name}" loading="lazy"
                   onerror="this.style.display='none'">`
              : `<div style="height:130px;background:#f1f8f2;display:grid;place-items:center;font-size:2rem">🌿</div>`
          }
          <div class="sm-product-body">
            <p class="sm-muted">${category}</p>
            <h3>${name}</h3>
            <p class="sm-price">${money(item.price)}${item.unit ? ` / ${escapeHTML(item.unit)}` : ""}</p>
            <p class="sm-product-meta">📍 ${county}<br>👨‍🌾 ${farmer}</p>
            <div class="sm-inline-actions">
              <button type="button" class="sm-primary"
                data-action="view-listing" data-id="${id}">
                View details
              </button>
              <button type="button" class="sm-secondary"
                data-action="add-cart" data-id="${id}">
                Add to cart
              </button>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  renderPagination();
}

function renderPagination() {
  const host = $("product-pagination");
  if (!host) return;

  const pages = Math.ceil(state.filtered.length / CONFIG.pageSize);
  if (pages <= 1) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = `
    <button class="sm-secondary" type="button" data-action="page-prev"
      ${state.page <= 1 ? "disabled" : ""}>← Previous</button>
    <span>Page ${state.page} of ${pages}</span>
    <button class="sm-secondary" type="button" data-action="page-next"
      ${state.page >= pages ? "disabled" : ""}>Next →</button>`;
}

function clearFilters() {
  state.search = "";
  state.county = "";
  state.category = "";
  state.sort = "newest";
  state.page = 1;

  if ($("search-input")) $("search-input").value = "";
  if ($("county-filter")) $("county-filter").value = "";
  if ($("sort-filter")) $("sort-filter").value = "";

  filterListings();
}

/* =========================================================
   PRODUCT DETAILS
   ========================================================= */

function viewListing(id) {
  const listing = state.listings.find((item) => String(item.id) === String(id));
  if (!listing) {
    notify("That listing could not be found.", "error");
    return;
  }

  state.selectedListing = listing;
  const host = $("product-details");
  if (!host) return;

  const name = escapeHTML(listing.product_name || listing.name || "Farm listing");
  const description = escapeHTML(listing.description || "No description provided.");
  const category = escapeHTML(getListingCategory(listing));
  const location = escapeHTML([listing.town, listing.county].filter(Boolean).join(", ") || "Kenya");
  const farmer = escapeHTML(listing.farmer_name || "Local farmer");

  host.innerHTML = `
    <h2>${name}</h2>
    ${
      listing.photo_url
        ? `<img src="${escapeHTML(listing.photo_url)}" alt="${name}"
             style="width:100%;max-height:360px;object-fit:contain;border-radius:12px">`
        : ""
    }
    <p class="sm-price">${money(listing.price)}${listing.unit ? ` / ${escapeHTML(listing.unit)}` : ""}</p>
    <p><strong>Category:</strong> ${category}</p>
    <p><strong>Location:</strong> ${location}</p>
    <p><strong>Farmer:</strong> ${farmer}</p>
    <p><strong>Available quantity:</strong> ${escapeHTML(listing.quantity ?? "Ask farmer")}</p>
    <p>${description}</p>
    ${
      listing.phone
        ? `<p><strong>Contact:</strong> ${escapeHTML(listing.phone)}</p>`
        : ""
    }`;

  showPage("details-page");
}

/* =========================================================
   CART — LOCAL BROWSER CART; NO FAKE PAYMENT
   ========================================================= */

function loadCart() {
  // This is a temporary in-memory cart for this browser session.
  // No personal data is stored in localStorage.
  return [];
}

function persistCart() {
  // Intentionally memory-only. A future cart table can sync
  // the cart to an authenticated user's account.
}

function addToCart(id) {
  const listing = state.listings.find((item) => String(item.id) === String(id));
  if (!listing) {
    notify("Listing not found.", "error");
    return;
  }

  const existing = state.cart.find((row) => String(row.id) === String(id));

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: listing.id,
      name: listing.product_name || listing.name || "Farm listing",
      price: Number(listing.price || 0),
      unit: listing.unit || "",
      quantity: 1
    });
  }

  persistCart();
  renderCart();
  notify("Added to your cart.", "success");
}

function renderCart() {
  const host = $("cart-items");
  const total = $("cart-subtotal");
  const count = $("cart-count");

  const itemCount = state.cart.reduce((sum, row) => sum + row.quantity, 0);
  if (count) count.textContent = String(itemCount);

  const subtotal = state.cart.reduce(
    (sum, row) => sum + row.price * row.quantity,
    0
  );

  if (total) total.textContent = `Subtotal: ${money(subtotal)}`;
  if (!host) return;

  if (!state.cart.length) {
    host.innerHTML = `<div class="sm-empty"><h3>Your cart is empty</h3><p>Explore the marketplace to add farm products.</p></div>`;
    return;
  }

  host.innerHTML = state.cart.map((row) => `
    <div class="sm-cart-row">
      <div>
        <strong>${escapeHTML(row.name)}</strong>
        <div class="sm-muted">${money(row.price)} ${row.unit ? `/ ${escapeHTML(row.unit)}` : ""}</div>
      </div>
      <label>
        Qty
        <input type="number" min="1" step="1" value="${row.quantity}"
          data-cart-quantity="${escapeHTML(row.id)}" aria-label="Quantity">
      </label>
      <strong>${money(row.price * row.quantity)}</strong>
      <button type="button" class="sm-secondary"
        data-action="remove-cart" data-id="${escapeHTML(row.id)}">Remove</button>
    </div>
  `).join("");
}

function changeCartQuantity(id, quantity) {
  const row = state.cart.find((item) => String(item.id) === String(id));
  if (!row) return;

  row.quantity = Math.max(1, Math.floor(Number(quantity) || 1));
  persistCart();
  renderCart();
}

function clearCart() {
  state.cart = [];
  persistCart();
  renderCart();
  setStatus("cart-status", "Cart cleared.", "success");
}

function startOrderEnquiry() {
  if (!requireSignIn("continue with an order enquiry")) return;

  if (!state.cart.length) {
    setStatus("cart-status", "Add at least one listing to your cart first.", "error");
    return;
  }

  const summary = state.cart.map((row) =>
    `${row.name} × ${row.quantity} — ${money(row.price * row.quantity)}`
  ).join("\n");

  const message = `Order enquiry:\n${summary}\nSubtotal estimate: ${money(
    state.cart.reduce((sum, row) => sum + row.price * row.quantity, 0)
  )}\n\nPlease confirm availability, delivery and final price.`;

  setStatus(
    "cart-status",
    "Your enquiry is ready. Messaging/order submission must be connected to the database before it can be sent.",
    "info"
  );

  notify("Order total calculated. No payment has been taken.");
  console.info(message);
}

/* =========================================================
   FARMER LISTING FORM
   ========================================================= */

function updateSubcategories() {
  const department = $("product-category")?.value;
  const subcategory = $("product-subcategory");
  if (!subcategory) return;

  const choices = departments[department] || [];
  const current = subcategory.value;

  subcategory.innerHTML = `
    <option value="">Choose a category</option>
    ${choices.map((choice) =>
      `<option value="${escapeHTML(choice)}">${escapeHTML(choice)}</option>`
    ).join("")}`;

  if (choices.includes(current)) subcategory.value = current;
}

async function uploadListingPhoto(file, userId) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Please choose an image smaller than 5 MB.");
  }

  const extension = file.name.split(".").pop().replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(CONFIG.photoBucket)
    .upload(path, file, { upsert: false });

  if (error) {
    throw new Error(
      `Photo upload failed. Check the "${CONFIG.photoBucket}" Storage bucket and its upload policy. ${error.message}`
    );
  }

  const { data } = supabase.storage.from(CONFIG.photoBucket).getPublicUrl(path);
  return data.publicUrl;
}

async function handleListingSubmit(event) {
  event.preventDefault();

  if (!requireSignIn("publish a listing")) return;

  const form = $("product-form");
  const button = form.querySelector('button[type="submit"]');
  setButtonBusy(button, true, "Publishing...");

  try {
    const photo = $("product-photo").files[0] || null;
    const photoUrl = await uploadListingPhoto(photo, state.user.id);

    const listing = {
      product_name: $("product-name").value.trim(),
      category: $("product-category").value,
      subcategory: $("product-subcategory").value,
      price: Number($("product-price").value),
      quantity: Number($("product-quantity").value),
      unit: $("product-unit").value,
      county: $("product-county").value,
      town: $("product-town").value.trim(),
      phone: $("product-phone").value.trim(),
      description: $("product-description").value.trim(),
      photo_url: photoUrl,
      owner_id: state.user.id,
      farmer_name: state.user.user_metadata?.full_name || state.user.email,
      status: "published"
    };

    const { error } = await supabase.from(CONFIG.table).insert(listing);
    if (error) throw error;

    form.reset();
    updateSubcategories();

    setStatus("product-form-status", "Listing published successfully!", "success");
    notify("Your listing has been published.", "success");

    await loadListings();
    showPage("market-page");
  } catch (error) {
    console.error("Listing publish failed:", error);
    setStatus(
      "product-form-status",
      error.message || "Could not publish listing. Check the database columns and permissions.",
      "error"
    );
  } finally {
    setButtonBusy(button, false);
  }
}

/* =========================================================
   ACCOUNT SETTINGS
   ========================================================= */

async function saveSettings(event) {
  event.preventDefault();

  if (!requireSignIn("save account settings")) return;

  const name = $("settings-name").value.trim();
  const phone = $("settings-phone").value.trim();

  try {
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: name,
        phone
      }
    });

    if (error) throw error;

    setStatus("settings-status", "Account profile updated.", "success");
    notify("Settings saved.", "success");
  } catch (error) {
    setStatus("settings-status", error.message, "error");
  }
}

function renderSettings() {
  if (!state.user) return;

  $("settings-account-name").textContent =
    `Signed in as ${state.user.user_metadata?.full_name || "User"}`;
  $("settings-account-email").textContent = state.user.email || "";
  $("settings-name").value = state.user.user_metadata?.full_name || "";
  $("settings-phone").value = state.user.user_metadata?.phone || "";
}

/* =========================================================
   PASSWORD BUTTONS
   ========================================================= */

function togglePassword(inputId, button) {
  const input = $(inputId);
  if (!input) return;

  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  button.textContent = reveal ? "Hide" : "Show";
  button.setAttribute("aria-pressed", String(reveal));
}

/* =========================================================
   CLICK ACTIONS — ONE DELEGATED HANDLER
   ========================================================= */

async function handleAction(action, button) {
  const id = button.dataset.id;

  switch (action) {
    case "reload-listings":
      await loadListings();
      break;

    case "clear-filters":
      clearFilters();
      break;

    case "view-listing":
      viewListing(id);
      break;

    case "add-cart":
      addToCart(id);
      break;

    case "remove-cart":
      state.cart = state.cart.filter((row) => String(row.id) !== String(id));
      persistCart();
      renderCart();
      break;

    case "page-prev":
      state.page = Math.max(1, state.page - 1);
      renderListings();
      break;

    case "page-next":
      state.page += 1;
      renderListings();
      break;

    case "clear-cart":
      clearCart();
      break;

    case "order-enquiry":
      startOrderEnquiry();
      break;

    case "details-add-cart":
      if (state.selectedListing) {
        addToCart(state.selectedListing.id);
      }
      break;

    case "details-message-farmer":
      if (!requireSignIn("message a farmer")) return;
      showPage("messages-page");
      setStatus(
        "message-status",
        "Messaging UI is ready, but conversation creation and sending must be connected to your Supabase messaging tables."
      );
      break;

    default:
      console.info("Unrecognised app action:", action);
  }
}

function setupEventHandlers() {
  // Navigation is delegated so it also works for dynamically created buttons.
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.id === "toggle-password") {
      togglePassword("auth-password", button);
      return;
    }

    if (button.id === "toggle-signup-password") {
      togglePassword("signup-password-confirm", button);
      return;
    }

    if (button.id === "toggle-admin-password") {
      togglePassword("admin-password", button);
      return;
    }

    if (button.id === "header-login-button") {
      openAuth("login");
      return;
    }

    if (button.id === "hero-sell-button") {
      if (state.user) showPage("farmer-page");
      else openAuth("login");
      return;
    }

    if (button.id === "hero-browse-button") {
      $("marketplace")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (button.id === "brand-home") {
      event.preventDefault();
      showPage("market-page");
      return;
    }

    if (button.id === "show-login") {
      state.authMode = "login";
      window.shambaUI?.setAuthMode("login");
      return;
    }

    if (button.id === "show-signup") {
      state.authMode = "signup";
      window.shambaUI?.setAuthMode("signup");
      return;
    }

    if (button.id === "browse-public-button") {
      showPage("market-page");
      return;
    }

    if (button.id === "logout-button") {
      await handleLogout();
      return;
    }

    if (button.id === "forgot-password-button") {
      $("auth-form").hidden = true;
      $("recovery-panel").hidden = false;
      $("new-password-panel").hidden = true;
      $("recovery-email").value = $("auth-email").value;
      return;
    }

    if (button.id === "back-to-login") {
      openAuth("login");
      return;
    }

    if (button.id === "show-admin-login") {
      showPage("admin-login-page");
      return;
    }

    if (button.id === "back-to-auth") {
      openAuth("login");
      return;
    }

    if (button.dataset.protected === "true") {
      if (!requireSignIn("use this feature")) return;

      if (button.dataset.page === "settings-page") renderSettings();
      showPage(button.dataset.page);
      return;
    }

    if (button.dataset.page) {
      showPage(button.dataset.page);
      return;
    }

    if (button.dataset.category) {
      state.category = button.dataset.category;
      state.page = 1;
      filterListings();
      $("marketplace")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (button.dataset.action) {
      await handleAction(button.dataset.action, button);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;

    if (target.id === "search-input") {
      state.search = target.value.trim();
      state.page = 1;
      filterListings();
    }

    if (target.matches("[data-cart-quantity]")) {
      changeCartQuantity(target.dataset.cartQuantity, target.value);
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;

    if (target.id === "county-filter") {
      state.county = target.value;
      state.page = 1;
      filterListings();
    }

    if (target.id === "sort-filter") {
      state.sort = target.value || "newest";
      state.page = 1;
      filterListings();
    }

    if (target.id === "product-category") {
      updateSubcategories();
    }
  });

  $("auth-form")?.addEventListener("submit", handleAuthSubmit);
  $("recovery-form")?.addEventListener("submit", requestPasswordRecovery);
  $("new-password-form")?.addEventListener("submit", updatePassword);
  $("product-form")?.addEventListener("submit", handleListingSubmit);
  $("settings-form")?.addEventListener("submit", saveSettings);

  $("clear-cart-button")?.addEventListener("click", clearCart);
  $("place-order-button")?.addEventListener("click", startOrderEnquiry);

  $("details-add-cart")?.addEventListener("click", () => {
    if (state.selectedListing) addToCart(state.selectedListing.id);
  });

  $("details-message-farmer")?.addEventListener("click", () => {
    if (!requireSignIn("message a farmer")) return;
    showPage("messages-page");
    setStatus(
      "message-status",
      "The message interface needs to be connected to the conversations and messages tables."
    );
  });

  // The separate admin screen does not grant admin rights by email alone.
  $("admin-login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus(
      "admin-login-status",
      "Administrator verification is not configured yet. Do not rely on email alone for admin access.",
      "error"
    );
  });
}

/* =========================================================
   STARTUP
   ========================================================= */

async function startApp() {
  applyTheme();
  setupEventHandlers();
  renderCart();

  await refreshSession();

  // Always start in the public marketplace.
  showPage("market-page");

  // Handle Supabase password-recovery sessions.
  const hash = window.location.hash;

  if (hash.includes("type=recovery")) {
    showPage("auth-page");
    $("auth-form").hidden = true;
    $("recovery-panel").hidden = true;
    $("new-password-panel").hidden = false;
  }

  // Keep the account UI current when authentication changes.
  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    updateAccountUI();

    if (state.user) {
      loadListings();
    }
  });

  await loadListings();
  updateSubcategories();

  console.info("ShambaMarket app started.");
}

startApp().catch((error) => {
  console.error("ShambaMarket failed to start:", error);
  notify("The app could not start. Check the browser console.", "error");
});
