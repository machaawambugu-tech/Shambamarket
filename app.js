
import { supabase } from "./supabase-config.js";

/*
 * SHAMBAMARKET — APP CONTROLLER
 * Frontend: GitHub Pages
 * Backend: Supabase
 *
 * Important:
 * - Database Row Level Security (RLS) must be configured in Supabase.
 * - Public visitors can browse products; protected actions require sign-in.
 * - Admin permissions are checked against public.admin_users.
 * - This file never uses a Supabase secret/service-role key.
 */

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  profile: null,
  isAdmin: false,
  authMode: "login",
  products: [],
  filteredProducts: [],
  selectedProduct: null,
  cart: [],
  activeConversationId: null,
  activeFarmerId: null,
  messageSubscription: null,
  productLimit: 24
};

const CATEGORY_MAP = {
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

const COUNTY_NAMES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet",
  "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
  "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga",
  "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia",
  "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit",
  "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi",
  "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River",
  "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu",
  "Vihiga", "Wajir", "West Pokot"
];

function setStatus(id, message, isError = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message || "";
  element.style.color = isError ? "#b42318" : "";
}

function setBusy(buttonId, busy, busyText = "Please wait...") {
  const button = $(buttonId);
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function escapeText(value) {
  return String(value ?? "");
}

function formatKES(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Price on request";
  return "KES " + number.toLocaleString("en-KE", {
    maximumFractionDigits: 2
  });
}

function getProductName(product) {
  return product.product_name || product.name || "Farm listing";
}

function getProductCategory(product) {
  return product.subcategory || product.category || "Other";
}

function getProductOwnerId(product) {
  return product.owner_id || product.farmer_id || product.user_id || null;
}

function getProductImage(product) {
  return product.photo_url || product.image_url || product.image || "";
}

function showPage(pageId) {
  const pages = document.querySelectorAll(".app-page");
  let found = false;

  pages.forEach((page) => {
    const active = page.id === pageId;
    page.hidden = !active;
    if (active) found = true;
  });

  if (!found && pageId === "market-page") {
    const market = $("market-page");
    if (market) market.hidden = false;
  }

  if (pageId === "market-page") loadProducts();
  if (pageId === "cart-page") renderCart();
  if (pageId === "settings-page") renderSettings();
  if (pageId === "messages-page") loadConversations();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAuth(mode = "login", message = "") {
  state.authMode = mode;

  if (window.shambaUI?.openAuth) {
    window.shambaUI.openAuth(mode);
  } else {
    showPage("auth-page");
  }

  if ($("auth-form")) $("auth-form").hidden = false;
  if ($("recovery-panel")) $("recovery-panel").hidden = true;
  if ($("new-password-panel")) $("new-password-panel").hidden = true;

  const signup = mode === "signup";
  if ($("signup-fields")) $("signup-fields").hidden = !signup;
  if ($("signup-password-field")) $("signup-password-field").hidden = !signup;
  if ($("auth-submit")) $("auth-submit").textContent = signup ? "Create account" : "Log in";
  if ($("auth-title")) $("auth-title").textContent = signup ? "Create your account" : "Welcome back";
  if ($("show-login")) $("show-login").setAttribute("aria-pressed", String(!signup));
  if ($("show-signup")) $("show-signup").setAttribute("aria-pressed", String(signup));
  if ($("forgot-password-button")) $("forgot-password-button").hidden = signup;

  setStatus("auth-status", message);
}

function updateHeader() {
  const signedIn = Boolean(state.user);

  if ($("account-label")) {
    $("account-label").textContent = signedIn
      ? (state.profile?.name || state.user.email || "Signed in")
      : "Browsing as guest";
  }

  if ($("logout-button")) $("logout-button").hidden = !signedIn;
  if ($("header-login-button")) $("header-login-button").hidden = signedIn;

  document.querySelectorAll("[data-protected='true']").forEach((button) => {
    button.setAttribute("aria-label", signedIn
      ? button.textContent.trim()
      : `${button.textContent.trim()} — sign in required`);
  });
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    return;
  }

  // Profiles are optional for the public catalogue to work.
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .maybeSingle();

  if (error) {
    console.warn("Profile could not be loaded:", error.message);
    state.profile = {
      id: state.user.id,
      email: state.user.email,
      name: state.user.user_metadata?.name || ""
    };
    return;
  }

  state.profile = data || {
    id: state.user.id,
    email: state.user.email,
    name: state.user.user_metadata?.name || ""
  };
}

async function checkAdminRole() {
  state.isAdmin = false;
  if (!state.user) return false;

  // The admin_users table must be created and protected in Supabase.
  // Only a trusted administrator should be able to add rows to it.
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    console.warn("Admin role verification failed:", error.message);
    return false;
  }

  state.isAdmin = Boolean(data?.user_id);
  return state.isAdmin;
}

