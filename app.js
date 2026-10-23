
import { supabase } from "./supabase-config.js";

/* =========================================
   SHAMBAMARKET — MAIN APPLICATION
   Authentication, slideshow, marketplace,
   categories, farmer listings and settings
========================================= */

const CATEGORIES = [
  "Fruits",
  "Vegetables",
  "Nuts",
  "Starchy Foods",
  "Grains",
  "Cereals",
  "Legumes",
  "Spices",
  "Herbal Products"
];

const AUTH_IMAGES = [
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1500&q=85",
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1500&q=85",
  "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1500&q=85"
];

let currentUser = null;
let currentProfile = null;
let allListings = [];
let selectedCategory = "All Categories";
let uploadedPhotoUrl = "";
let slideshowTimer = null;
let authMode = "login";

const $ = (selector, parent = document) =>
  parent.querySelector(selector);

const $$ = (selector, parent = document) =>
  [...parent.querySelectorAll(selector)];

function getValue(id) {
  return $(`#${id}`)?.value?.trim() || "";
}

function setText(id, value) {
  const element = $(`#${id}`);
  if (element) element.textContent = value ?? "";
}

function setStatus(id, message, isError = false) {
  const element = $(`#${id}`);
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", isError);
  element.setAttribute("role", "status");
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

/* =========================================
   LOGIN / SIGN-UP SLIDESHOW
========================================= */

function setupAuthSlideshow() {
  const panel = $(".auth-photo");
  if (!panel) return;

  if (slideshowTimer) {
    clearInterval(slideshowTimer);
  }

  let index = 0;

  // Add the initial image immediately.
  panel.style.backgroundImage = `
    linear-gradient(
      0deg,
      rgba(28, 42, 20, 0.88),
      rgba(42, 58, 29, 0.10) 85%
    ),
    url("${AUTH_IMAGES[0]}")
  `;

  // Preload images to reduce loading delays.
  AUTH_IMAGES.forEach((src) => {
    const image = new Image();
    image.src = src;
  });

  // Rotate the background every five seconds.
  slideshowTimer = setInterval(() => {
    index = (index + 1) % AUTH_IMAGES.length;

    panel.style.backgroundImage = `
      linear-gradient(
        0deg,
        rgba(28, 42, 20, 0.88),
        rgba(42, 58, 29, 0.10) 85%
      ),
      url("${AUTH_IMAGES[index]}")
    `;
  }, 5000);
}

/* =========================================
   AUTHENTICATION SCREEN
========================================= */

function setAuthMode(mode) {
  authMode = mode;

  const isSignup = mode === "signup";

  const signupFields = $("#signup-fields");
  const authTitle = $("#auth-title");
  const authDescription = $("#auth-description");
  const submitButton = $("#auth-submit");

  if (signupFields) {
    signupFields.hidden = !isSignup;
  }

  if (authTitle) {
    authTitle.textContent = isSignup
      ? "Create your account"
      : "Welcome back";
  }

  if (authDescription) {
    authDescription.textContent = isSignup
      ? "Join SHAMBAMARKET and connect with local farmers."
      : "Sign in to discover fresh farm products.";
  }

  if (submitButton) {
    submitButton.textContent = isSignup
      ? "Create Account"
      : "Sign In";
  }

  const showLogin = $("#show-login");
  const showSignup = $("#show-signup");

  showLogin?.classList.toggle("active", !isSignup);
  showSignup?.classList.toggle("active", isSignup);

  if ($("#auth-password")) {
    $("#auth-password").autocomplete = isSignup
      ? "new-password"
      : "current-password";
  }

  setStatus("auth-status", "");
}

async function getOrCreateProfile(user, fallback = {}) {
  const { data: existingProfile, error: readError } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

  if (readError) throw readError;

  if (existingProfile) {
    return existingProfile;
  }

  const profile = {
    id: user.id,
    name:
      fallback.name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Farmer",
    email: user.email || "",
    role: fallback.role ||
      user.user_metadata?.role ||
      "customer",
    phone: fallback.phone ||
      user.user_metadata?.phone ||
      ""
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(profile)
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const email = getValue("auth-email").toLowerCase();
  const password = $("#auth-password")?.value || "";

  if (!email || !password) {
    setStatus("auth-status", "Enter your email and password.", true);
    return;
  }

  const submitButton = $("#auth-submit");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Please wait...";
  }

  setStatus("auth-status", "");

  try {
    if (authMode === "signup") {
      const name = getValue("auth-name");
      const role = getValue("auth-role") || "customer";
      const phone = getValue("farmer-phone");

      if (!name) {
        throw new Error("Please enter your name.");
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role,
            phone
          }
        }
      });

      if (error) throw error;

      // Email confirmation may be required by Supabase.
      if (data.user && data.session) {
        currentUser = data.user;
        currentProfile = await getOrCreateProfile(data.user, {
          name,
          role,
          phone
        });

        await startApp();
        showToast("Your account has been created!");
      } else {
        setStatus(
          "auth-status",
          "Account created! Check your email to confirm your account, then sign in."
        );
        setAuthMode("login");
      }
    } else {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      currentUser = data.user;
      currentProfile = await getOrCreateProfile(data.user);

      await startApp();
      showToast("Welcome back!");
    }
  } catch (error) {
    console.error("Authentication error:", error);
    setStatus(
      "auth-status",
      error.message || "Unable to authenticate. Please try again.",
      true
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        authMode === "signup" ? "Create Account" : "Sign In";
    }
  }
}

