
import { supabase } from "./supabase-config.js";

/* =========================================================
   SHAMBAMARKET
   Supabase + existing public.listings table
   ========================================================= */

const TABLE = "listings";

const CATEGORIES = {
  "Fresh Produce": ["Fruits", "Vegetables", "Nuts"],
  "Crops & Grains": [
    "Starchy Foods",
    "Grains",
    "Cereals",
    "Legumes",
    "Spices",
    "Herbal Products"
  ],
  "Farm Tools & Equipment": [
    "Hand Tools",
    "Sprayers",
    "Irrigation Equipment",
    "Tractors",
    "Farm Machinery"
  ],
  "Agricultural Inputs & Fertilizers": [
    "Seeds",
    "Seedlings",
    "Fertilizers",
    "Compost & Manure",
    "Crop Protection",
    "Animal Feed"
  ],
  "Livestock & Poultry": [
    "Cattle",
    "Goats",
    "Sheep",
    "Pigs",
    "Chickens",
    "Ducks",
    "Turkeys",
    "Rabbits",
    "Other Livestock"
  ],
  "Animal & Farm Products": [
    "Milk",
    "Eggs",
    "Honey",
    "Wool",
    "Hides & Skins",
    "Processed Farm Products"
  ],
  "Farm Services": [
    "Tractor Hire",
    "Ploughing",
    "Planting",
    "Harvesting",
    "Transport",
    "Irrigation Installation",
    "Agricultural Consulting"
  ]
};

const COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet",
  "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega",
  "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu",
  "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni",
  "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a",
  "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River",
  "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu",
  "Vihiga", "Wajir", "West Pokot"
];

