
import { auth, db, storage } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

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

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const money = value => Number(value || 0).toLocaleString("en-KE", {
  maximumFractionDigits: 2
});

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let allProducts = [];
let selectedCategory = "";
let unsubscribeProducts = null;
let selectedPhoto = null;

function status(id, message) {
  if ($(id)) $(id).textContent = message;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 3000);
}

function showPage(name) {
  document.querySelectorAll(".app-page").forEach(page => {
    page.classList.remove("active");
    page.hidden = true;
  });

  const target = $(`${name}-page`);
  if (!target) return;

  target.hidden = false;
  target.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === name);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";

  $("signup-fields").hidden = !signup;
  $("auth-title").textContent = signup ? "Create your account" : "Welcome back";
  $("auth-description").textContent = signup
    ? "Join as a farmer or customer."
    : "Log in to explore the marketplace.";
  $("auth-submit").textContent = signup ? "Create account" : "Log in";
  $("auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("auth-name").required = signup;
  $("auth-role").required = signup;
  $("show-login").classList.toggle("active", !signup);
  $("show-signup").classList.toggle("active", signup);
  status("auth-status", "");
}

function showAuthenticatedApp(profile) {
  $("auth-page").hidden = true;
  $("app-shell").hidden = false;
  $("main-nav").hidden = false;
  $("logout-button").hidden = false;

  const displayName = profile?.name || currentUser.displayName ||
    currentUser.email || "Account";
  $("account-label").textContent = displayName;

  const farmerButton = document.querySelector('[data-page="farmer"]');
  farmerButton.hidden = false;

  if ($("farmer-name") && profile?.name) {
    $("farmer-name").value = profile.name;
  }
  if ($("farmer-phone") && profile?.phone) {
    $("farmer-phone").value = profile.phone;
  }

  showPage("market");
}

function showAuthScreen() {
  $("auth-page").hidden = false;
  $("app-shell").hidden = true;
  $("main-nav").hidden = true;
  $("logout-button").hidden = true;
  $("account-label").textContent = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadUserProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  if (snapshot.exists()) return snapshot.data();

  const fallback = {
    name: user.displayName || "",
    email: user.email || "",
    role: "customer"
  };
  await setDoc(doc(db, "users", user.uid), fallback);
  return fallback;
}

// SIGN-UP AND LOG-IN
$("show-login").addEventListener("click", () => setAuthMode("login"));
$("show-signup").addEventListener("click", () => setAuthMode("signup"));

$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("auth-submit");
  button.disabled = true;
  status("auth-status", authMode === "signup"
    ? "Creating your account..."
    : "Logging in...");

  try {
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;

    if (authMode === "signup") {
      const name = $("auth-name").value.trim();
      const role = $("auth-role").value;

      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });

      await setDoc(doc(db, "users", result.user.uid), {
        name,
        email,
        role,
        createdAt: serverTimestamp()
      });

      toast("Account created successfully.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      toast("Logged in successfully.");
    }
  } catch (error) {
    status("auth-status", friendlyError(error));
  } finally {
    button.disabled = false;
  }
});

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "This email already has an account. Try logging in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Use a stronger password with at least 6 characters.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "permission-denied": "Firebase rules blocked this action. Check your database and storage rules.",
    "storage/unauthorized": "Photo upload was denied. Check Firebase Storage rules."
  };
  return messages[error.code] || `Something went wrong: ${error.message || error.code || "Please try again."}`;
}

// AUTHENTICATION STATE
onAuthStateChanged(auth, async user => {
  if (unsubscribeProducts) {
    unsubscribeProducts();
    unsubscribeProducts = null;
  }

  currentUser = user;
  currentProfile = null;
  allProducts = [];

  if (!user) {
    showAuthScreen();
    return;
  }

  try {
    currentProfile = await loadUserProfile(user);
    showAuthenticatedApp(currentProfile);
    startProductListener();
    renderCategories();
    renderFarmerListings();
  } catch (error) {
    status("auth-status", friendlyError(error));
    await signOut(auth);
  }
});

