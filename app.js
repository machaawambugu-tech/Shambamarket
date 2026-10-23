
import { supabase } from "./supabase-config.js";

/* =========================================================
   SHAMBAMARKET — COMPLETE APPLICATION
   Supabase authentication, marketplace, cart and messaging
========================================================= */

const DEPARTMENTS = {
  "Fresh Produce": [
    "Fruits", "Vegetables", "Nuts"
  ],
  "Crops & Grains": [
    "Starchy Foods", "Grains", "Cereals", "Legumes",
    "Spices", "Herbal Products"
  ],
  "Farm Tools & Equipment": [
    "Hand Tools", "Power Tools", "Farm Machinery",
    "Irrigation Equipment", "Sprayers", "Harvesting Equipment",
    "Storage Equipment", "Protective Equipment"
  ],
  "Agricultural Inputs & Fertilizers": [
    "Seeds", "Seedlings", "Fertilizers", "Organic Manure",
    "Compost", "Crop Protection", "Animal Feed",
    "Planting Materials"
  ],
  "Livestock & Poultry": [
    "Cattle", "Goats", "Sheep", "Pigs", "Chickens",
    "Ducks", "Turkeys", "Rabbits", "Other Livestock"
  ],
  "Animal & Farm Products": [
    "Milk", "Eggs", "Honey", "Wool", "Hides & Skins",
    "Processed Farm Products", "Other Farm Products"
  ],
  "Farm Services": [
    "Tractor Hire", "Ploughing", "Planting", "Harvesting",
    "Irrigation Installation", "Transport",
    "Agricultural Consultancy", "Other Farm Services"
  ]
};

const LEGACY_CATEGORIES = [
  "Fruits", "Vegetables", "Nuts", "Starchy Foods",
  "Grains", "Cereals", "Legumes", "Spices", "Herbal Products"
];

const ALL_CATEGORIES = Object.values(DEPARTMENTS).flat();

const AUTH_IMAGES = [
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1500&q=85",
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1500&q=85",
  "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1500&q=85"
];

const CART_KEY = "shambamarket-cart-v1";

const $ = (selector, parent = document) =>
  parent.querySelector(selector);

const $$ = (selector, parent = document) =>
  [...parent.querySelectorAll(selector)];

let currentUser = null;
let currentProfile = null;
let allListings = [];
let selectedCategory = "All Categories";
let selectedDepartment = "All";
let selectedProduct = null;
let cart = [];
let authMode = "login";
let slideshowTimer = null;
let activeConversation = null;
let messageChannel = null;
let messageRefreshTimer = null;

/* =========================================================
   GENERAL HELPERS
========================================================= */

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
  toast.classList.add("visible", "show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("visible", "show");
  }, 3500);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
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

function normalizePhone(value = "") {
  let phone = String(value).replace(/[^\d+]/g, "");

  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00")) phone = phone.slice(2);

  if (phone.startsWith("0") && phone.length === 10) {
    phone = "254" + phone.slice(1);
  } else if (/^[17]\d{8}$/.test(phone)) {
    phone = "254" + phone;
  }

  return /^254\d{9}$/.test(phone) ? phone : "";
}

function departmentForCategory(category) {
  return Object.entries(DEPARTMENTS).find(
    ([, categories]) => categories.includes(category)
  )?.[0] || "Other";
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeButton(label, className, callback) {
  const button = createElement("button", className, label);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}

function getUserName(user = currentUser) {
  return currentProfile?.name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Marketplace member";
}

function getUserRole() {
  return currentProfile?.role ||
    currentUser?.user_metadata?.role ||
    "customer";
}

/* =========================================================
   AUTHENTICATION SLIDESHOW
========================================================= */

function setupAuthSlideshow() {
  const panel = $(".auth-photo");
  if (!panel) return;

  clearInterval(slideshowTimer);

  let index = 0;

  const setImage = src => {
    panel.style.backgroundImage = `
      linear-gradient(0deg, rgba(16,27,45,.88), rgba(16,27,45,.08)),
      url("${src}")
    `;
  };

  setImage(AUTH_IMAGES[0]);

  AUTH_IMAGES.forEach(src => {
    const image = new Image();
    image.src = src;
  });

  slideshowTimer = setInterval(() => {
    index = (index + 1) % AUTH_IMAGES.length;
    setImage(AUTH_IMAGES[index]);
  }, 5000);
}

/* =========================================================
   AUTHENTICATION AND PROFILES
========================================================= */

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";

  const fields = $("#signup-fields");
  if (fields) fields.hidden = !signup;

  const nameInput = $("#auth-name");
  if (nameInput) nameInput.required = signup;

  setText("auth-title", signup ? "Create your account" : "Welcome back");
  setText(
    "auth-description",
    signup
      ? "Join ShambaMarket and connect with Kenya's agricultural community."
      : "Sign in to discover agricultural products and services."
  );
  setText("auth-submit", signup ? "Create account" : "Sign in");

  $("#show-login")?.classList.toggle("active", !signup);
  $("#show-signup")?.classList.toggle("active", signup);

  const password = $("#auth-password");
  if (password) {
    password.autocomplete = signup ? "new-password" : "current-password";
  }

  setStatus("auth-status", "");
}