const state = {
  user: null,
  listings: [],
  filtered: [],
  cart: new Map(),
  category: "",
  search: "",
  county: "",
  sort: "newest",
  busy: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function message(text, type = "info") {
  let box = $("#app-status");

  if (!box) {
    box = document.createElement("div");
    box.id = "app-status";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.prepend(box);
  }

  box.textContent = text;
  box.dataset.type = type;
  box.style.cssText =
    "padding:10px 16px;margin:8px;border-radius:8px;" +
    "font-size:14px;position:relative;z-index:20;";

  if (type === "error") {
    box.style.background = "#ffe4e1";
    box.style.color = "#8b1e18";
  } else {
    box.style.background = "#e4f5ed";
    box.style.color = "#153322";
  }
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price on request";

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(amount);
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function safePhotoURL(value) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch (_) {}

  return "";
}

function setBusy(button, busy, busyText = "Please wait...") {
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

function showPage(pageId) {
  const pages = $$(".app-page");

  if (pages.length) {
    pages.forEach(page => {
      page.hidden = page.id !== pageId;
    });
  } else {
    // Compatible with the existing inline helper in index.html.
    if (window.shambaUI?.showPage) {
      window.shambaUI.showPage(pageId);
    } else if (window.shambaUI?.showSection) {
      window.shambaUI.showSection(pageId);
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAuth(mode = "login") {
  if (window.shambaUI?.openAuth) {
    window.shambaUI.openAuth(mode);
  } else {
    showPage("auth-page");
  }

  const loginForm = $("#login-form");
  const signupForm = $("#signup-form");

  if (loginForm) loginForm.hidden = mode !== "login";
  if (signupForm) signupForm.hidden = mode !== "signup";

  const email = $("#login-email") || $("#signup-email");
  if (email && mode === "login") email.focus();
}

function requireLogin(action = "continue") {
  if (state.user) return true;

  message(`Please sign in to ${action}.`);
  openAuth("login");
  return false;
}

/* ---------------- PUBLIC LISTINGS ---------------- */

function listingIsPublic(item) {
  // The current table has a status field. Only show published rows.
  // This avoids exposing draft or rejected listings in the marketplace.
  return String(item.status || "").toLowerCase() === "published";
}

function listingText(item) {
  return [
    item.product_name,
    item.category,
    item.subcategory,
    item.description,
    item.county,
    item.town,
    item.farmer_name
  ].filter(Boolean).join(" ").toLowerCase();
}

function getListingCard(item) {
  const id = String(item.id);
  const photo = safePhotoURL(item.photo_url);
  const image = photo
    ? `<img class="listing-image" src="${escapeHTML(photo)}" alt="${escapeHTML(item.product_name || "Farm product")}" loading="lazy">`
    : `<div class="listing-image listing-image-placeholder" aria-label="No photo available">🌱</div>`;

  const place = [item.town, item.county].filter(Boolean).join(", ");
  const quantity = item.quantity != null
    ? `${escapeHTML(item.quantity)} ${escapeHTML(item.unit || "")}`.trim()
    : "";

  return `
    <article class="product-card" data-listing-id="${escapeHTML(id)}">
      ${image}
      <div class="product-card-content">
        <p class="product-category">${escapeHTML(item.subcategory || item.category || "Farm product")}</p>
        <h3>${escapeHTML(item.product_name || "Untitled listing")}</h3>
        <p class="product-price">${money(item.price)}</p>
        ${quantity ? `<p class="product-quantity">${quantity} available</p>` : ""}
        ${place ? `<p class="product-location">📍 ${escapeHTML(place)}</p>` : ""}
        <p class="product-farmer">${escapeHTML(item.farmer_name || "Local farmer")}</p>
        <button type="button" data-action="details" data-id="${escapeHTML(id)}">View details</button>
        <button type="button" data-action="add-cart" data-id="${escapeHTML(id)}">Add to cart</button>
      </div>
    </article>
  `;
}

function findListing(id) {
  return state.listings.find(item => String(item.id) === String(id));
}

function renderListings() {
  const host =
    $("#products-grid") ||
    $("#product-list") ||
    $("#listings-grid") ||
    $("#listings-container");

  if (!host) {
    console.warn(
      "ShambaMarket: no product grid found. Check the product container ID in index.html."
    );
    return;
  }

  let rows = [...state.listings];

  if (state.category) {
    rows = rows.filter(item =>
      [item.category, item.subcategory].some(value =>
        String(value || "").toLowerCase() === state.category.toLowerCase()
      )
    );
  }

  if (state.county) {
    rows = rows.filter(item =>
      String(item.county || "").toLowerCase() === state.county.toLowerCase()
    );
  }

  if (state.search) {
    rows = rows.filter(item => listingText(item).includes(state.search));
  }

  if (state.sort === "price-low") {
    rows.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (state.sort === "price-high") {
    rows.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    rows.sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at));
  }

  state.filtered = rows;

  const count = $("#results-count");
  if (count) {
    count.textContent = `${rows.length} listing${rows.length === 1 ? "" : "s"} found`;
  }

  host.innerHTML = rows.length
    ? rows.map(getListingCard).join("")
    : `<div class="empty-state">
         <h3>No listings found</h3>
         <p>Try another search or category, or check back later.</p>
       </div>`;
}

async function loadListings() {
  const host =
    $("#products-grid") ||
    $("#product-list") ||
    $("#listings-grid") ||
    $("#listings-container");

  if (host) {
    host.innerHTML = "<p>Loading farm listings...</p>";
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, product_name, category, subcategory, price, status, owner_id, quantity, photo_url, created_at, phone, farmer_name, town, county, description, unit")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("ShambaMarket listing load failed:", error);
    if (host) {
      host.innerHTML = `
        <div class="empty-state">
          <h3>Listings could not be loaded</h3>
          <p>Check Supabase table access and public SELECT policies.</p>
        </div>`;
    }
    message(`Could not load listings: ${error.message}`, "error");
    return;
  }

  // Filter published listings in the browser as a second display check.
  // Database RLS must also protect private rows.
  state.listings = (data || []).filter(listingIsPublic);
  renderListings();
}

/* ---------------- CATEGORIES AND FILTERS ---------------- */

function setupCategoryButtons() {
  $$("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category || "";
      renderListings();
      showPage("market-page");
    });
  });

  const select = $("#category-filter");
  if (select && !select.options.length) {
    select.add(new Option("All categories", ""));

    Object.entries(CATEGORIES).forEach(([department, subcategories]) => {
      const group = document.createElement("optgroup");
      group.label = department;

      subcategories.forEach(category => {
        group.append(new Option(category, category));
      });

      select.append(group);
    });
  }

  if (select) {
    select.addEventListener("change", () => {
      state.category = select.value;
      renderListings();
    });
  }

  const department = $("#product-category");
  const subcategory = $("#product-subcategory");

  if (department && subcategory) {
    const populate = () => {
      const choices = CATEGORIES[department.value] || [];
      subcategory.replaceChildren(new Option("Choose a subcategory", ""));

      choices.forEach(value => {
        subcategory.add(new Option(value, value));
      });
    };

    department.addEventListener("change", populate);
    populate();
  }
}

function setupFilters() {
  const search = $("#product-search") || $("#search-input");
  const county = $("#county-filter");
  const sort = $("#sort-filter");

  if (search) {
    search.addEventListener("input", () => {
      state.search = search.value.trim().toLowerCase();
      renderListings();
    });
  }

  if (county) {
    if (!county.options.length) {
      county.add(new Option("All counties", ""));
      COUNTIES.forEach(name => county.add(new Option(name, name)));
    }

    county.addEventListener("change", () => {
      state.county = county.value;
      renderListings();
    });
  }

  if (sort) {
    sort.addEventListener("change", () => {
      state.sort = sort.value;
      renderListings();
    });
  }
}

/* ---------------- LISTING DETAILS ---------------- */

function showListingDetails(id) {
  const item = findListing(id);
  if (!item) return;

  const host = $("#product-details-content") || $("#product-details");
  if (!host) {
    message(
      `${item.product_name} — ${money(item.price)}. ${item.description || ""}`
    );
    return;
  }

  const photo = safePhotoURL(item.photo_url);
  const phone = String(item.phone || "").replace(/[^\d+]/g, "");
  const phoneLink = phone
    ? `<a href="tel:${escapeHTML(phone)}">Call farmer</a>`
    : "";
  const whatsappNumber = phone.replace(/\D/g, "");
  const whatsapp = whatsappNumber
    ? `<a href="https://wa.me/${escapeHTML(whatsappNumber)}" target="_blank" rel="noopener noreferrer">WhatsApp farmer</a>`
    : "";

  host.innerHTML = `
    ${photo ? `<img class="details-image" src="${escapeHTML(photo)}" alt="${escapeHTML(item.product_name)}">` : ""}
    <h2>${escapeHTML(item.product_name)}</h2>
    <p>${escapeHTML(item.category || "")}${item.subcategory ? " · " + escapeHTML(item.subcategory) : ""}</p>
    <h3>${money(item.price)}</h3>
    <p>${escapeHTML(item.description || "No description provided.")}</p>
    <p>Quantity: ${escapeHTML(item.quantity ?? "Ask farmer")} ${escapeHTML(item.unit || "")}</p>
    <p>Farmer: ${escapeHTML(item.farmer_name || "Local farmer")}</p>
    <p>${escapeHTML([item.town, item.county].filter(Boolean).join(", "))}</p>
    <div class="details-contact">${phoneLink} ${whatsapp}</div>
    <button type="button" data-action="add-cart" data-id="${escapeHTML(item.id)}">Add to cart</button>
    <button type="button" data-action="message-farmer" data-id="${escapeHTML(item.id)}">Contact farmer</button>
  `;

  showPage("product-details-page");
}

/* ---------------- CART ---------------- */

function addToCart(id) {
  if (!requireLogin("use the cart")) return;

  const item = findListing(id);
  if (!item) return;

  const key = String(item.id);
  const current = state.cart.get(key) || { item, quantity: 0 };

  current.quantity += 1;
  state.cart.set(key, current);
  renderCart();

  message(`${item.product_name} added to your cart.`);
}

function renderCart() {
  const host = $("#cart-items");
  if (!host) return;

  if (!state.cart.size) {
    host.innerHTML = "<p>Your cart is empty.</p>";
  } else {
    host.innerHTML = [...state.cart.values()].map(({ item, quantity }) => `
      <div class="cart-item">
        <span>${escapeHTML(item.product_name)} × ${quantity}</span>
        <strong>${money(Number(item.price) * quantity)}</strong>
        <button type="button" data-action="remove-cart" data-id="${escapeHTML(item.id)}">Remove</button>
      </div>
    `).join("");
  }

  const total = [...state.cart.values()].reduce(
    (sum, entry) => sum + (Number(entry.item.price) || 0) * entry.quantity,
    0
  );

  const totalHost = $("#cart-total");
  if (totalHost) totalHost.textContent = money(total);
}

function removeFromCart(id) {
  state.cart.delete(String(id));
  renderCart();
}

/* ---------------- AUTHENTICATION ---------------- */

function setupPasswordToggles() {
  $$("[data-toggle-password]").forEach(button => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.togglePassword);
      if (!target) return;

      const reveal = target.type === "password";
      target.type = reveal ? "text" : "password";
      button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
      button.textContent = reveal ? "Hide" : "Show";
    });
  });
}