/* =========================================
   SCREEN NAVIGATION
========================================= */

function showPage(pageName) {
  $$(".app-page").forEach((page) => {
    page.hidden = !page.classList.contains(pageName);
  });

  // Also support pages identified by data-page.
  $$("[data-page]").forEach((page) => {
    if (page.classList.contains("nav-link")) return;

    page.hidden = page.dataset.page !== pageName;
  });

  $$(".nav-link").forEach((link) => {
    link.classList.toggle(
      "active",
      link.dataset.page === pageName
    );
  });

  if (pageName === "farmer") {
    loadFarmerListings();
  }

  if (pageName === "market") {
    loadListings();
  }
}

function setupNavigation() {
  $$(".nav-link[data-page]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();

      const page = link.dataset.page;
      if (page) showPage(page);
    });
  });
}

/* =========================================
   CATEGORY FILTERS
========================================= */

function setupCategories() {
  const categoryList = $("#category-list");
  const productCategory = $("#product-category");

  if (categoryList) {
    categoryList.replaceChildren();

    const categories = ["All Categories", ...CATEGORIES];

    categories.forEach((category) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "category-chip";
      button.textContent = category;

      if (category === selectedCategory) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => {
        selectedCategory = category;

        $$(".category-chip", categoryList).forEach((chip) => {
          chip.classList.toggle(
            "active",
            chip.textContent === category
          );
        });

        renderListings();
      });

      categoryList.appendChild(button);
    });
  }

  if (productCategory) {
    productCategory.replaceChildren();

    // Only real product categories appear in the farmer form.
    CATEGORIES.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      productCategory.appendChild(option);
    });
  }
}

/* =========================================
   MARKETPLACE LISTINGS
========================================= */

async function loadListings() {
  setStatus("market-status", "Loading products...");

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load listings:", error);
    setStatus(
      "market-status",
      "Could not load products. Check your database permissions.",
      true
    );
    allListings = [];
    renderListings();
    return;
  }

  allListings = data || [];

  setStatus(
    "market-status",
    allListings.length
      ? `${allListings.length} product listing(s) available`
      : "No products have been listed yet."
  );

  renderListings();
}

function getFilteredListings() {
  const search = (getValue("search-input")).toLowerCase();
  const county = getValue("county-filter").toLowerCase();
  const sort = getValue("sort-products");

  let results = [...allListings];

  if (selectedCategory !== "All Categories") {
    results = results.filter(
      (item) => item.category === selectedCategory
    );
  }

  if (search) {
    results = results.filter((item) => {
      const searchable = [
        item.product_name,
        item.category,
        item.county,
        item.town,
        item.farmer_name,
        item.description
      ].join(" ").toLowerCase();

      return searchable.includes(search);
    });
  }

  if (county) {
    results = results.filter(
      (item) => (item.county || "").toLowerCase() === county
    );
  }

  if (sort === "price-low") {
    results.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sort === "price-high") {
    results.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    results.sort(
      (a, b) =>
        new Date(b.created_at || 0) -
        new Date(a.created_at || 0)
    );
  }

  return results;
}