async function getOrCreateProfile(user, fallback = {}) {
  /*
   * This expects a table named "profiles" with:
   * id, name, email, role, phone.
   * If your Supabase table is named "profile" instead,
   * we must align this query with your actual schema.
   */
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing;

  const profile = {
    id: user.id,
    name: fallback.name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Member",
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

  const button = $("#auth-submit");
  if (button) {
    button.disabled = true;
    button.textContent = "Please wait...";
  }

  try {
    if (authMode === "signup") {
      const name = getValue("auth-name");
      const role = getValue("auth-role") || "customer";

      if (!name) throw new Error("Please enter your name.");

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role, phone: "" }
        }
      });

      if (error) throw error;

      if (data.user && data.session) {
        currentUser = data.user;
        currentProfile = await getOrCreateProfile(data.user, { name, role });
        await startApp();
        showToast("Account created successfully.");
      } else {
        setAuthMode("login");
        setStatus(
          "auth-status",
          "Account created. Check your email to confirm your address, then sign in."
        );
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
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
    setStatus("auth-status", error.message || "Authentication failed.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = authMode === "signup" ? "Create account" : "Sign in";
    }
  }
}

/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(pageName) {
  $$(".app-page").forEach(page => {
    const name = page.id.replace(/-page$/, "");
    const visible = name === pageName;

    page.hidden = !visible;
    page.classList.toggle("active", visible);
  });

  $$(".nav-link[data-page]").forEach(link => {
    link.classList.toggle("active", link.dataset.page === pageName);
  });

  if (pageName === "market") loadListings();
  if (pageName === "farmer") loadFarmerListings();
  if (pageName === "cart") renderCart();
  if (pageName === "messages") loadConversations();
}

function setupNavigation() {
  $$(".nav-link[data-page]").forEach(link => {
    link.addEventListener("click", () => showPage(link.dataset.page));
  });

  $("#browse-button")?.addEventListener("click", () => {
    $("#marketplace")?.scrollIntoView({ behavior: "smooth" });
  });

  $("#sell-button")?.addEventListener("click", () => showPage("farmer"));

  $("#details-back-button")?.addEventListener("click", () => {
    showPage("market");
  });

  $("#cart-continue-button")?.addEventListener("click", () => {
    showPage("market");
  });

  $("#cart-contact-button")?.addEventListener("click", contactCartSellers);
}

/* =========================================================
   CATEGORY FILTERS AND DYNAMIC LISTING FIELDS
========================================================= */

function setupCategories() {
  const filter = $("#category-list");
  const select = $("#product-category");

  if (filter) {
    filter.replaceChildren();

    ["All Categories", ...ALL_CATEGORIES].forEach(category => {
      const button = makeButton(
        category,
        "category-chip",
        () => {
          selectedCategory = category;
          selectedDepartment = "All";

          $$(".category-chip", filter).forEach(chip => {
            chip.classList.toggle("active", chip.textContent === category);
          });

          renderListings();
        }
      );

      if (category === selectedCategory) button.classList.add("active");
      filter.appendChild(button);
    });
  }

  if (select) {
    select.replaceChildren();
    select.add(new Option("Choose a department", ""));

    Object.keys(DEPARTMENTS).forEach(department => {
      select.add(new Option(department, department));
    });

    select.add(new Option("Existing produce categories", "Legacy Produce"));
    select.addEventListener("change", updateSubcategories);
  }

  $("#market-category-grid")?.addEventListener("click", event => {
    const button = event.target.closest("[data-market-category]");
    if (!button) return;

    const department = button.dataset.marketCategory;
    selectedDepartment = DEPARTMENTS[department] ? department : "All";

    if (department === "All") {
      selectedCategory = "All Categories";
    } else if (ALL_CATEGORIES.includes(department)) {
      selectedCategory = department;
      selectedDepartment = "All";
    } else if (DEPARTMENTS[department]) {
      selectedCategory = "All Categories";
    } else {
      selectedCategory = "All Categories";
      selectedDepartment = "All";
    }

    renderListings();
    $("#marketplace")?.scrollIntoView({ behavior: "smooth" });
  });
}