async function refreshAuthState() {
  const { data, error } = await supabase.auth.getUser();

  if (error) console.warn("Could not read current user:", error.message);

  state.user = data?.user || null;
  await loadProfile();
  updateHeader();
}

async function finishLogin() {
  await refreshAuthState();

  if (!state.user) {
    openAuth("login", "Please sign in to continue.");
    return;
  }

  await checkAdminRole();

  if ($("admin-login-page")) $("admin-login-page").hidden = true;
  if ($("admin-page")) $("admin-page").hidden = true;

  updateHeader();
  showPage("market-page");
  await loadProducts();
}

function isSignedIn() {
  return Boolean(state.user);
}

window.shambaAuth = {
  isSignedIn
};

/* -------------------- AUTHENTICATION -------------------- */

function setupAuthTabs() {
  $("show-login")?.addEventListener("click", () => openAuth("login"));
  $("show-signup")?.addEventListener("click", () => openAuth("signup"));

  $("header-login-button")?.addEventListener("click", () => openAuth("login"));

  $("logout-button")?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("Could not log out: " + error.message);
      return;
    }

    state.user = null;
    state.profile = null;
    state.isAdmin = false;
    state.activeConversationId = null;
    updateHeader();
    openAuth("login", "You have logged out.");
    showPage("market-page");
  });

  $("auth-form")?.addEventListener("submit", handleAuthSubmit);
  $("admin-login-form")?.addEventListener("submit", handleAdminLogin);
  $("recovery-form")?.addEventListener("submit", handlePasswordRecovery);
  $("new-password-form")?.addEventListener("submit", handleNewPassword);
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const email = $("auth-email")?.value.trim().toLowerCase();
  const password = $("auth-password")?.value || "";
  const signup = state.authMode === "signup";

  if (!email || !password) {
    setStatus("auth-status", "Enter your email and password.", true);
    return;
  }

  setBusy("auth-submit", true, signup ? "Creating account..." : "Signing in...");

  try {
    if (signup) {
      const name = $("auth-name")?.value.trim() || "";
      const role = $("auth-role")?.value || "customer";
      const confirmPassword = $("signup-password-confirm")?.value || "";

      if (!name) throw new Error("Enter your full name.");
      if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
      if (password !== confirmPassword) throw new Error("Your passwords do not match.");

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.href.split("#")[0],
          data: {
            name,
            account_type: ["farmer", "customer"].includes(role) ? role : "customer"
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        state.user = data.user;
        await loadProfile();
        updateHeader();
        await finishLogin();
        setStatus("auth-status", "Account created successfully.");
      } else {
        setStatus(
          "auth-status",
          "Account created. Check your email for the confirmation link before signing in."
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      await finishLogin();
      setStatus("auth-status", "Signed in successfully.");
    }
  } catch (error) {
    setStatus("auth-status", error.message || "Authentication failed.", true);
  } finally {
    setBusy("auth-submit", false);
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const email = $("admin-email")?.value.trim().toLowerCase();
  const password = $("admin-password")?.value || "";

  if (!email || !password) {
    setStatus("admin-login-status", "Enter your administrator email and password.", true);
    return;
  }

  setBusy("admin-login-submit", true, "Verifying access...");

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await refreshAuthState();
    const authorised = await checkAdminRole();

    if (!authorised) {
      await supabase.auth.signOut();
      state.user = null;
      state.profile = null;
      state.isAdmin = false;
      updateHeader();
      throw new Error(
        "This account has not been granted administrator access. Ask the project owner to verify its role."
      );
    }

    $("admin-login-page").hidden = true;
    $("admin-page").hidden = false;
    $("admin-status").textContent = "Administrator role verified.";
    await loadAdminOverview();
  } catch (error) {
    setStatus("admin-login-status", error.message || "Administrator sign-in failed.", true);
  } finally {
    setBusy("admin-login-submit", false);
  }
}

async function handlePasswordRecovery(event) {
  event.preventDefault();

  const email = $("recovery-email")?.value.trim().toLowerCase();
  if (!email) {
    setStatus("recovery-status", "Enter your account email.", true);
    return;
  }

  try {
    const redirectTo = window.location.href.split("#")[0];

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) throw error;

    setStatus(
      "recovery-status",
      "If an account is associated with that email, a recovery link will be sent. Check your inbox and spam folder."
    );
  } catch (error) {
    setStatus("recovery-status", error.message || "Could not request password recovery.", true);
  }
}