function updateAuthUI() {
  const user = state.user;

  $$("[data-auth-required]").forEach(element => {
    element.hidden = !user;
  });

  $$("[data-auth-guest]").forEach(element => {
    element.hidden = Boolean(user);
  });

  const name = user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "";

  const nameHost = $("#current-user-name");
  if (nameHost) nameHost.textContent = name;

  const emailHost = $("#current-user-email");
  if (emailHost) emailHost.textContent = user?.email || "";

  const signInButton = $("#login-button");
  if (signInButton) signInButton.hidden = Boolean(user);

  const signOutButton = $("#logout-button");
  if (signOutButton) signOutButton.hidden = !user;
}

async function refreshSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Could not read Supabase session:", error);
    state.user = null;
  } else {
    state.user = data.session?.user || null;
  }

  updateAuthUI();
}

function setupAuthForms() {
  const login = $("#login-form");
  const signup = $("#signup-form");

  if (login) {
    login.addEventListener("submit", async event => {
      event.preventDefault();

      const email = ($("#login-email")?.value || "").trim();
      const password = $("#login-password")?.value || "";
      const button = $('button[type="submit"]', login);

      if (!email || !password) {
        message("Enter your email and password.", "error");
        return;
      }

      setBusy(button, true, "Signing in...");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      setBusy(button, false);

      if (error) {
        message(error.message, "error");
        return;
      }

      state.user = data.user;
      updateAuthUI();
      message("You're signed in.");
      await loadListings();
      showPage("market-page");
    });
  }

  if (signup) {
    signup.addEventListener("submit", async event => {
      event.preventDefault();

      const name =
        ($("#signup-name")?.value || $("#signup-full-name")?.value || "").trim();
      const email = ($("#signup-email")?.value || "").trim();
      const password = $("#signup-password")?.value || "";
      const button = $('button[type="submit"]', signup);

      if (!email || !password) {
        message("Enter an email and password.", "error");
        return;
      }

      if (password.length < 8) {
        message("Use a password with at least 8 characters.", "error");
        return;
      }

      setBusy(button, true, "Creating account...");

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      setBusy(button, false);

      if (error) {
        message(error.message, "error");
        return;
      }

      if (data.session) {
        state.user = data.user;
        updateAuthUI();
        message("Account created successfully.");
        await loadListings();
        showPage("market-page");
      } else {
        message("Check your email to confirm your account before signing in.");
      }
    });
  }

  const logout = $("#logout-button");
  if (logout) {
    logout.addEventListener("click", async () => {
      const { error } = await supabase.auth.signOut();

      if (error) {
        message(error.message, "error");
        return;
      }

      state.user = null;
      state.cart.clear();
      updateAuthUI();
      renderCart();
      message("You have signed out.");
      showPage("market-page");
    });
  }

  const forgot = $("#forgot-password-form");
  if (forgot) {
    forgot.addEventListener("submit", async event => {
      event.preventDefault();

      const email = ($("#forgot-email")?.value || "").trim();
      if (!email) {
        message("Enter your account email.", "error");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });

      if (error) {
        message(error.message, "error");
      } else {
        message("If the account exists, a password recovery email has been sent.");
      }
    });
  }

  const reset = $("#new-password-form");
  if (reset) {
    reset.addEventListener("submit", async event => {
      event.preventDefault();

      const password = ($("#new-password")?.value || "");
      if (password.length < 8) {
        message("Use a password with at least 8 characters.", "error");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        message(error.message, "error");
      } else {
        message("Password updated. You can continue using ShambaMarket.");
        showPage("market-page");
      }
    });
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    updateAuthUI();
  });

  setupPasswordToggles();
}