function updateSubcategories() {
  const department = getValue("product-category");
  const subcategory = $("#product-subcategory");
  if (!subcategory) return;

  subcategory.replaceChildren();
  subcategory.add(new Option("Choose a category", ""));

  const choices = department === "Legacy Produce"
    ? LEGACY_CATEGORIES
    : (DEPARTMENTS[department] || []);

  choices.forEach(category => subcategory.add(new Option(category, category)));

  subcategory.required = Boolean(department);
  renderDynamicFields(department);
  updateUnitOptions(department);
}

function renderDynamicFields(department) {
  const container = $("#dynamic-product-fields");
  if (!container) return;

  container.replaceChildren();

  const fieldSets = {
    "Livestock & Poultry": [
      ["Breed", "extra-breed", "text", "e.g. Friesian"],
      ["Age", "extra-age", "text", "e.g. 18 months"],
      ["Health details", "extra-health", "text", "Relevant health information"]
    ],
    "Agricultural Inputs & Fertilizers": [
      ["Brand", "extra-brand", "text", "Brand name (optional)"],
      ["Package size", "extra-package", "text", "e.g. 25 kg bag"],
      ["Expiry date", "extra-expiry", "date", ""]
    ],
    "Farm Tools & Equipment": [
      ["Brand / model", "extra-brand", "text", "Brand or model"],
      ["Equipment condition", "extra-condition", "select", "New,Used,Refurbished"]
    ],
    "Farm Services": [
      ["Service area", "extra-area", "text", "Areas served"],
      ["Pricing basis", "extra-basis", "select", "Per acre,Per hour,Per day,Per trip,Fixed fee"]
    ],
    "Animal & Farm Products": [
      ["Packaging details", "extra-package", "text", "Packaging or quality details"]
    ]
  };

  (fieldSets[department] || []).forEach(([label, id, type, hint]) => {
    const wrapper = createElement("div", "form-field");
    const labelElement = createElement("label", "", label);
    labelElement.htmlFor = id;

    let input;

    if (type === "select") {
      input = document.createElement("select");
      input.add(new Option("Choose an option", ""));
      hint.split(",").forEach(value => input.add(new Option(value, value)));
    } else {
      input = document.createElement("input");
      input.type = type;
      if (hint) input.placeholder = hint;
    }

    input.id = id;
    input.dataset.extraField = "true";

    wrapper.append(labelElement, input);
    container.appendChild(wrapper);
  });
}

function updateUnitOptions(department) {
  const unit = $("#product-unit");
  if (!unit) return;

  const optionsByDepartment = {
    "Livestock & Poultry": ["animal", "bird", "piece"],
    "Farm Services": ["service", "acre", "hour", "day", "item"],
    "Agricultural Inputs & Fertilizers": ["kg", "bag", "sack", "tonne", "packet", "litre", "item"],
    "Farm Tools & Equipment": ["item", "piece", "day", "hour"],
    "Animal & Farm Products": ["kg", "litre", "piece", "crate", "item"]
  };

  const options = optionsByDepartment[department] || [
    "kg", "bag", "crate", "piece", "bunch", "litre", "sack", "tonne"
  ];

  const labels = {
    kg: "Kilograms (kg)", bag: "Bags", crate: "Crates",
    piece: "Pieces", bunch: "Bunches", litre: "Litres",
    animal: "Animals", bird: "Birds", packet: "Packets",
    sack: "Sacks", tonne: "Tonnes", hour: "Hours",
    day: "Days", acre: "Acres", service: "Services", item: "Items"
  };

  const previous = unit.value;
  unit.replaceChildren();

  options.forEach(value => unit.add(new Option(labels[value] || value, value)));

  if (options.includes(previous)) unit.value = previous;
}

/* =========================================================
   MARKETPLACE LISTINGS
========================================================= */

async function loadListings() {
  setStatus("market-status", "Loading listings...");

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load listings:", error);
    allListings = [];
    renderListings();
    setStatus("market-status", "Could not load listings. Check Supabase permissions.", true);
    return;
  }

  allListings = data || [];
  renderListings();

  setStatus(
    "market-status",
    allListings.length
      ? `${allListings.length} listing(s) available`
      : "No products listed yet."
  );
}