async function handleNewPassword(event) {
  event.preventDefault();

  const password = $("new-password")?.value || "";
  const confirmation = $("new-password-confirm")?.value || "";

  if (password.length < 8) {
    setStatus("new-password-status", "Use at least 8 characters for your new password.", true);
    return;
  }

  if (password !== confirmation) {
    setStatus("new-password-status", "The passwords do not match.", true);
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    setStatus("new-password-status", "Password updated. You can now use your new password.");
    $("new-password-form").reset();
  } catch (error) {
    setStatus(
      "new-password-status",
      error.message || "Password update failed. Open a fresh recovery link and try again.",
      true
    );
  }
}

function setupRecoveryEvents() {
  supabase.auth.onAuthStateChange((event, session) => {
    // Avoid performing additional Supabase requests inside this callback.
    if (event === "PASSWORD_RECOVERY") {
      setTimeout(() => {
        showPage("auth-page");
        if ($("auth-form")) $("auth-form").hidden = true;
        if ($("recovery-panel")) $("recovery-panel").hidden = true;
        if ($("new-password-panel")) $("new-password-panel").hidden = false;
        setStatus("new-password-status", "Choose a new password for your account.");
      }, 0);
    }

    if (event === "SIGNED_OUT") {
      state.user = null;
      state.profile = null;
      state.isAdmin = false;
      updateHeader();
    }

    if (event === "SIGNED_IN" && session?.user) {
      state.user = session.user;
      setTimeout(() => finishLogin(), 0);
    }
  });
}

/* -------------------- PUBLIC PRODUCT CATALOGUE -------------------- */

async function loadProducts() {
  const status = $("market-status");
  if (status) status.textContent = "Loading listings...";

  try {
    // Public access depends on SELECT policies in Supabase RLS.
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .limit(500);

    if (error) throw error;

    // The database policy must already prevent unpublished/private rows
    // from being returned to public visitors.
    state.products = (data || []).filter((product) => {
      if (product.is_published === false) return false;
      if (product.published === false) return false;
      if (product.status && ["draft", "hidden", "deleted"].includes(
        String(product.status).toLowerCase()
      )) return false;
      return true;
    });

    applyProductFilters();
  } catch (error) {
    state.products = [];
    state.filteredProducts = [];
    renderProducts();

    if (status) {
      status.textContent =
        "Listings could not be loaded. Check that the products table exists and its public-read policy is configured in Supabase. Details: " +
        (error.message || "Unknown error");
    }
  }
}