function renderListings() {
  const productList = $("#product-list");
  if (!productList) return;

  const listings = getFilteredListings();
  productList.replaceChildren();

  const summary = $("#listing-summary");
  if (summary) {
    summary.textContent =
      `${listings.length} product${listings.length === 1 ? "" : "s"} found`;
  }

  const emptyMessage = $("#empty-message");
  if (emptyMessage) {
    emptyMessage.hidden = listings.length > 0;
  }

  listings.forEach((item) => {
    const card = document.createElement("article");
    card.className = "product-card";

    const photo = item.photo_url
      ? `<img class="product-photo" src="${escapeHTML(item.photo_url)}" alt="${escapeHTML(item.product_name)}" loading="lazy">`
      : `<div class="product-photo product-photo-placeholder" role="img" aria-label="No product photo">🌿</div>`;

    card.innerHTML = `
      ${photo}
      <div class="product-body">
        <span class="product-category-label">
          ${escapeHTML(item.category || "Other")}
        </span>

        <h3>${escapeHTML(item.product_name)}</h3>

        <p class="product-price">
          ${formatPrice(item.price)}
          <small>/ ${escapeHTML(item.unit || "item")}</small>
        </p>

        <p class="product-meta">
          Quantity: ${escapeHTML(item.quantity ?? 1)} ${escapeHTML(item.unit || "")}
        </p>

        <p class="product-meta">
          📍 ${escapeHTML([item.town, item.county].filter(Boolean).join(", ") || "Location not provided")}
        </p>

        <p class="product-meta">
          Farmer: ${escapeHTML(item.farmer_name || "Local farmer")}
        </p>

        <p class="product-description">
          ${escapeHTML(item.description || "Contact the farmer for more details.")}
        </p>

        <div class="product-actions">
          <button type="button" class="button contact-farmer">
            Contact Farmer
          </button>
        </div>
      </div>
    `;

    const contactButton = $(".contact-farmer", card);

    contactButton.addEventListener("click", () => {
      const phone = String(item.phone || "").replace(/[^\d+]/g, "");

      if (!phone) {
        showToast("This farmer has not provided a phone number.");
        return;
      }

      // Open WhatsApp with a prefilled product enquiry.
      const message = `Hello, I am interested in your ${item.product_name} listed on SHAMBAMARKET.`;
      const whatsappUrl =
        `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    });

    productList.appendChild(card);
  });
}

function setupMarketFilters() {
  ["search-input", "county-filter", "sort-products"].forEach((id) => {
    const element = $(`#${id}`);
    if (!element) return;

    const eventName = element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, renderListings);
  });
}

/* =========================================
   PRODUCT PHOTO PREVIEW AND UPLOAD
========================================= */

function setupPhotoPreview() {
  const photoInput = $("#product-photo");
  if (!photoInput) return;

  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    const preview = $("#photo-preview");

    uploadedPhotoUrl = "";

    if (!file) {
      if (preview) {
        preview.hidden = true;
        preview.removeAttribute("src");
      }
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file.");
      photoInput.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Please choose an image smaller than 5 MB.");
      photoInput.value = "";
      return;
    }

    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    }
  });
}

async function uploadProductPhoto(file) {
  if (!file) return "";

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
  const filePath =
    `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await supabase.storage
    .from("product-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("product-photos")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/* =========================================
   CREATE A FARMER LISTING
========================================= */

async function handleProductSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    showToast("Please sign in before publishing a product.");
    return;
  }

  const productName = getValue("product-name");
  const category = getValue("product-category");
  const price = Number(getValue("product-price"));
  const quantity = Number(getValue("product-quantity"));

  if (!productName || !CATEGORIES.includes(category)) {
    setStatus(
      "farmer-status",
      "Enter a product name and select a valid category.",
      true
    );
    return;
  }

  if (
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    setStatus(
      "farmer-status",
      "Enter a valid price and a quantity greater than zero.",
      true
    );
    return;
  }

  const button = $("#publish-button");
  if (button) {
    button.disabled = true;
    button.textContent = "Publishing...";
  }

  setStatus("farmer-status", "Publishing your listing...");

  try {
    const file = $("#product-photo")?.files?.[0];
    const photoUrl = await uploadProductPhoto(file);

    const listing = {
      owner_id: currentUser.id,
      product_name: productName,
      category,
      price,
      quantity,
      unit: getValue("product-unit") || "kg",
      condition: getValue("product-condition") || "Fresh",
      county: getValue("product-county"),
      town: getValue("product-town"),
      farmer_name:
        currentProfile?.name ||
        currentUser.user_metadata?.name ||
        currentUser.email?.split("@")[0] ||
        "Farmer",
      phone:
        currentProfile?.phone ||
        currentUser.user_metadata?.phone ||
        "",
      photo_url: photoUrl,
      description: getValue("product-description")
    };

    const { error } = await supabase
      .from("listings")
      .insert(listing);

    if (error) throw error;

    $("#product-form")?.reset();

    const preview = $("#photo-preview");
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute("src");
    }

    uploadedPhotoUrl = "";

    setStatus("farmer-status", "Product published successfully!");
    showToast("Your product is now listed.");

    await loadListings();
    await loadFarmerListings();
  } catch (error) {
    console.error("Listing error:", error);

    setStatus(
      "farmer-status",
      error.message ||
        "Could not publish the listing. Check your database permissions.",
      true
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Publish Product";
    }
  }
}

/* =========================================
   FARMER'S OWN LISTINGS
========================================= */

async function loadFarmerListings() {
  const container = $("#farmer-listings");
  if (!container || !currentUser) return;

  container.replaceChildren();

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("owner_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Farmer listings error:", error);
    setStatus(
      "farmer-status",
      "Could not load your listings. Check your database permissions.",
      true
    );
    return;
  }

  if (!data?.length) {
    container.textContent = "You have not published any products yet.";
    return;
  }

  data.forEach((item) => {
    const row = document.createElement("article");
    row.className = "farmer-listing";

    row.innerHTML = `
      <div>
        <strong>${escapeHTML(item.product_name)}</strong>
        <p>${escapeHTML(item.category)} · ${formatPrice(item.price)}</p>
        <small>${escapeHTML(item.county || "Location not set")}</small>
      </div>
      <button type="button" class="button delete-listing">
        Delete
      </button>
    `;

    $(".delete-listing", row).addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Delete "${item.product_name}"?`
      );

      if (!confirmed) return;

      const { error: deleteError } = await supabase
        .from("listings")
        .delete()
        .eq("id", item.id)
        .eq("owner_id", currentUser.id);

      if (deleteError) {
        console.error(deleteError);
        showToast("Could not delete the listing.");
        return;
      }

      showToast("Listing deleted.");
      await loadListings();
      await loadFarmerListings();
    });

    container.appendChild(row);
  });
}