function getFilteredListings() {
  const search = getValue("search-input").toLowerCase();
  const county = getValue("county-filter").toLowerCase();
  const sort = getValue("sort-products");

  let results = [...allListings];

  if (selectedDepartment !== "All" && DEPARTMENTS[selectedDepartment]) {
    const categories = DEPARTMENTS[selectedDepartment];
    results = results.filter(item => categories.includes(item.category));
  }

  if (selectedCategory !== "All Categories") {
    results = results.filter(item => item.category === selectedCategory);
  }

  if (search) {
    results = results.filter(item => [
      item.product_name, item.category, item.county, item.town,
      item.farmer_name, item.description
    ].join(" ").toLowerCase().includes(search));
  }

  if (county) {
    results = results.filter(
      item => (item.county || "").toLowerCase() === county
    );
  }

  if (sort === "price-low") {
    results.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sort === "price-high") {
    results.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    results.sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }

  return results;
}

function renderListings() {
  const container = $("#product-list");
  if (!container) return;

  const listings = getFilteredListings();
  container.replaceChildren();

  setText("listing-summary", `${listings.length} listing(s) found`);

  const empty = $("#empty-message");
  if (empty) empty.hidden = listings.length > 0;

  listings.forEach(item => {
    const card = createElement("article", "product-card");

    if (item.photo_url) {
      const image = createElement("img", "product-photo");
      image.src = item.photo_url;
      image.alt = item.product_name || "Product photo";
      image.loading = "lazy";
      image.onerror = () => {
        image.replaceWith(createElement("div", "product-photo product-photo-placeholder", "🌱"));
      };
      card.appendChild(image);
    } else {
      card.appendChild(createElement("div", "product-photo product-photo-placeholder", "🌱"));
    }

    const body = createElement("div", "product-body");
    body.appendChild(createElement("span", "product-category-label", item.category || "Other"));
    body.appendChild(createElement("h3", "", item.product_name || "Untitled listing"));
    body.appendChild(createElement("p", "product-price", `${formatPrice(item.price)} / ${item.unit || "item"}`));
    body.appendChild(createElement("p", "product-meta", `Available: ${item.quantity ?? "Ask seller"} ${item.unit || ""}`));
    body.appendChild(createElement("p", "product-meta", `📍 ${[item.town, item.county].filter(Boolean).join(", ") || "Location not provided"}`));
    body.appendChild(createElement("p", "product-meta", `Seller: ${item.farmer_name || "Local seller"}`));

    const actions = createElement("div", "product-actions");

    actions.appendChild(makeButton("View details", "button button-primary", () => {
      openProductDetails(item);
    }));

    actions.appendChild(makeButton("Message seller", "button button-outline", () => {
      startConversationWithSeller(item);
    }));

    body.appendChild(actions);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function setupMarketFilters() {
  ["search-input", "county-filter", "sort-products"].forEach(id => {
    const element = $(`#${id}`);
    if (!element) return;

    element.addEventListener(
      element.tagName === "SELECT" ? "change" : "input",
      renderListings
    );
  });
}

/* =========================================================
   PRODUCT DETAILS AND CONTACT
========================================================= */

function openProductDetails(item) {
  selectedProduct = item;

  const container = $("#product-details-content");
  if (!container) return;

  container.replaceChildren();

  const panel = createElement("article", "panel product-detail-panel");

  if (item.photo_url) {
    const image = createElement("img", "product-detail-image");
    image.src = item.photo_url;
    image.alt = item.product_name || "Product photo";
    panel.appendChild(image);
  }

  panel.appendChild(createElement("p", "eyebrow", item.category || "Marketplace listing"));
  panel.appendChild(createElement("h2", "", item.product_name || "Untitled listing"));
  panel.appendChild(createElement("h3", "product-price", `${formatPrice(item.price)} / ${item.unit || "item"}`));

  const information = createElement("div", "product-detail-info");

  [
    ["Department", departmentForCategory(item.category)],
    ["Category", item.category || "Not specified"],
    ["Condition", item.condition || "Not specified"],
    ["Quantity", `${item.quantity ?? "Unknown"} ${item.unit || ""}`],
    ["County", item.county || "Not provided"],
    ["Town", item.town || "Not provided"],
    ["Seller", item.farmer_name || "Marketplace seller"],
    ["Description", item.description || "No additional description."]
  ].forEach(([label, value]) => {
    const line = createElement("p");
    line.append(
      createElement("strong", "", `${label}: `),
      document.createTextNode(value)
    );
    information.appendChild(line);
  });

  panel.appendChild(information);

  const actions = createElement("div", "product-actions");

  actions.appendChild(makeButton("Add to cart", "button button-primary", () => addToCart(item)));
  actions.appendChild(makeButton("Message seller", "button button-outline", () => startConversationWithSeller(item)));

  const phone = normalizePhone(item.phone);

  if (phone) {
    const call = createElement("a", "button button-outline", "Call seller");
    call.href = `tel:+${phone}`;
    actions.appendChild(call);

    const whatsapp = createElement("a", "button button-outline", "WhatsApp");
    whatsapp.href = `https://wa.me/${phone}?text=${encodeURIComponent(`Hello, I am interested in ${item.product_name} on ShambaMarket.`)}`;
    whatsapp.target = "_blank";
    whatsapp.rel = "noopener noreferrer";
    actions.appendChild(whatsapp);
  }

  panel.appendChild(actions);
  container.appendChild(panel);
  showPage("details");
}

/* =========================================================
   CART
========================================================= */

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    cart = Array.isArray(saved) ? saved : [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    showToast("Your browser could not save the cart.");
  }

  updateCartCount();
}

function updateCartCount() {
  setText("cart-count", String(
    cart.reduce((total, item) => total + item.cartQuantity, 0)
  ));
}

function addToCart(item) {
  if (!item?.id) {
    showToast("This listing has no valid ID.");
    return;
  }

  const existing = cart.find(row => String(row.id) === String(item.id));

  if (existing) {
    if (existing.cartQuantity >= existing.quantity) {
      showToast("You have added all of the listed quantity.");
      return;
    }
    existing.cartQuantity += 1;
  } else {
    cart.push({
      id: item.id,
      product_name: item.product_name,
      category: item.category,
      price: Number(item.price) || 0,
      unit: item.unit || "item",
      quantity: Math.max(1, Number(item.quantity) || 1),
      phone: item.phone || "",
      farmer_name: item.farmer_name || "",
      cartQuantity: 1
    });
  }

  saveCart();
  showToast("Added to cart.");
}

function renderCart() {
  const container = $("#cart-items");
  if (!container) return;

  container.replaceChildren();

  if (!cart.length) {
    container.appendChild(createElement(
      "p", "muted",
      "Your cart is empty. Browse the marketplace to add products."
    ));
    setText("cart-subtotal", formatPrice(0));
    return;
  }

  cart.forEach(item => {
    const row = createElement("article", "cart-item");
    row.appendChild(createElement("h3", "", item.product_name));
    row.appendChild(createElement("p", "", `${formatPrice(item.price)} / ${item.unit}`));
    row.appendChild(createElement("p", "", `Quantity: ${item.cartQuantity}`));
    row.appendChild(createElement("p", "", `Subtotal: ${formatPrice(item.price * item.cartQuantity)}`));

    const actions = createElement("div", "cart-item-actions");

    actions.appendChild(makeButton("−", "button button-outline", () => changeCartQuantity(item.id, -1)));
    actions.appendChild(makeButton("+", "button button-outline", () => changeCartQuantity(item.id, 1)));
    actions.appendChild(makeButton("Remove", "button button-outline", () => removeCartItem(item.id)));

    row.appendChild(actions);
    container.appendChild(row);
  });

  const total = cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0);
  setText("cart-subtotal", formatPrice(total));
}

function changeCartQuantity(id, amount) {
  const item = cart.find(row => String(row.id) === String(id));
  if (!item) return;

  const next = item.cartQuantity + amount;

  if (next <= 0) {
    removeCartItem(id);
    return;
  }

  if (next > item.quantity) {
    showToast("That exceeds the quantity listed by the seller.");
    return;
  }

  item.cartQuantity = next;
  saveCart();
  renderCart();
}

function removeCartItem(id) {
  cart = cart.filter(item => String(item.id) !== String(id));
  saveCart();
  renderCart();
  showToast("Item removed from cart.");
}

function contactCartSellers() {
  if (!cart.length) {
    showToast("Your cart is empty.");
    return;
  }

  const first = cart.find(item => normalizePhone(item.phone));

  if (!first) {
    setStatus("cart-status", "No seller in your cart has a valid contact number.");
    return;
  }

  const phone = normalizePhone(first.phone);
  const message = cart
    .filter(item => normalizePhone(item.phone) === phone)
    .map(item => `${item.product_name} x ${item.cartQuantity}`)
    .join(", ");

  setStatus(
    "cart-status",
    "Confirm stock, delivery, total price and payment directly with the seller. No payment has been taken."
  );

  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent("Hello, I am enquiring about: " + message)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

/* =========================================================
   PHOTO UPLOAD AND PREVIEW
========================================================= */

function setupPhotoPreview() {
  const input = $("#product-photo");
  if (!input) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    const preview = $("#photo-preview");

    if (!file) {
      if (preview) {
        preview.replaceChildren();
        preview.hidden = true;
      }
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Choose a JPG, PNG or WebP image.");
      input.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Choose an image smaller than 5 MB.");
      input.value = "";
      return;
    }

    if (preview) {
      preview.replaceChildren();

      const image = createElement("img");
      image.src = URL.createObjectURL(file);
      image.alt = "Listing photo preview";
      image.style.maxWidth = "100%";
      image.style.maxHeight = "220px";

      preview.appendChild(image);
      preview.hidden = false;
    }
  });
}