/* ---------------- FARMER LISTING FORM ---------------- */

function setupListingForm() {
  const form = $("#farmer-listing-form") || $("#listing-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!requireLogin("publish a listing")) return;

    const get = id => document.getElementById(id);
    const productName = (
      get("product-name")?.value ||
      get("listing-name")?.value ||
      ""
    ).trim();

    const category = (
      get("product-category")?.value ||
      get("listing-category")?.value ||
      ""
    ).trim();

    const subcategory = (get("product-subcategory")?.value || "").trim();
    const priceRaw = get("product-price")?.value || get("listing-price")?.value;
    const quantityRaw = get("product-quantity")?.value || get("listing-quantity")?.value;
    const unit = (get("product-unit")?.value || get("listing-unit")?.value || "").trim();
    const county = (get("product-county")?.value || get("listing-county")?.value || "").trim();
    const town = (get("product-town")?.value || get("listing-town")?.value || "").trim();
    const description = (get("product-description")?.value || get("listing-description")?.value || "").trim();
    const phone = (get("product-phone")?.value || get("listing-phone")?.value || "").trim();

    const price = Number(priceRaw);
    const quantity = quantityRaw === "" || quantityRaw == null
      ? null
      : Number(quantityRaw);

    if (!productName || !category || priceRaw === "" || !Number.isFinite(price) || price < 0) {
      message("Enter a product name, category, and valid price.", "error");
      return;
    }

    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      message("Enter a valid quantity.", "error");
      return;
    }

    // Only use columns confirmed to exist in the user's table.
    // Status defaults to draft to avoid publishing an unreviewed listing.
    const payload = {
      product_name: productName,
      category,
      subcategory: subcategory || null,
      price,
      quantity,
      unit: unit || null,
      county: county || null,
      town: town || null,
      description: description || null,
      phone: phone || null,
      farmer_name:
        state.user.user_metadata?.name ||
        state.user.user_metadata?.full_name ||
        state.user.email,
      owner_id: state.user.id,
      status: "draft"
    };

    const button = $('button[type="submit"]', form);
    setBusy(button, true, "Saving listing...");

    const { error } = await supabase.from(TABLE).insert(payload);

    setBusy(button, false);

    if (error) {
      console.error("Listing insert failed:", error);
      message(
        `Could not save listing: ${error.message}. Check the table's insert policy and allowed status values.`,
        "error"
      );
      return;
    }

    form.reset();
    message("Listing saved as a draft. It will appear publicly after it is approved and published.");
    await loadListings();
    showPage("market-page");
  });
}