$("logout-button").addEventListener("click", () => signOut(auth));
$("settings-logout").addEventListener("click", () => signOut(auth));
$("home-link").addEventListener("click", event => {
  event.preventDefault();
  if (currentUser) showPage("market");
});

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});
$("browse-button").addEventListener("click", () => {
  $("marketplace").scrollIntoView({ behavior: "smooth" });
});
$("sell-button").addEventListener("click", () => showPage("farmer"));

// KENYAN FARM CATEGORIES
function renderCategories() {
  $("category-list").innerHTML = ["All products", ...CATEGORIES].map(category => {
    const value = category === "All products" ? "" : category;
    const count = allProducts.filter(product =>
      !value || product.category === value
    ).length;

    return `<button type="button"
      class="category-chip ${selectedCategory === value ? "active" : ""}"
      data-category="${escapeHTML(value)}"
      aria-pressed="${selectedCategory === value}">
      ${escapeHTML(category)} <span>(${count})</span>
    </button>`;
  }).join("");

  $("product-category").innerHTML =
    '<option value="">Choose category</option>' +
    CATEGORIES.map(category =>
      `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
    ).join("");
}

$("category-list").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderCategories();
  renderProducts();
});

// SHARED FIRESTORE LISTINGS
function startProductListener() {
  unsubscribeProducts = onSnapshot(
    collection(db, "listings"),
    snapshot => {
      allProducts = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderCategories();
      renderProducts();
      renderFarmerListings();
      status("market-status", "");
    },
    error => status("market-status", friendlyError(error))
  );
}

function renderProducts() {
  const query = $("search-input").value.trim().toLowerCase();
  const county = $("county-filter").value;
  const sort = $("sort-products").value;

  let products = allProducts.filter(product =>
    (!selectedCategory || product.category === selectedCategory) &&
    (!county || product.county === county) &&
    (!query || [
      product.name, product.category, product.farmerName,
      product.county, product.town, product.description
    ].join(" ").toLowerCase().includes(query))
  );

  if (sort === "price-low") products.sort((a, b) => a.price - b.price);
  else if (sort === "price-high") products.sort((a, b) => b.price - a.price);
  else if (sort === "name") products.sort((a, b) => a.name.localeCompare(b.name));
  else products.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));

  $("listing-summary").textContent =
    `Showing ${products.length} listing${products.length === 1 ? "" : "s"}. Each farmer's listing is kept separate.`;
  $("empty-message").hidden = products.length > 0;

  $("product-list").innerHTML = products.map(product => `
    <article class="product-card">
      ${product.photoURL
        ? `<img class="product-photo" src="${escapeHTML(product.photoURL)}" alt="${escapeHTML(product.name)}" loading="lazy">`
        : '<div class="photo-placeholder">No photo supplied</div>'}
      <div class="product-body">
        <span class="product-category">${escapeHTML(product.category)}</span>
        <h3>${escapeHTML(product.name)}</h3>
        <div class="product-price">KSh ${money(product.price)} <small>/ ${escapeHTML(product.unit)}</small></div>
        <div class="product-meta">
          <span>${escapeHTML(product.quantity)} ${escapeHTML(product.unit)} available</span>
          <span>${escapeHTML(product.town)}, ${escapeHTML(product.county)}</span>
          <span>Condition: ${escapeHTML(product.condition)}</span>
        </div>
        ${product.description ? `<p class="product-description">${escapeHTML(product.description)}</p>` : ""}
        <div class="seller-line">Seller: ${escapeHTML(product.farmerName)}</div>
        <div class="product-actions">
          ${product.phone
            ? `<a class="button button-primary" href="tel:${escapeHTML(product.phone)}">Call seller</a>`
            : '<span class="small-text">No phone supplied</span>'}
        </div>
      </div>
    </article>
  `).join("");
}

function timestamp(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

["search-input", "county-filter", "sort-products"].forEach(id => {
  $(id).addEventListener(id === "search-input" ? "input" : "change", renderProducts);
});

// REAL PHOTO UPLOAD PREVIEW
$("product-photo").addEventListener("change", () => {
  const file = $("product-photo").files[0];
  selectedPhoto = null;
  $("photo-preview").innerHTML = "";

  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    $("product-photo").value = "";
    status("farmer-status", "Choose a JPG, PNG or WebP photo.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    $("product-photo").value = "";
    status("farmer-status", "Photo must be 5 MB or smaller.");
    return;
  }

  selectedPhoto = file;
  const previewURL = URL.createObjectURL(file);
  $("photo-preview").innerHTML =
    `<img src="${previewURL}" alt="Preview of your selected produce photo">`;
});

// CREATE A UNIQUE FIRESTORE DOCUMENT FOR EVERY LISTING
$("product-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const button = $("publish-button");
  const file = selectedPhoto;

  if (!file) {
    status("farmer-status", "Please choose a real photo of your produce.");
    return;
  }

  const product = {
    name: $("product-name").value.trim(),
    category: $("product-category").value,
    condition: $("product-condition").value,
    county: $("product-county").value.trim(),
    town: $("product-town").value.trim(),
    quantity: Number($("product-quantity").value),
    unit: $("product-unit").value,
    price: Number($("product-price").value),
    farmerName: $("farmer-name").value.trim(),
    phone: $("farmer-phone").value.trim(),
    description: $("product-description").value.trim()
  };

  if (!product.name || !product.category || !product.county ||
      !product.town || !product.farmerName || !product.phone ||
      !(product.quantity > 0) || !(product.price >= 0)) {
    status("farmer-status", "Check all required fields.");
    return;
  }

  button.disabled = true;
  status("farmer-status", "Uploading photo and publishing listing...");

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const photoPath = `product-photos/${currentUser.uid}/${Date.now()}-${safeName}`;
    const photoRef = ref(storage, photoPath);

    await uploadBytes(photoRef, file, { contentType: file.type });
    const photoURL = await getDownloadURL(photoRef);

    await addDoc(collection(db, "listings"), {
      ...product,
      ownerId: currentUser.uid,
      photoURL,
      photoPath,
      createdAt: serverTimestamp()
    });

    event.target.reset();
    selectedPhoto = null;
    $("photo-preview").innerHTML = "";
    status("farmer-status", "Your listing is live and visible to other signed-in users.");
    toast("Listing published.");
    showPage("market");
  } catch (error) {
    status("farmer-status", friendlyError(error));
  } finally {
    button.disabled = false;
  }
});