async function uploadProductPhoto(file) {
  if (!file) return "";

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
  const path = `${currentUser.id}/${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await supabase.storage
    .from("product-photos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  return supabase.storage
    .from("product-photos")
    .getPublicUrl(path).data.publicUrl;
}

/* =========================================================
   PUBLISH LISTING
========================================================= */

async function handleProductSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    showToast("Please sign in before publishing.");
    return;
  }

  const department = getValue("product-category");
  const category = getValue("product-subcategory");
  const name = getValue("product-name");
  const price = Number(getValue("product-price"));
  const quantity = Number(getValue("product-quantity"));

  if (!department || !category || !name) {
    setStatus("farmer-status", "Choose a department, category and product name.", true);
    return;
  }

  if (!Number.isFinite(price) || price < 0 ||
      !Number.isFinite(quantity) || quantity <= 0) {
    setStatus("farmer-status", "Enter a valid price and quantity.", true);
    return;
  }

  const button = $("#publish-button");
  if (button) {
    button.disabled = true;
    button.textContent = "Publishing...";
  }

  try {
    const file = $("#product-photo")?.files?.[0];
    const photoUrl = await uploadProductPhoto(file);

    const extraDetails = $$("[data-extra-field]")
      .map(input => {
        const label = input.closest(".form-field")?.querySelector("label")?.textContent;
        return input.value ? `${label || input.id}: ${input.value}` : "";
      })
      .filter(Boolean)
      .join("\n");

    const description = [
      getValue("product-description"),
      extraDetails
    ].filter(Boolean).join("\n\n");

    /*
     * Only columns already used by the existing application are inserted.
     * The selected department is included in the description so no new
     * database column is required for this initial rebuild.
     */
    const listing = {
      owner_id: currentUser.id,
      product_name: name,
      category,
      price,
      quantity,
      unit: getValue("product-unit") || "item",
      condition: getValue("product-condition") || "Good",
      county: getValue("product-county"),
      town: getValue("product-town"),
      farmer_name: getUserName(),
      phone: currentProfile?.phone || currentUser.user_metadata?.phone || "",
      photo_url: photoUrl,
      description: `Department: ${department}\n${description}`.trim()
    };

    const { error } = await supabase.from("listings").insert(listing);
    if (error) throw error;

    $("#product-form")?.reset();

    const preview = $("#photo-preview");
    if (preview) {
      preview.replaceChildren();
      preview.hidden = true;
    }

    $("#dynamic-product-fields")?.replaceChildren();
    updateSubcategories();

    setStatus("farmer-status", "Listing published successfully.");
    showToast("Your listing is now live.");

    await loadListings();
    await loadFarmerListings();
  } catch (error) {
    console.error("Publishing error:", error);
    setStatus("farmer-status", error.message || "Could not publish listing.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Publish Product";
    }
  }
}

/* =========================================================
   FARMER'S LISTINGS
========================================================= */

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
    setStatus("farmer-status", "Could not load your listings.", true);
    return;
  }

  if (!data?.length) {
    container.appendChild(createElement("p", "muted", "You have not published any listings yet."));
    return;
  }

  data.forEach(item => {
    const row = createElement("article", "farmer-listing");
    const details = createElement("div");

    details.appendChild(createElement("strong", "", item.product_name));
    details.appendChild(createElement("p", "", `${item.category} · ${formatPrice(item.price)}`));
    details.appendChild(createElement("small", "", item.county || "Location not set"));

    const remove = makeButton("Delete", "button button-outline", async () => {
      if (!window.confirm(`Delete "${item.product_name}"?`)) return;

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

    row.append(details, remove);
    container.appendChild(row);
  });
}

/* =========================================================
   DIRECT MESSAGING — SUPABASE
========================================================= */

/*
 * This messaging code expects these tables:
 *
 * conversations:
 *   id, created_at, updated_at
 *
 * conversation_participants:
 *   conversation_id, user_id
 *
 * messages:
 *   id, conversation_id, sender_id, body, created_at
 *
 * Configure the tables, foreign keys, Realtime publication and
 * participant-only RLS policies before using direct messaging.
 */

function stopMessageSubscription() {
  if (messageChannel) {
    supabase.removeChannel(messageChannel);
    messageChannel = null;
  }

  if (messageRefreshTimer) {
    clearInterval(messageRefreshTimer);
    messageRefreshTimer = null;
  }
}

async function loadConversations() {
  const container = $("#conversation-list");
  if (!container || !currentUser) return;

  stopMessageSubscription();
  container.replaceChildren();

  setStatus("messages-status", "Loading your conversations...");

  const { data: memberships, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  if (membershipError) {
    console.error("Conversation list error:", membershipError);
    setStatus(
      "messages-status",
      "Messaging setup is incomplete. Create the messaging tables and security policies in Supabase first.",
      true
    );
    return;
  }

  const ids = [...new Set((memberships || []).map(row => row.conversation_id))];

  if (!ids.length) {
    container.appendChild(createElement(
      "p", "muted",
      "No conversations yet. Open a marketplace listing and choose Message seller."
    ));
    setStatus("messages-status", "");
    return;
  }

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("*")
    .in("id", ids)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Conversation query error:", error);
    setStatus("messages-status", "Could not load conversations.", true);
    return;
  }

  const { data: participants, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id,user_id")
    .in("conversation_id", ids);

  if (participantError) {
    setStatus("messages-status", "Could not load conversation participants.", true);
    return;
  }

  const otherIds = [...new Set(
    (participants || [])
      .filter(row => row.user_id !== currentUser.id)
      .map(row => row.user_id)
  )];

  let profiles = [];

  if (otherIds.length) {
    const result = await supabase
      .from("profiles")
      .select("id,name")
      .in("id", otherIds);

    if (result.error) {
      console.error("Profile lookup error:", result.error);
    } else {
      profiles = result.data || [];
    }
  }

  conversations?.forEach(conversation => {
    const others = (participants || []).filter(
      row => row.conversation_id === conversation.id &&
        row.user_id !== currentUser.id
    );

    const names = others.map(person =>
      profiles.find(profile => profile.id === person.user_id)?.name ||
      "Marketplace member"
    );

    const button = makeButton(
      names.join(", ") || "Conversation",
      "conversation-item",
      () => openConversation(conversation.id, names.join(", "))
    );

    button.setAttribute("aria-label", `Open conversation with ${names.join(", ") || "marketplace member"}`);
    container.appendChild(button);
  });

  setStatus("messages-status", "");
}

async function startConversationWithSeller(listing) {
  if (!currentUser) {
    showToast("Sign in to message a seller.");
    showAuthScreen();
    return;
  }

  if (!listing?.owner_id) {
    showToast("This listing has no seller account linked.");
    return;
  }

  if (listing.owner_id === currentUser.id) {
    showToast("This is your own listing.");
    return;
  }

  setStatus("messages-status", "Opening conversation...");

  try {
    const { data: mine, error: mineError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", currentUser.id);

    if (mineError) throw mineError;

    const myConversationIds = (mine || []).map(row => row.conversation_id);

    if (myConversationIds.length) {
      const { data: theirs, error: theirsError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", listing.owner_id)
        .in("conversation_id", myConversationIds);

      if (theirsError) throw theirsError;

      if (theirs?.length) {
        await openConversation(theirs[0].conversation_id, listing.farmer_name || "Seller");
        return;
      }
    }

    const { data: conversation, error: createError } = await supabase
      .from("conversations")
      .insert({})
      .select()
      .single();

    if (createError) throw createError;

    const { error: participantInsertError } = await supabase
      .from("conversation_participants")
      .insert([
        { conversation_id: conversation.id, user_id: currentUser.id },
        { conversation_id: conversation.id, user_id: listing.owner_id }
      ]);

    if (participantInsertError) throw participantInsertError;

    const firstMessage = `Hello! I am interested in your listing: ${listing.product_name}.`;

    const { error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        sender_id: currentUser.id,
        body: firstMessage
      });

    if (messageError) throw messageError;

    await openConversation(conversation.id, listing.farmer_name || "Seller");
  } catch (error) {
    console.error("Start conversation error:", error);
    setStatus(
      "messages-status",
      "Could not start a conversation. Check that the messaging tables and policies are installed.",
      true
    );
    showPage("messages");
  }
}

async function openConversation(conversationId, title = "Conversation") {
  if (!currentUser) return;

  activeConversation = conversationId;
  showPage("messages");

  setText("conversation-header", title);
  setStatus("messages-status", "Loading messages...");

  const form = $("#message-form");
  if (form) form.dataset.conversationId = conversationId;

  await loadMessages(conversationId);

  stopMessageSubscription();

  messageChannel = supabase
    .channel(`chat-${conversationId}-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`
      },
      payload => {
        const message = payload.new;
        if (message.sender_id !== currentUser.id) {
          renderSingleMessage(message);
        }
      }
    )
    .subscribe();

  // Fallback refresh if Realtime has not been enabled yet.
  messageRefreshTimer = setInterval(() => {
    if (activeConversation === conversationId) {
      loadMessages(conversationId);
    }
  }, 10000);
}

async function loadMessages(conversationId) {
  const container = $("#message-list");
  if (!container || !currentUser) return;

  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load messages error:", error);
    setStatus("messages-status", "Could not load messages.", true);
    return;
  }

  container.replaceChildren();
  (data || []).forEach(renderSingleMessage);
  setStatus("messages-status", "");

  container.scrollTop = container.scrollHeight;
}

function renderSingleMessage(message) {
  const container = $("#message-list");
  if (!container || !message) return;

  if (message.id && $(`[data-message-id="${CSS.escape(String(message.id))}"]`, container)) {
    return;
  }

  const mine = message.sender_id === currentUser?.id;
  const bubble = createElement(
    "article",
    `message-bubble ${mine ? "message-mine" : "message-theirs"}`
  );

  if (message.id) bubble.dataset.messageId = message.id;

  bubble.appendChild(createElement("p", "message-text", message.body || ""));

  const date = message.created_at
    ? new Date(message.created_at).toLocaleString("en-KE", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "";

  bubble.appendChild(createElement("small", "message-time", date));
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function handleMessageSubmit(event) {
  event.preventDefault();

  if (!currentUser || !activeConversation) {
    setStatus("messages-status", "Open a conversation before sending a message.", true);
    return;
  }

  const input = $("#message-input");
  const body = input?.value?.trim() || "";

  if (!body) return;
  if (body.length > 4000) {
    setStatus("messages-status", "Messages must be 4,000 characters or fewer.", true);
    return;
  }

  const button = $("#send-message-button");
  if (button) button.disabled = true;

  try {
    const { error } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeConversation,
        sender_id: currentUser.id,
        body
      });

    if (error) throw error;

    if (input) input.value = "";
    await loadMessages(activeConversation);

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeConversation);
  } catch (error) {
    console.error("Send message error:", error);
    setStatus("messages-status", "Message could not be sent. Check your connection and permissions.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

/* =========================================================
   ACCOUNT, THEME AND SIGN-OUT
========================================================= */

function updateAccountDetails() {
  const name = getUserName();
  setText("account-label", name);
  setText("farmer-name", name);

  const role = getUserRole();

  $$('.nav-link[data-page="farmer"]').forEach(link => {
    link.hidden = role !== "farmer";
  });

  $$('[data-page="farmer"]').forEach(element => {
    if (!element.classList.contains("nav-link")) {
      element.hidden = role !== "farmer";
    }
  });
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

function showAuthScreen() {
  stopMessageSubscription();

  const authPage = $("#auth-page");
  const appShell = $("#app-shell");

  if (authPage) authPage.hidden = false;
  if (appShell) appShell.hidden = true;

  setAuthMode("login");
  setupAuthSlideshow();
}

async function signOut() {
  stopMessageSubscription();

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Sign-out error:", error);
    showToast("Could not sign out.");
    return;
  }

  currentUser = null;
  currentProfile = null;
  activeConversation = null;
  allListings = [];

  showAuthScreen();
}

/* =========================================================
   START APPLICATION
========================================================= */

async function startApp() {
  const authPage = $("#auth-page");
  const appShell = $("#app-shell");

  if (authPage) authPage.hidden = true;
  if (appShell) appShell.hidden = false;

  updateAccountDetails();
  await loadListings();

  showPage(getUserRole() === "farmer" ? "farmer" : "market");
}

function setupEventListeners() {
  $("#auth-form")?.addEventListener("submit", handleAuthSubmit);

  $("#show-login")?.addEventListener("click", event => {
    event.preventDefault();
    setAuthMode("login");
  });

  $("#show-signup")?.addEventListener("click", event => {
    event.preventDefault();
    setAuthMode("signup");
  });

  $("#logout-button")?.addEventListener("click", signOut);
  $("#settings-logout")?.addEventListener("click", signOut);

  $("#product-form")?.addEventListener("submit", handleProductSubmit);
  $("#message-form")?.addEventListener("submit", handleMessageSubmit);

  setupNavigation();
  setupMarketFilters();
  setupPhotoPreview();
  setupTheme();
}

async function init() {
  setText("current-year", new Date().getFullYear());

  setupCategories();
  setupEventListeners();
  setupAuthSlideshow();
  loadCart();
  updateCartCount();

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

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        activeConversation = null;
        showAuthScreen();
      }
    });
  } catch (error) {
    console.error("Startup error:", error);
    showAuthScreen();
    setStatus(
      "auth-status",
      "Could not connect. Check your Supabase configuration, profile table and access policies.",
      true
    );
  }
}

init();
