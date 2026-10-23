import { supabase } from "./supabase-config.js";

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

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let listings = [];
let selectedCategory = "All Categories";
let selectedPhoto = null;

const escapeHTML = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function setText(id, message) {
  const element = $(id);
  if (element) element.textContent = message;
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 3000);
}

function setStatus(ids, message) {
  ids.forEach((id) => setText(id, message));
}

function showAuth(message = "") {
  if ($("auth-page")) $("auth-page").hidden = false;
  if ($("app-shell")) $("app-shell").hidden = true;
  setStatus(["auth-status"], message);
}

function showApp() {
  if ($("auth-page")) $("auth-page").hidden = true;
  if ($("app-shell")) $("app-shell").hidden = false;
}

function setAuthMode(mode) {
  const signup = mode === "signup";
  if ($("signup-fields")) $("signup-fields").hidden = !signup;
  if ($("auth-title")) {
    $("auth-title").textContent = signup ? "Create your account" : "Welcome back";
  }
  if ($("auth-description")) {
    $("auth-description").textContent = signup
      ? "Join SHAMBAMARKET and connect with local farmers."
      : "Log in to continue to SHAMBAMARKET.";
  }
  if ($("auth-submit")) {
    $("auth-submit").textContent = signup ? "Create account" : "Log in";
  }
  setStatus(["auth-status"], "");
}

async function loadProfile() {
  if (!currentUser) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function saveProfile(name, role, phone = "") {
  const profile = {
    id: currentUser.id,
    name,
    email: currentUser.email,
    role,
    phone
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id" });

  if (error) throw error;
  currentProfile = profile;
}

function updateAccountUI() {
  const name = currentProfile?.name || currentUser?.email || "My account";
  setText("account-label", name);
  setText("farmer-name", currentProfile?.name || "");

  const farmer = currentProfile?.role === "farmer";

  document.querySelectorAll('[data-page="farmer"]').forEach((element) => {
    element.hidden = !farmer;
  });

  if ($("product-form")) {
    $("product-form").querySelectorAll("input, select, textarea, button")
      .forEach((element) => {
        element.disabled = !farmer;
      });
  }

  if (!farmer) {
    setText("farmer-status", "Sign in with a farmer account to publish listings.");
  } else {
    setText("farmer-status", "");
  }
}

function goToPage(page) {
  document.querySelectorAll(".app-page").forEach((element) => {
    element.classList.toggle("active", element.id === page);
  });

  document.querySelectorAll(".nav-link").forEach((element) => {
    element.classList.toggle("active", element.dataset.page === page);
  });

  if (page === "farmer") renderFarmerListings();
}

function setupNavigation() {
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    link.addEventListener("click", () => {
      const page = link.dataset.page;
      goToPage(page);
    });
  });

  document.querySelectorAll('[data-go-page]').forEach((button) => {
    button.addEventListener("click", () => goToPage(button.dataset.goPage));
  });
}

function renderCategories() {
  const container = $("category-list");
  if (!container) return;

  const allCategories = ["All Categories", ...CATEGORIES];

  container.innerHTML = allCategories.map((category) => `
    <button type="button"
      class="category-chip ${selectedCategory === category ? "active" : ""}"
      data-category="${escapeHTML(category)}">
      ${escapeHTML(category)}
    </button>
  `).join("");

  container.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      if ($("product-category")) {
        $("product-category").value =
          CATEGORIES.includes(selectedCategory) ? selectedCategory : "";
      }
      renderCategories();
      renderProducts();
    });
  });
}