/* ---------------- NAVIGATION AND CLICK ACTIONS ---------------- */

function setupNavigation() {
  $$("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const pageId = button.dataset.page;

      const protectedPage = [
        "farmer-page",
        "farmer-dashboard",
        "cart-page",
        "messages-page",
        "settings-page",
        "orders-page"
      ].includes(pageId);

      if (protectedPage && !requireLogin("open this page")) return;
      showPage(pageId);
    });
  });

  const openLogin = $("#login-button");
  if (openLogin) openLogin.addEventListener("click", () => openAuth("login"));

  const openSignup = $("#signup-button");
  if (openSignup) openSignup.addEventListener("click", () => openAuth("signup"));

  const sell = $("#hero-sell-button") || $("#sell-button");
  if (sell) {
    sell.addEventListener("click", () => {
      if (!requireLogin("sell farm products")) return;
      showPage("farmer-page");
    });
  }

  const browse = $("#browse-public-button") || $("#hero-browse-button");
  if (browse) browse.addEventListener("click", () => showPage("market-page"));

  const adminButton = $("#show-admin-login");
  if (adminButton) {
    adminButton.addEventListener("click", () => {
      message("Admin access must be assigned securely in the database. Public email addresses alone do not grant admin permissions.");
    });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    switch (button.dataset.action) {
      case "details":
        showListingDetails(id);
        break;
      case "add-cart":
        addToCart(id);
        break;
      case "remove-cart":
        removeFromCart(id);
        break;
      case "message-farmer":
        if (requireLogin("contact a farmer")) {
          message("Messaging needs the existing conversation tables and policies to be configured.");
        }
        break;
    }
  });

  // Avoid hard-coded links navigating away from the app where possible.
  $$('a[href="#market-page"], a[href="#home"]').forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      showPage("market-page");
    });
  });
}

/* ---------------- STARTUP ---------------- */

async function startApp() {
  setupCategoryButtons();
  setupFilters();
  setupAuthForms();
  setupListingForm();
  setupNavigation();
  renderCart();

  await refreshSession();
  await loadListings();

  // Keep public browsing available even without a session.
  if (!window.location.hash.includes("type=recovery")) {
    showPage("market-page");
  } else {
    const newPassword = $("#new-password-form");
    if (newPassword) showPage("auth-page");
  }

  console.info("ShambaMarket initialized using the listings table.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