function applyProductFilters() {
  const query = ($("search-input")?.value || "").trim().toLowerCase();
  const county = ($("county-filter")?.value || "").trim().toLowerCase();
  const sort = $("sort-filter")?.value || "newest";

  let products = state.products.filter((product) => {
    const searchable = [
      getProductName(product),
      product.category,
      product.subcategory,
      product.description,
      product.county,
      product.town,
      product.farmer_name
    ].filter(Boolean).join(" ").toLowerCase();

    const matchesQuery = !query || searchable.includes(query);
    const matchesCounty = !county || String(product.county || "").toLowerCase() === county;
    return matchesQuery && matchesCounty;
  });

  if (sort === "price-low") {
    products.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  } else if (sort === "price-high") {
    products.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  } else if (sort === "name") {
    products.sort((a, b) => getProductName(a).localeCompare(getProductName(b)));
  } else {
    products.sort((a, b) => {
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }

  state.filteredProducts = products;
  renderProducts();
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderProducts() {
  const container = $("product-list");
  if (!container) return;

  container.replaceChildren();

  if (!state.filteredProducts.length) {
    container.append(
      createElement("p", "sm-muted", "No listings found. Try another search or county.")
    );
    if ($("market-status")) $("market-status").textContent = "0 listings found.";
    return;
  }

  if ($("market-status")) {
    $("market-status").textContent = `${state.filteredProducts.length} listing(s) found.`;
  }

  const products = state.filteredProducts.slice(0, state.productLimit);

  products.forEach((product) => {
    const card = createElement("article", "sm-product-card");
    const imageUrl = getProductImage(product);

    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl, window.location.href);
        if (["http:", "https:"].includes(parsed.protocol)) {
          const image = createElement("img", "sm-photo");
          image.src = parsed.href;
          image.alt = getProductName(product);
          image.loading = "lazy";
          image.onerror = () => image.remove();
          card.append(image);
        }
      } catch {
        // Ignore invalid image URLs.
      }
    }

    card.append(
      createElement("p", "sm-muted", getProductCategory(product)),
      createElement("h3", "", getProductName(product)),
      createElement("p", "sm-price", formatKES(product.price)),
      createElement("p", "", `${product.quantity ?? "Quantity on request"} ${product.unit || ""}`.trim()),
      createElement("p", "sm-muted", [product.town, product.county].filter(Boolean).join(", ") || "Location not supplied")
    );

    const actions = createElement("div", "sm-actions");

    const detailsButton = createElement("button", "sm-secondary", "View details");
    detailsButton.type = "button";
    detailsButton.addEventListener("click", () => openProductDetails(product));

    const cartButton = createElement("button", "sm-primary", "Add to cart");
    cartButton.type = "button";
    cartButton.addEventListener("click", () => addToCart(product));

    actions.append(detailsButton, cartButton);
    card.append(actions);
    container.append(card);
  });

  const pagination = $("product-pagination");
  if (pagination) {
    pagination.replaceChildren();

    if (state.filteredProducts.length > state.productLimit) {
      const more = createElement("button", "sm-secondary", "Load more");
      more.type = "button";
      more.addEventListener("click", () => {
        state.productLimit += 24;
        renderProducts();
      });
      pagination.append(more);
    }
  }
}

function openProductDetails(product) {
  state.selectedProduct = product;
  const container = $("product-details");
  if (!container) return;

  container.replaceChildren();

  const imageUrl = getProductImage(product);
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl, window.location.href);
      if (["http:", "https:"].includes(parsed.protocol)) {
        const image = createElement("img", "sm-photo");
        image.src = parsed.href;
        image.alt = getProductName(product);
        container.append(image);
      }
    } catch {}
  }

  container.append(
    createElement("h2", "", getProductName(product)),
    createElement("p", "sm-price", formatKES(product.price)),
    createElement("p", "", `Category: ${getProductCategory(product)}`),
    createElement("p", "", `Quantity: ${product.quantity ?? "Ask seller"} ${product.unit || ""}`),
    createElement("p", "", `Location: ${[product.town, product.county].filter(Boolean).join(", ") || "Not supplied"}`),
    createElement("p", "", `Farmer: ${product.farmer_name || "Seller"}`),
    createElement("p", "", product.description || "No description supplied.")
  );

  showPage("details-page");
}