function formatPrice(price) {
  return Number(price || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function filteredListings() {
  const search = ($("search-input")?.value || "").trim().toLowerCase();
  const county = $("county-filter")?.value || "";
  const sort = $("sort-products")?.value || "newest";

  let result = listings.filter((item) => {
    const matchesCategory =
      selectedCategory === "All Categories" ||
      item.category === selectedCategory;

    const searchable = [
      item.product_name,
      item.category,
      item.county,
      item.town,
      item.farmer_name,
      item.description
    ].join(" ").toLowerCase();

    return matchesCategory &&
      (!search || searchable.includes(search)) &&
      (!county || item.county === county);
  });

  if (sort === "price-low") result.sort((a, b) => Number(a.price) - Number(b.price));
  else if (sort === "price-high") result.sort((a, b) => Number(b.price) - Number(a.price));
  else if (sort === "name") result.sort((a, b) => a.product_name.localeCompare(b.product_name));
  else result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return result;
}

function productCard(item) {
  const photo = item.photo_url
    ? `<img class="product-photo" src="${escapeHTML(item.photo_url)}"
         alt="${escapeHTML(item.product_name)}" loading="lazy">`
    : `<div class="photo-placeholder">No photo available</div>`;

  const location = [item.town, item.county].filter(Boolean).join(", ");
  const quantity = item.quantity
    ? `${escapeHTML(item.quantity)} ${escapeHTML(item.unit || "kg")}`
    : "Quantity not specified";

  return `
    <article class="product-card">
      ${photo}
      <div class="product-body">
        <span class="product-category">${escapeHTML(item.category)}</span>
        <h3>${escapeHTML(item.product_name)}</h3>
        <div class="product-price">KSh ${formatPrice(item.price)}
          <small>/ ${escapeHTML(item.unit || "unit")}</small>
        </div>
        <div class="product-meta">
          <span>Quantity: ${quantity}</span>
          ${location ? `<span>Location: ${escapeHTML(location)}</span>` : ""}
          ${item.condition ? `<span>Condition: ${escapeHTML(item.condition)}</span>` : ""}
        </div>
        ${item.description ? `<p class="product-description">${escapeHTML(item.description)}</p>` : ""}
        <div class="seller-line">Farmer: ${escapeHTML(item.farmer_name || "Local farmer")}</div>
        ${item.phone
          ? `<div class="product-actions">
               <a class="button button-primary"
                  href="tel:${escapeHTML(item.phone)}">Contact farmer</a>
             </div>`
          : ""}
      </div>
    </article>
  `;
}

function renderProducts() {
  const container = $("product-list");
  if (!container) return;

  const result = filteredListings();
  container.innerHTML = result.map(productCard).join("");

  setText("listing-summary", `${result.length} product${result.length === 1 ? "" : "s"} found`);

  if ($("empty-message")) {
    $("empty-message").hidden = result.length > 0;
  }
}

async function loadListings() {
  setStatus(["market-status"], "Loading products...");

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    setStatus(["market-status"], `Could not load products: ${error.message}`);
    console.error(error);
    return;
  }

  listings = data || [];
  renderProducts();
  renderFarmerListings();
  setStatus(["market-status"], "");
}

async function uploadPhoto(file) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 5 MB.");
  }

  const extension = file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("product-photos")
    .upload(path, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage
    .from("product-photos")
    .getPublicUrl(path);

  return data.publicUrl;
}

function setupPhotoPreview() {
  $("product-photo")?.addEventListener("change", (event) => {
    selectedPhoto = event.target.files?.[0] || null;
    const preview = $("photo-preview");
    if (!preview) return;

    if (!selectedPhoto) {
      preview.innerHTML = "";
      return;
    }

    const url = URL.createObjectURL(selectedPhoto);
    preview.innerHTML = `<img src="${url}" alt="Selected product photo preview">`;
  });
}

async function publishListing(event) {
  event.preventDefault();

  if (!currentUser || currentProfile?.role !== "farmer") {
    setStatus(["farmer-status"], "Please log in with a farmer account first.");
    return;
  }

  const productName = $("product-name")?.value.trim();
  const category = $("product-category")?.value;
  const price = Number($("product-price")?.value);
  const quantity = Number($("product-quantity")?.value || 1);

  if (!productName || !CATEGORIES.includes(category)) {
    setStatus(["farmer-status"], "Enter a product name and choose a category.");
    return;
  }

  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
    setStatus(["farmer-status"], "Enter a valid price and quantity.");
    return;
  }

  const button = $("publish-button");
  if (button) button.disabled = true;
  setStatus(["farmer-status"], "Publishing your product...");

  try {
    const photoUrl = await uploadPhoto(selectedPhoto);
    const listing = {
      owner_id: currentUser.id,
      product_name: productName,
      category,
      condition: $("product-condition")?.value || "Fresh",
      county: $("product-county")?.value.trim() || "",
      town: $("product-town")?.value.trim() || "",
      quantity,
      unit: $("product-unit")?.value || "kg",
      price,
      description: $("product-description")?.value.trim() || "",
      farmer_name: currentProfile.name || "",
      phone: currentProfile.phone || "",
      photo_url: photoUrl
    };

    const { error } = await supabase.from("listings").insert(listing);
    if (error) throw error;

    $("product-form")?.reset();
    if ($("photo-preview")) $("photo-preview").innerHTML = "";
    selectedPhoto = null;

    showToast("Your product was published!");
    setStatus(["farmer-status"], "Your product is now listed.");
    await loadListings();
  } catch (error) {
    console.error(error);
    setStatus(["farmer-status"], error.message || "Could not publish the product.");
  } finally {
    if (button) button.disabled = false;
  }
}