// FARMER'S OWN LISTINGS
function renderFarmerListings() {
  if (!currentUser) return;
  const products = allProducts.filter(p => p.ownerId === currentUser.uid);

  if (!products.length) {
    $("farmer-listings").innerHTML =
      '<p class="muted">You have not published any listings yet.</p>';
    return;
  }

  $("farmer-listings").innerHTML = products.map(product => `
    <article class="farmer-listing">
      ${product.photoURL
        ? `<img src="${escapeHTML(product.photoURL)}" alt="${escapeHTML(product.name)}">`
        : '<div class="mini-placeholder"></div>'}
      <div>
        <h3>${escapeHTML(product.name)}</h3>
        <p>KSh ${money(product.price)} / ${escapeHTML(product.unit)}</p>
        <p>${escapeHTML(product.quantity)} ${escapeHTML(product.unit)} · ${escapeHTML(product.town)}, ${escapeHTML(product.county)}</p>
        <button class="button button-outline delete-listing" data-id="${escapeHTML(product.id)}" type="button">Delete listing</button>
      </div>
    </article>
  `).join("");
}

$("farmer-listings").addEventListener("click", async event => {
  const button = event.target.closest(".delete-listing");
  if (!button || !currentUser) return;

  const product = allProducts.find(p => p.id === button.dataset.id);
  if (!product || product.ownerId !== currentUser.uid) {
    status("farmer-status", "You can only delete your own listings.");
    return;
  }
  if (!confirm(`Delete your listing for "${product.name}"?`)) return;

  button.disabled = true;
  try {
    await deleteDoc(doc(db, "listings", product.id));
    // The database document is deleted. Storage cleanup can be done separately.
    toast("Listing deleted.");
  } catch (error) {
    status("farmer-status", friendlyError(error));
    button.disabled = false;
  }
});

// SETTINGS
$("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
  localStorage.setItem(
    "shambamarket-theme",
    document.body.classList.contains("dark-theme") ? "dark" : "light"
  );
});
if (localStorage.getItem("shambamarket-theme") === "dark") {
  document.body.classList.add("dark-theme");
}

$("current-year").textContent = new Date().getFullYear();
setAuthMode("login");
renderCategories();