function setupMarketFilters() {
  $("search-input")?.addEventListener("input", applyProductFilters);
  $("county-filter")?.addEventListener("change", applyProductFilters);
  $("sort-filter")?.addEventListener("change", applyProductFilters);

  $("hero-browse-button")?.addEventListener("click", () => {
    $("marketplace")?.scrollIntoView({ behavior: "smooth" });
  });

  $("brand-home")?.addEventListener("click", (event) => {
    event.preventDefault();
    showPage("market-page");
  });

  $("hero-sell-button")?.addEventListener("click", () => {
    if (!state.user) {
      openAuth("login", "Sign in to publish a listing.");
      return;
    }
    showPage("farmer-page");
  });

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      if ($("search-input")) {
        $("search-input").value = button.dataset.category || "";
        applyProductFilters();
      }
      $("marketplace")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

/* -------------------- CART AND ORDER ENQUIRIES -------------------- */

function addToCart(product) {
  if (!state.user) {
    openAuth("login", "Sign in to add items to your cart.");
    return;
  }

  const productId = product.id;
  if (!productId) {
    alert("This listing has no product ID, so it cannot be added to the cart.");
    return;
  }

  const existing = state.cart.find((item) => item.product.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ product, quantity: 1 });
  }

  renderCart();
  alert("Added to your cart.");
}

function renderCart() {
  const container = $("cart-items");
  if (!container) return;

  container.replaceChildren();

  if ($("cart-count")) {
    $("cart-count").textContent = String(
      state.cart.reduce((sum, item) => sum + item.quantity, 0)
    );
  }

  if (!state.user) {
    container.append(createElement("p", "", "Sign in to use your cart."));
    if ($("cart-subtotal")) $("cart-subtotal").textContent = "Subtotal: KES 0";
    return;
  }

  if (!state.cart.length) {
    container.append(createElement("p", "", "Your cart is empty."));
    if ($("cart-subtotal")) $("cart-subtotal").textContent = "Subtotal: KES 0";
    return;
  }

  let subtotal = 0;

  state.cart.forEach((item, index) => {
    const product = item.product;
    const lineTotal = Number(product.price || 0) * item.quantity;
    subtotal += lineTotal;

    const row = createElement("article", "sm-product-card");
    row.append(
      createElement("h3", "", getProductName(product)),
      createElement("p", "", `${formatKES(product.price)} × ${item.quantity}`),
      createElement("p", "sm-price", formatKES(lineTotal))
    );

    const actions = createElement("div", "sm-actions");
    const minus = createElement("button", "sm-secondary", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "Decrease quantity");
    minus.addEventListener("click", () => {
      item.quantity -= 1;
      if (item.quantity <= 0) state.cart.splice(index, 1);
      renderCart();
    });

    const plus = createElement("button", "sm-secondary", "+");
    plus.type = "button";
    plus.setAttribute("aria-label", "Increase quantity");
    plus.addEventListener("click", () => {
      item.quantity += 1;
      renderCart();
    });

    const remove = createElement("button", "sm-link", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.cart.splice(index, 1);
      renderCart();
    });

    actions.append(minus, plus, remove);
    row.append(actions);
    container.append(row);
  });

  if ($("cart-subtotal")) {
    $("cart-subtotal").textContent = `Subtotal: ${formatKES(subtotal)}`;
  }
}