function renderFarmerListings() {
  const container = $("farmer-listings");
  if (!container) return;

  const ownListings = listings.filter((item) => item.owner_id === currentUser?.id);

  if (!currentUser || currentProfile?.role !== "farmer") {
    container.innerHTML = `<p class="muted">Log in as a farmer to manage your listings.</p>`;
    return;
  }

  if (ownListings.length === 0) {
    container.innerHTML = `<p class="muted">You haven't published any products yet.</p>`;
    return;
  }

  container.innerHTML = ownListings.map((item) => `
    <article class="farmer-listing">
      ${item.photo_url
        ? `<img src="${escapeHTML(item.photo_url)}" alt="${escapeHTML(item.product_name)}">`
        : `<div class="mini-placeholder"></div>`}
      <div>
        <h3>${escapeHTML(item.product_name)}</h3>
        <p>${escapeHTML(item.category)} · KSh ${formatPrice(item.price)}</p>
        <p>${escapeHTML(item.town || "")}${item.county ? `, ${escapeHTML(item.county)}` : ""}</p>
        <button type="button" class="button button-outline"
          data-delete-listing="${escapeHTML(item.id)}">Delete listing</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll("[data-delete-listing]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this product listing?")) return;

      const { error } = await supabase
        .from("listings")
        .delete()
        .eq("id", button.dataset.deleteListing)
        .eq("owner_id", currentUser.id);

      if (error) {
        showToast(`Could not delete listing: ${error.message}`);
        return;
      }

      showToast("Listing deleted.");
      await loadListings();
    });
  });
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast(error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  showAuth("You have logged out.");
}

async function handleAuth(event) {
  event.preventDefault();

  const email = $("auth-email")?.value.trim();
  const password = $("auth-password")?.value;
  const name = $("auth-name")?.value.trim();
  const role = $("auth-role")?.value || "customer";
  const signup = $("signup-fields") && !$("signup-fields").hidden;

  setStatus(["auth-status"], "Please wait...");

  try {
    if (signup) {
      if (!name) throw new Error("Enter your name.");
      if (!["farmer", "customer"].includes(role)) {
        throw new Error("Choose farmer or customer.");
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role }
        }
      });

      if (error) throw error;

      if (data.user && data.session) {
        currentUser = data.user;
        await saveProfile(name, role);
        await startApp();
      } else {
        setStatus(["auth-status"],
          "Account created. Check your email to confirm it, then log in.");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      currentUser = data.user;
      await startApp();
    }
  } catch (error) {
    console.error(error);
    setStatus(["auth-status"], error.message || "Something went wrong.");
  }
}

async function startApp() {
  try {
    if (!currentUser) {
      showAuth();
      return;
    }

    currentProfile = await loadProfile();

    if (!currentProfile) {
      const metadata = currentUser.user_metadata || {};
      currentProfile = {
        name: metadata.name || "",
        role: metadata.role || "customer",
        phone: ""
      };
      await saveProfile(currentProfile.name, currentProfile.role);
    }

    showApp();
    updateAccountUI();
    renderCategories();
    setupNavigation();
    await loadListings();
    goToPage("market");
  } catch (error) {
    console.error(error);
    showAuth(`Could not load your account: ${error.message}`);
  }
}

function setupTheme() {
  const applyTheme = (dark) => {
    document.body.classList.toggle("dark-theme", dark);
    document.documentElement.classList.toggle("dark-theme", dark);
  };

  $("theme-toggle")?.addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark-theme");
    applyTheme(dark);
  });

  applyTheme(false);
}

function setupSettings() {
  $("settings-logout")?.addEventListener("click", signOut);
  $("logout-button")?.addEventListener("click", signOut);

  $("farmer-phone")?.addEventListener("change", async (event) => {
    if (!currentUser || !currentProfile) return;

    const phone = event.target.value.trim();
    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      name: currentProfile.name || "",
      email: currentUser.email,
      role: currentProfile.role || "customer",
      phone
    }, { onConflict: "id" });

    if (error) {
      setStatus(["settings-status"], error.message);
      return;
    }

    currentProfile.phone = phone;
    showToast("Phone number saved.");
  });
}

function setupMarketplaceControls() {
  ["search-input", "county-filter", "sort-products"].forEach((id) => {
    $(id)?.addEventListener("input", renderProducts);
    $(id)?.addEventListener("change", renderProducts);
  });
}

function init() {
  setText("current-year", new Date().getFullYear());

  setAuthMode("login");
  $("show-login")?.addEventListener("click", () => setAuthMode("login"));
  $("show-signup")?.addEventListener("click", () => setAuthMode("signup"));
  $("auth-form")?.addEventListener("submit", handleAuth);
  $("product-form")?.addEventListener("submit", publishListing);

  setupPhotoPreview();
  setupMarketplaceControls();
  setupNavigation();
  setupSettings();
  setupTheme();
  renderCategories();

  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      showAuth(error.message);
      return;
    }

    currentUser = data.session?.user || null;

    if (currentUser) {
      await startApp();
    } else {
      showAuth();
    }
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (!currentUser) {
      currentProfile = null;
      showAuth();
    }
  });
}

init();