/* =========================================
   ACCOUNT DETAILS AND THEME
========================================= */

function updateAccountDetails() {
  const name =
    currentProfile?.name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email ||
    "Account";

  setText("account-label", name);
  setText("farmer-name", name);

  const role = currentProfile?.role ||
    currentUser?.user_metadata?.role ||
    "customer";

  // Only show the farmer navigation to farmer accounts.
  $$('[data-page="farmer"]').forEach((element) => {
    if (element.classList.contains("nav-link")) {
      element.hidden = role !== "farmer";
    }
  });

  const phoneInput = $("#farmer-phone");

  if (
    phoneInput &&
    phoneInput.tagName === "INPUT" &&
    !phoneInput.value
  ) {
    phoneInput.value =
      currentProfile?.phone ||
      currentUser?.user_metadata?.phone ||
      "";
  }
}

function setupTheme() {
  const toggle = $("#theme-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");

    const enabled = document.body.classList.contains("dark-theme");
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled ? "Light Mode" : "Dark Mode";
  });
}

async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Sign-out error:", error);
    showToast("Could not sign out. Please try again.");
    return;
  }

  currentUser = null;
  currentProfile = null;
  allListings = [];

  showAuthScreen();
}

function showAuthScreen() {
  const authPage = $("#auth-page");
  const appShell = $("#app-shell");

  if (authPage) authPage.hidden = false;
  if (appShell) appShell.hidden = true;

  setAuthMode("login");
  setupAuthSlideshow();
}

async function startApp() {
  const authPage = $("#auth-page");
  const appShell = $("#app-shell");

  if (authPage) authPage.hidden = true;
  if (appShell) appShell.hidden = false;

  updateAccountDetails();
  await loadListings();

  const role = currentProfile?.role ||
    currentUser?.user_metadata?.role ||
    "customer";

  showPage(role === "farmer" ? "farmer" : "market");
}

/* =========================================
   EVENT LISTENERS AND STARTUP
========================================= */

function setupEventListeners() {
  $("#auth-form")?.addEventListener("submit", handleAuthSubmit);

  $("#show-login")?.addEventListener("click", (event) => {
    event.preventDefault();
    setAuthMode("login");
  });

  $("#show-signup")?.addEventListener("click", (event) => {
    event.preventDefault();
    setAuthMode("signup");
  });

  $("#logout-button")?.addEventListener("click", signOut);
  $("#settings-logout")?.addEventListener("click", signOut);

  $("#product-form")?.addEventListener(
    "submit",
    handleProductSubmit
  );

  setupNavigation();
  setupMarketFilters();
  setupPhotoPreview();
  setupTheme();
}

async function init() {
  const year = $("#current-year");
  if (year) year.textContent = new Date().getFullYear();

  setupCategories();
  setupEventListeners();
  setupAuthSlideshow();

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    currentUser = data.session?.user || null;

    if (currentUser) {
      currentProfile = await getOrCreateProfile(currentUser);
      await startApp();
    } else {
      showAuthScreen();
    }

    // Keep the interface updated if authentication changes.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        showAuthScreen();
      }
    });
  } catch (error) {
    console.error("Startup error:", error);
    showAuthScreen();
    setStatus(
      "auth-status",
      "Could not connect to SHAMBAMARKET. Check your Supabase configuration and internet connection.",
      true
    );
  }
}

init();