function setupCart() {
  $("clear-cart-button")?.addEventListener("click", () => {
    state.cart = [];
    renderCart();
    setStatus("cart-status", "Cart cleared.");
  });

  $("place-order-button")?.addEventListener("click", () => {
    if (!state.user) {
      openAuth("login", "Sign in to continue.");
      return;
    }

    if (!state.cart.length) {
      setStatus("cart-status", "Add a product before continuing.", true);
      return;
    }

    setStatus(
      "cart-status",
      "Your cart is ready. Contact each seller to confirm availability, delivery and payment. No payment has been taken."
    );
  });

  $("details-add-cart")?.addEventListener("click", () => {
    if (state.selectedProduct) addToCart(state.selectedProduct);
  });

  $("details-message-farmer")?.addEventListener("click", () => {
    if (!state.user) {
      openAuth("login", "Sign in to message this seller.");
      return;
    }

    const farmerId = state.selectedProduct && getProductOwnerId(state.selectedProduct);
    if (!farmerId) {
      setStatus("message-status", "This listing does not have a seller account ID.", true);
      showPage("messages-page");
      return;
    }

    startConversation(farmerId);
  });
}

/* -------------------- FARMER LISTINGS -------------------- */

function setupCategoryDropdowns() {
  const department = $("product-category");
  const subcategory = $("product-subcategory");
  if (!department || !subcategory) return;

  const updateSubcategories = () => {
    const options = CATEGORY_MAP[department.value] || [];
    subcategory.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a category";
    subcategory.append(placeholder);

    options.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      subcategory.append(option);
    });
  };

  department.addEventListener("change", updateSubcategories);
}

async function uploadProductPhoto(file) {
  if (!file) return null;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("The photo must be 5 MB or smaller.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension)
    ? extension
    : "jpg";

  const path = `${state.user.id}/${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await supabase.storage
    .from("product-photos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("product-photos")
    .getPublicUrl(path);

  return data.publicUrl;
}

function setupProductForm() {
  $("product-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.user) {
      openAuth("login", "Sign in before publishing a listing.");
      return;
    }

    const name = $("product-name")?.value.trim();
    const category = $("product-category")?.value;
    const subcategory = $("product-subcategory")?.value;
    const price = Number($("product-price")?.value);
    const quantity = Number($("product-quantity")?.value);
    const unit = $("product-unit")?.value;
    const county = $("product-county")?.value;
    const town = $("product-town")?.value.trim();
    const phone = $("product-phone")?.value.trim();
    const description = $("product-description")?.value.trim();
    const condition = $("product-condition")?.value || "new";
    const file = $("product-photo")?.files?.[0] || null;

    if (!name || !category || !subcategory || !unit || !county || !description) {
      setStatus("product-form-status", "Complete all required fields.", true);
      return;
    }

    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 0) {
      setStatus("product-form-status", "Enter a valid price and quantity.", true);
      return;
    }

    const submitButton = $("product-form").querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent;
      submitButton.textContent = "Publishing...";
    }

    try {
      const photoUrl = await uploadProductPhoto(file);

      const listing = {
        owner_id: state.user.id,
        product_name: name,
        category,
        subcategory,
        price,
        quantity,
        unit,
        condition,
        county,
        town,
        farmer_name: state.profile?.name || state.user.user_metadata?.name || "",
        phone,
        photo_url: photoUrl,
        description
      };

      const { error } = await supabase.from("products").insert(listing);
      if (error) throw error;

      $("product-form").reset();
      setStatus("product-form-status", "Listing submitted successfully.");
      await loadProducts();
      showPage("market-page");
    } catch (error) {
      setStatus(
        "product-form-status",
        `Listing could not be saved: ${error.message || "Unknown error"}. Check the products table columns and Storage policies in Supabase.`,
        true
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || "Publish listing";
      }
    }
  });
}

/* -------------------- MESSAGING -------------------- */

async function loadConversations() {
  const list = $("conversation-list");
  if (!list) return;

  list.replaceChildren();

  if (!state.user) {
    list.append(createElement("p", "", "Sign in to access your messages."));
    return;
  }

  try {
    const { data: memberships, error } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", state.user.id);

    if (error) throw error;

    if (!memberships?.length) {
      list.append(createElement("p", "", "No conversations yet."));
      return;
    }

    for (const membership of memberships) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id, updated_at")
        .eq("id", membership.conversation_id)
        .maybeSingle();

      if (!conversation) continue;

      const button = createElement("button", "sm-secondary", `Conversation ${String(conversation.id).slice(0, 8)}`);
      button.type = "button";
      button.addEventListener("click", () => openConversation(conversation.id));
      list.append(button);
    }
  } catch (error) {
    list.append(createElement(
      "p",
      "",
      `Messages could not be loaded: ${error.message || "Check messaging table permissions."}`
    ));
  }
}

async function startConversation(otherUserId) {
  if (!state.user) {
    openAuth("login", "Sign in to message a farmer.");
    return;
  }

  if (!otherUserId || otherUserId === state.user.id) {
    setStatus("message-status", "You cannot message your own account.", true);
    showPage("messages-page");
    return;
  }

  try {
    const { data, error } = await supabase.rpc("create_conversation", {
      p_other_user: otherUserId
    });

    if (error) throw error;

    state.activeFarmerId = otherUserId;
    await openConversation(data);
    showPage("messages-page");
  } catch (error) {
    showPage("messages-page");
    setStatus(
      "message-status",
      `Could not start conversation: ${error.message || "Check the create_conversation function and permissions."}`,
      true
    );
  }
}

async function openConversation(conversationId) {
  if (!state.user) return;

  state.activeConversationId = conversationId;
  const thread = $("message-thread");
  if (!thread) return;

  thread.replaceChildren();
  setStatus("message-status", "Loading conversation...");

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    (data || []).forEach((message) => {
      const mine = message.sender_id === state.user.id;
      const bubble = createElement("article", "sm-product-card");
      bubble.append(
        createElement("strong", "", mine ? "You" : "Farmer / buyer"),
        createElement("p", "", message.body),
        createElement("small", "sm-muted", new Date(message.created_at).toLocaleString())
      );
      thread.append(bubble);
    });

    setStatus("message-status", "");

    if (state.messageSubscription) {
      supabase.removeChannel(state.messageSubscription);
      state.messageSubscription = null;
    }

    state.messageSubscription = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const message = payload.new;
          const mine = message.sender_id === state.user?.id;
          const bubble = createElement("article", "sm-product-card");
          bubble.append(
            createElement("strong", "", mine ? "You" : "Farmer / buyer"),
            createElement("p", "", message.body),
            createElement("small", "sm-muted", new Date(message.created_at).toLocaleString())
          );
          thread.append(bubble);
        }
      )
      .subscribe();
  } catch (error) {
    setStatus("message-status", `Could not load messages: ${error.message}`, true);
  }
}

function setupMessageForm() {
  $("message-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.user) {
      openAuth("login", "Sign in to send a message.");
      return;
    }

    if (!state.activeConversationId) {
      setStatus("message-status", "Choose a conversation first.", true);
      return;
    }

    const body = $("message-input")?.value.trim();
    if (!body) return;

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: state.activeConversationId,
        sender_id: state.user.id,
        body
      });

      if (error) throw error;

      $("message-input").value = "";
      setStatus("message-status", "Message sent.");
    } catch (error) {
      setStatus("message-status", `Message could not be sent: ${error.message}`, true);
    }
  });
}

/* -------------------- ACCOUNT SETTINGS -------------------- */

function renderSettings() {
  if (!state.user) {
    openAuth("login", "Sign in to manage your account.");
    return;
  }

  if ($("settings-account-name")) {
    $("settings-account-name").textContent =
      `Name: ${state.profile?.name || state.user.user_metadata?.name || "Not set"}`;
  }

  if ($("settings-account-email")) {
    $("settings-account-email").textContent = `Email: ${state.user.email || ""}`;
  }

  if ($("settings-name")) {
    $("settings-name").value =
      state.profile?.name || state.user.user_metadata?.name || "";
  }

  if ($("settings-phone")) {
    $("settings-phone").value = state.profile?.phone || "";
  }
}

function setupSettingsForm() {
  $("settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.user) {
      openAuth("login");
      return;
    }

    const name = $("settings-name")?.value.trim() || "";
    const phone = $("settings-phone")?.value.trim() || "";

    try {
      // Updating user metadata is useful for display, but is not an
      // authority for admin roles or other permissions.
      const { error: authError } = await supabase.auth.updateUser({
        data: { name }
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: state.user.id,
          name,
          email: state.user.email,
          phone
        }, { onConflict: "id" });

      if (profileError) {
        throw new Error(
          "Your display name was updated, but the profiles table could not be saved: " +
          profileError.message
        );
      }

      await loadProfile();
      updateHeader();
      renderSettings();
      setStatus("settings-status", "Settings saved.");
    } catch (error) {
      setStatus("settings-status", error.message || "Could not save settings.", true);
    }
  });
}

/* -------------------- ADMIN DASHBOARD -------------------- */

async function loadAdminOverview() {
  if (!state.user || !state.isAdmin) {
    setStatus("admin-status", "Administrator permission required.", true);
    return;
  }

  const container = $("admin-content");
  if (!container) return;

  container.replaceChildren(
    createElement("p", "", `Signed in as ${state.user.email || "administrator"}.`),
    createElement("p", "", "Administrator role has been verified.")
  );

  try {
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    container.append(createElement("p", "", `Product records visible to this account: ${count ?? 0}`));
  } catch (error) {
    container.append(createElement(
      "p",
      "",
      `Product overview unavailable: ${error.message || "Check database permissions."}`
    ));
  }
}

/* -------------------- NAVIGATION -------------------- */

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const pageId = button.dataset.page;
      const protectedPage = ["farmer-page", "cart-page", "messages-page", "settings-page"];

      if (protectedPage.includes(pageId) && !state.user) {
        openAuth("login", "Sign in to use this feature.");
        return;
      }

      showPage(pageId);
    });
  });

  $("browse-public-button")?.addEventListener("click", () => showPage("market-page"));
  $("back-to-auth")?.addEventListener("click", () => openAuth("login"));

  $("show-admin-login")?.addEventListener("click", () => {
    document.querySelectorAll(".app-page").forEach((page) => {
      page.hidden = page.id !== "admin-login-page";
    });
    if ($("admin-login-status")) $("admin-login-status").textContent = "";
  });
}

/* -------------------- STARTUP -------------------- */

async function startApp() {
  setupAuthTabs();
  setupRecoveryEvents();
  setupMarketFilters();
  setupCart();
  setupCategoryDropdowns();
  setupProductForm();
  setupMessageForm();
  setupSettingsForm();
  setupNavigation();

  // Populate county options while preserving the default selection.
  const countyFilter = $("county-filter");
  if (countyFilter) {
    const existing = countyFilter.value;
    COUNTY_NAMES.forEach((county) => {
      const exists = [...countyFilter.options].some(
        (option) => option.value.toLowerCase() === county.toLowerCase()
      );

      if (!exists) {
        const option = document.createElement("option");
        option.value = county;
        option.textContent = county;
        countyFilter.append(option);
      }
    });
    countyFilter.value = existing;
  }

  await refreshAuthState();
  await loadProducts();
  renderCart();
  updateHeader();

  // Password recovery links may return with an auth token in the URL.
  const hash = window.location.hash;
  if (hash.includes("type=recovery")) {
    showPage("auth-page");
    if ($("auth-form")) $("auth-form").hidden = true;
    if ($("recovery-panel")) $("recovery-panel").hidden = true;
    if ($("new-password-panel")) $("new-password-panel").hidden = false;
  } else if (state.user) {
    await checkAdminRole();
  } else {
    showPage("market-page");
  }
}

startApp().catch((error) => {
  console.error("ShambaMarket could not start:", error);
  const status = $("market-status");
  if (status) {
    status.textContent =
      "ShambaMarket could not initialise. Check supabase-config.js and refresh the page.";
  }
});
