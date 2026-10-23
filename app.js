
import { supabase } from "./supabase-config.js";

/* =========================================================
   SHAMBAMARKET — REBUILT APPLICATION
   Marketplace • Categories • Farmer listings • Cart
   Supabase Auth • Direct messages • Realtime • Dark mode
========================================================= */

const DEPARTMENTS = {
  "Fresh Produce": ["Fruits", "Vegetables", "Nuts"],
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
    "Compost", "Crop Protection", "Animal Feed", "Planting Materials"
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
  "Fruits", "Vegetables", "Nuts", "Starchy Foods", "Grains",
  "Cereals", "Legumes", "Spices", "Herbal Products"
];

const CATEGORIES = Object.values(DEPARTMENTS).flat();
const CART_KEY = "shambamarket-cart-v2";

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
let messageChannel = null;
let messageRefreshTimer = null;
let activeConversation = null;
let profileTable = "profiles";

const KENYAN_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet",
  "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado",
  "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga",
  "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia",
  "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit",
  "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi",
  "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River",
  "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu",
  "Vihiga", "Wajir", "West Pokot", "Other"
];

/* -------------------- HELPERS -------------------- */

function value(id) {
  return $(`#${id}`)?.value?.trim() || "";
}

function setText(id, text) {
  const element = $(`#${id}`);
  if (element) element.textContent = text ?? "";
}

function status(id, message, error = false) {
  const element = $(`#${id}`);
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", error);
  element.setAttribute("role", "status");
}

function toast(message) {
  const element = $("#toast");
  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.classList.add("visible", "show");

  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => element.classList.remove("visible", "show"),
    3500
  );
}

function escapeHTML(text = "") {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[char]);
}

function price(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

function makeElement(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function makeButton(label, className, callback) {
  const button = makeElement("button", className, label);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}

function normalizePhone(input = "") {
  let phone = String(input).replace(/[^\d+]/g, "");

  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00")) phone = phone.slice(2);

  if (phone.startsWith("0") && phone.length === 10) {
    phone = "254" + phone.slice(1);
  } else if (/^[17]\d{8}$/.test(phone)) {
    phone = "254" + phone;
  }

  return /^254\d{9}$/.test(phone) ? phone : "";
}

function userName() {
  return currentProfile?.name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split("@")[0] ||
    "Marketplace member";
}

function userRole() {
  return currentProfile?.role ||
    currentUser?.user_metadata?.role ||
    "customer";
}

function departmentFor(category) {
  return Object.entries(DEPARTMENTS).find(
    ([, categories]) => categories.includes(category)
  )?.[0] || "Other";
}

function listingDepartment(item) {
  const match = String(item.description || "").match(/^Department:\s*(.+)$/m);
  return match?.[1]?.trim() || departmentFor(item.category);
}

/* -------------------- AUTHENTICATION -------------------- */

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";

  if ($("#signup-fields")) $("#signup-fields").hidden = !signup;
  if ($("#auth-name")) $("#auth-name").required = signup;

  setText("auth-title", signup ? "Create your account" : "Welcome back");
  setText(
    "auth-description",
    signup
      ? "Join Kenya's agricultural marketplace."
      : "Sign in to explore ShambaMarket."
  );
  setText("auth-submit", signup ? "Create account" : "Sign in");

  $("#show-login")?.classList.toggle("active", !signup);
  $("#show-signup")?.classList.toggle("active", signup);

  status("auth-status", "");
}

async function getProfile(user, fallback = {}) {
  const profile = {
    id: user.id,
    name: fallback.name || user.user_metadata?.name ||
      user.email?.split("@")[0] || "Member",
    email: user.email || "",
    role: fallback.role || user.user_metadata?.role || "customer",
    phone: fallback.phone || user.user_metadata?.phone || ""
  };

  // Try the common table name first, then the singular name.
  for (const table of ["profiles", "profile"]) {
    const result = await supabase
      .from(table)
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (result.error) {
      if (
        result.error.code === "42P01" ||
        result.error.code === "PGRST205"
      ) {
        continue;
      }

      // Do not silently ignore permission or other database errors.
      throw result.error;
    }

    profileTable = table;

    if (result.data) return result.data;

    const inserted = await supabase
      .from(table)
      .insert(profile)
      .select()
      .single();

    if (!inserted.error) return inserted.data;

    // A missing optional profile table should not prevent browsing.
    if (
      inserted.error.code === "42P01" ||
      inserted.error.code === "PGRST205"
    ) {
      continue;
    }

    throw inserted.error;
  }

  // Auth metadata remains available if neither profile table exists.
  return profile;
}

async function handleAuth(event) {
  event.preventDefault();

  const email = value("auth-email").toLowerCase();
  const password = $("#auth-password")?.value || "";
  const button = $("#auth-submit");

  if (!email || !password) {
    status("auth-status", "Enter your email and password.", true);
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Please wait...";
  }

  try {
    if (authMode === "signup") {
      const name = value("auth-name");
      const role = value("auth-role") || "customer";

      if (!name) throw new Error("Enter your name.");

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role, phone: "" } }
      });

      if (error) throw error;

      if (data.user && data.session) {
        currentUser = data.user;
        currentProfile = await getProfile(data.user, { name, role });
        await startApp();
        toast("Account created!");
      } else {
        setAuthMode("login");
        status(
          "auth-status",
          "Check your email to confirm your account, then sign in."
        );
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      currentUser = data.user;
      currentProfile = await getProfile(data.user);
      await startApp();
      toast("Welcome back!");
    }
  } catch (error) {
    console.error("Authentication error:", error);
    status("auth-status", error.message || "Sign-in failed.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = authMode === "signup" ? "Create account" : "Sign in";
    }
  }
}

function showAuth() {
  stopMessaging();
  if ($("#auth-page")) $("#auth-page").hidden = false;
  if ($("#app-shell")) $("#app-shell").hidden = true;
  setAuthMode("login");
}

/* -------------------- NAVIGATION -------------------- */

function showPage(name) {
  $$(".app-page").forEach(page => {
    const visible = page.id === `${name}-page`;
    page.hidden = !visible;
    page.classList.toggle("active", visible);
  });

  $$(".nav-link[data-page]").forEach(link => {
    link.classList.toggle("active", link.dataset.page === name);
  });

  if (name === "market") loadListings();
  if (name === "farmer") loadFarmerListings();
  if (name === "cart") renderCart();
  if (name === "messages") loadConversations();
}

function setupNavigation() {
  $$(".nav-link[data-page]").forEach(link => {
    link.addEventListener("click", () => showPage(link.dataset.page));
  });

  $("#sell-button")?.addEventListener("click", () => {
    if (userRole() !== "farmer") {
      toast("Sign in with a farmer account to publish listings.");
      return;
    }
    showPage("farmer");
  });

  $("#browse-button")?.addEventListener("click", () => {
    $("#marketplace")?.scrollIntoView({ behavior: "smooth" });
  });

  $("#details-back-button")?.addEventListener("click", () => showPage("market"));
  $("#cart-continue-button")?.addEventListener("click", () => showPage("market"));
  $("#cart-contact-button")?.addEventListener("click", contactCartSellers);
}

/* -------------------- CATEGORIES -------------------- */

function setupCategories() {
  const categoryList = $("#category-list");
  const departmentSelect = $("#product-category");

  if (categoryList) {
    categoryList.replaceChildren();

    ["All Categories", ...CATEGORIES].forEach(category => {
      const button = makeButton(category, "category-chip", () => {
        selectedCategory = category;
        selectedDepartment = "All";
        $$(".category-chip", categoryList).forEach(chip => {
          chip.classList.toggle("active", chip.textContent === category);
        });
        renderListings();
      });

      if (category === selectedCategory) button.classList.add("active");
      categoryList.appendChild(button);
    });
  }

  if (departmentSelect) {
    departmentSelect.replaceChildren();
    departmentSelect.add(new Option("Choose a department", ""));

    Object.keys(DEPARTMENTS).forEach(department => {
      departmentSelect.add(new Option(department, department));
    });

    departmentSelect.addEventListener("change", updateSubcategories);
  }

  $("#market-category-grid")?.addEventListener("click", event => {
    const button = event.target.closest("[data-market-category]");
    if (!button) return;

    const choice = button.dataset.marketCategory;

    if (choice === "All") {
      selectedDepartment = "All";
      selectedCategory = "All Categories";
    } else if (DEPARTMENTS[choice]) {
      selectedDepartment = choice;
      selectedCategory = "All Categories";
    } else if (CATEGORIES.includes(choice)) {
      selectedDepartment = "All";
      selectedCategory = choice;
    } else {
      selectedDepartment = "All";
      selectedCategory = "All Categories";
    }

    renderListings();
    $("#marketplace")?.scrollIntoView({ behavior: "smooth" });
  });
}

function updateSubcategories() {
  const department = value("product-category");
  const select = $("#product-subcategory");
  if (!select) return;

  select.replaceChildren();
  select.add(new Option("Choose a category", ""));

  (DEPARTMENTS[department] || []).forEach(category => {
    select.add(new Option(category, category));
  });

  select.required = Boolean(department);
  renderDynamicFields(department);
  updateUnitOptions(department);
}

function renderDynamicFields(department) {
  const container = $("#dynamic-product-fields");
  if (!container) return;

  container.replaceChildren();

  const fields = {
    "Livestock & Poultry": [
      ["Breed", "extra-breed", "text", "e.g. Friesian"],
      ["Age", "extra-age", "text", "e.g. 18 months"],
      ["Health information", "extra-health", "text", "Relevant details"]
    ],
    "Agricultural Inputs & Fertilizers": [
      ["Brand", "extra-brand", "text", "Brand name"],
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

  (fields[department] || []).forEach(([label, id, type, hint]) => {
    const wrapper = makeElement("div", "form-field");
    const labelElement = makeElement("label", "", label);
    labelElement.htmlFor = id;

    let input;

    if (type === "select") {
      input = document.createElement("select");
      input.add(new Option("Choose an option", ""));
      hint.split(",").forEach(option => input.add(new Option(option, option)));
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
  const select = $("#product-unit");
  if (!select) return;

  const options = {
    "Livestock & Poultry": ["animal", "bird", "piece"],
    "Farm Services": ["service", "acre", "hour", "day", "trip"],
    "Agricultural Inputs & Fertilizers": ["kg", "bag", "sack", "tonne", "packet", "litre", "item"],
    "Farm Tools & Equipment": ["item", "piece", "day", "hour"],
    "Animal & Farm Products": ["kg", "litre", "piece", "crate", "item"]
  }[department] || [
    "kg", "bag", "crate", "piece", "bunch", "litre", "sack", "tonne"
  ];

  const labels = {
    kg: "Kilograms (kg)", bag: "Bags", crate: "Crates",
    piece: "Pieces", bunch: "Bunches", litre: "Litres",
    animal: "Animals", bird: "Birds", packet: "Packets",
    sack: "Sacks", tonne: "Tonnes", hour: "Hours",
    day: "Days", acre: "Acres", service: "Services",
    item: "Items", trip: "Trips"
  };

  const previous = select.value;
  select.replaceChildren();

  options.forEach(option => select.add(new Option(labels[option] || option, option)));
  if (options.includes(previous)) select.value = previous;
}

function setupCountyFilter() {
  const select = $("#county-filter");
  if (!select) return;

  const previous = select.value;
  select.replaceChildren();
  select.add(new Option("All counties", ""));

  KENYAN_COUNTIES.forEach(county => select.add(new Option(county, county)));
  select.value = previous;
}

/* -------------------- MARKETPLACE -------------------- */

async function loadListings() {
  status("market-status", "Loading marketplace...");

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Listings error:", error);
    allListings = [];
    renderListings();
    status("market-status", "Could not load listings. Check table permissions.", true);
    return;
  }

  allListings = data || [];
  renderListings();

  status(
    "market-status",
    allListings.length ? `${allListings.length} listings available` : "No listings yet."
  );
}

function filteredListings() {
  const search = value("search-input").toLowerCase();
  const county = value("county-filter").toLowerCase();
  const sort = value("sort-products");

  let items = [...allListings];

  if (selectedDepartment !== "All") {
    items = items.filter(item => listingDepartment(item) === selectedDepartment);
  }

  if (selectedCategory !== "All Categories") {
    items = items.filter(item => item.category === selectedCategory);
  }

  if (search) {
    items = items.filter(item => [
      item.product_name, item.category, item.county, item.town,
      item.farmer_name, item.description
    ].join(" ").toLowerCase().includes(search));
  }

  if (county) {
    items = items.filter(item => (item.county || "").toLowerCase() === county);
  }

  if (sort === "price-low") {
    items.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sort === "price-high") {
    items.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  return items;
}

function renderListings() {
  const container = $("#product-list");
  if (!container) return;

  const items = filteredListings();
  container.replaceChildren();
  setText("listing-summary", `${items.length} listing(s) found`);

  if ($("#empty-message")) $("#empty-message").hidden = items.length > 0;

  items.forEach(item => {
    const card = makeElement("article", "product-card");

    if (item.photo_url) {
      const image = makeElement("img", "product-photo");
      image.src = item.photo_url;
      image.alt = item.product_name || "Product photo";
      image.loading = "lazy";
      image.onerror = () => image.remove();
      card.appendChild(image);
    } else {
      card.appendChild(makeElement("div", "product-photo product-photo-placeholder", "🌱"));
    }

    const body = makeElement("div", "product-body");
    body.append(
      makeElement("span", "product-category-label", item.category || "Other"),
      makeElement("h3", "", item.product_name || "Untitled listing"),
      makeElement("p", "product-price", `${price(item.price)} / ${item.unit || "item"}`),
      makeElement("p", "product-meta", `Available: ${item.quantity ?? "Ask seller"} ${item.unit || ""}`),
      makeElement("p", "product-meta", `📍 ${[item.town, item.county].filter(Boolean).join(", ") || "Location not provided"}`),
      makeElement("p", "product-meta", `Seller: ${item.farmer_name || "Local seller"}`)
    );

    const actions = makeElement("div", "product-actions");
    actions.append(
      makeButton("View details", "button button-primary", () => openProductDetails(item)),
      makeButton("Message seller", "button button-outline", () => startConversation(item))
    );

    body.appendChild(actions);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function setupMarketFilters() {
  ["search-input", "county-filter", "sort-products"].forEach(id => {
    const element = $(`#${id}`);
    if (element) element.addEventListener(
      element.tagName === "SELECT" ? "change" : "input",
      renderListings
    );
  });
}

/* -------------------- PRODUCT DETAILS -------------------- */

function openProductDetails(item) {
  selectedProduct = item;
  const container = $("#product-details-content");
  if (!container) return;

  container.replaceChildren();
  const panel = makeElement("article", "panel product-detail-panel");

  if (item.photo_url) {
    const image = makeElement("img", "product-detail-image");
    image.src = item.photo_url;
    image.alt = item.product_name || "Product photo";
    panel.appendChild(image);
  }

  panel.append(
    makeElement("p", "eyebrow", listingDepartment(item)),
    makeElement("h2", "", item.product_name || "Untitled listing"),
    makeElement("h3", "product-price", `${price(item.price)} / ${item.unit || "item"}`)
  );

  const details = makeElement("div", "product-detail-info");

  [
    ["Department", listingDepartment(item)],
    ["Category", item.category],
    ["Condition", item.condition],
    ["Quantity", `${item.quantity ?? "Unknown"} ${item.unit || ""}`],
    ["County", item.county],
    ["Town", item.town],
    ["Seller", item.farmer_name],
    ["Description", String(item.description || "").replace(/^Department:\s*.+\n?/, "")]
  ].forEach(([label, detail]) => {
    const line = makeElement("p");
    line.append(
      makeElement("strong", "", `${label}: `),
      document.createTextNode(detail || "Not provided")
    );
    details.appendChild(line);
  });

  panel.appendChild(details);

  const actions = makeElement("div", "product-actions");
  actions.append(
    makeButton("Add to cart", "button button-primary", () => addToCart(item)),
    makeButton("Message seller", "button button-outline", () => startConversation(item))
  );

  const phone = normalizePhone(item.phone);

  if (phone) {
    const call = makeElement("a", "button button-outline", "Call seller");
    call.href = `tel:+${phone}`;
    actions.appendChild(call);

    const whatsapp = makeElement("a", "button button-outline", "WhatsApp");
    whatsapp.href = `https://wa.me/${phone}?text=${encodeURIComponent(
      `Hello, I am interested in ${item.product_name} on ShambaMarket.`
    )}`;
    whatsapp.target = "_blank";
    whatsapp.rel = "noopener noreferrer";
    actions.appendChild(whatsapp);
  }

  panel.appendChild(actions);
  container.appendChild(panel);
  showPage("details");
}

/* -------------------- CART -------------------- */

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    cart = Array.isArray(stored) ? stored : [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    toast("Could not save the cart in this browser.");
  }
  setText("cart-count", cart.reduce((sum, item) => sum + item.cartQuantity, 0));
}

function addToCart(item) {
  if (!item?.id) return toast("This listing has no ID.");

  if (currentUser && item.owner_id === currentUser.id) {
    return toast("You cannot add your own listing to the cart.");
  }

  const existing = cart.find(row => String(row.id) === String(item.id));
  const available = Math.max(1, Number(item.quantity) || 1);

  if (existing) {
    if (existing.cartQuantity >= available) return toast("Maximum listed quantity reached.");
    existing.cartQuantity++;
  } else {
    cart.push({
      id: item.id,
      product_name: item.product_name,
      category: item.category,
      price: Number(item.price) || 0,
      unit: item.unit || "item",
      quantity: available,
      phone: item.phone || "",
      farmer_name: item.farmer_name || "",
      cartQuantity: 1
    });
  }

  saveCart();
  toast("Added to cart.");
}

function renderCart() {
  const container = $("#cart-items");
  if (!container) return;

  container.replaceChildren();

  if (!cart.length) {
    container.appendChild(makeElement("p", "muted", "Your cart is empty."));
    setText("cart-subtotal", price(0));
    status("cart-status", "");
    return;
  }

  cart.forEach(item => {
    const row = makeElement("article", "cart-item");
    row.append(
      makeElement("h3", "", item.product_name),
      makeElement("p", "", `${price(item.price)} / ${item.unit}`),
      makeElement("p", "", `Quantity: ${item.cartQuantity}`),
      makeElement("p", "", `Subtotal: ${price(item.price * item.cartQuantity)}`)
    );

    const actions = makeElement("div", "cart-item-actions");
    actions.append(
      makeButton("−", "button button-outline", () => changeCart(item.id, -1)),
      makeButton("+", "button button-outline", () => changeCart(item.id, 1)),
      makeButton("Remove", "button button-outline", () => removeCart(item.id))
    );

    row.appendChild(actions);
    container.appendChild(row);
  });

  setText("cart-subtotal", price(
    cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0)
  ));
}

function changeCart(id, amount) {
  const item = cart.find(row => String(row.id) === String(id));
  if (!item) return;

  const next = item.cartQuantity + amount;
  if (next <= 0) return removeCart(id);
  if (next > item.quantity) return toast("That exceeds the listed quantity.");

  item.cartQuantity = next;
  saveCart();
  renderCart();
}

function removeCart(id) {
  cart = cart.filter(item => String(item.id) !== String(id));
  saveCart();
  renderCart();
}

function contactCartSellers() {
  if (!cart.length) return toast("Your cart is empty.");

  const phone = normalizePhone(cart.find(item => normalizePhone(item.phone))?.phone);
  if (!phone) return status("cart-status", "No valid seller phone number was found.", true);

  const items = cart
    .filter(item => normalizePhone(item.phone) === phone)
    .map(item => `${item.product_name} x ${item.cartQuantity}`)
    .join(", ");

  status(
    "cart-status",
    "Confirm stock, delivery, final price and payment directly with the seller. No payment has been taken."
  );

  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent("Hello, I am enquiring about: " + items)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

/* -------------------- PRODUCT PHOTOS -------------------- */

function setupPhotoPreview() {
  const input = $("#product-photo");
  if (!input) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    const preview = $("#photo-preview");
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      input.value = "";
      return toast("Choose a JPG, PNG or WebP image.");
    }

    if (file.size > 5 * 1024 * 1024) {
      input.value = "";
      return toast("Choose an image smaller than 5 MB.");
    }

    if (preview) {
      preview.replaceChildren();
      const image = makeElement("img");
      image.src = URL.createObjectURL(file);
      image.alt = "Listing photo preview";
      image.style.maxWidth = "100%";
      image.style.maxHeight = "220px";
      preview.appendChild(image);
      preview.hidden = false;
    }
  });
}

async function uploadPhoto(file) {
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

  return supabase.storage.from("product-photos").getPublicUrl(path).data.publicUrl;
}

/* -------------------- PUBLISH LISTING -------------------- */

async function handleProductSubmit(event) {
  event.preventDefault();

  if (!currentUser) return toast("Sign in first.");
  if (userRole() !== "farmer") {
    return status("farmer-status", "Only farmer accounts can publish listings.", true);
  }

  const department = value("product-category");
  const category = value("product-subcategory");
  const name = value("product-name");
  const priceValue = Number(value("product-price"));
  const quantity = Number(value("product-quantity"));

  if (!department || !category || !name) {
    return status("farmer-status", "Choose a department, category and product name.", true);
  }

  if (!Number.isFinite(priceValue) || priceValue < 0 ||
      !Number.isFinite(quantity) || quantity <= 0) {
    return status("farmer-status", "Enter a valid price and quantity.", true);
  }

  const button = $("#publish-button");
  if (button) {
    button.disabled = true;
    button.textContent = "Publishing...";
  }

  try {
    const photo = await uploadPhoto($("#product-photo")?.files?.[0]);

    const extra = $$("[data-extra-field]").map(input => {
      const label = input.closest(".form-field")?.querySelector("label")?.textContent;
      return input.value ? `${label || input.id}: ${input.value}` : "";
    }).filter(Boolean).join("\n");

    const description = [
      `Department: ${department}`,
      value("product-description"),
      extra
    ].filter(Boolean).join("\n\n");

    const listing = {
      owner_id: currentUser.id,
      product_name: name,
      category,
      price: priceValue,
      quantity,
      unit: value("product-unit") || "item",
      condition: value("product-condition") || "Good",
      county: value("product-county"),
      town: value("product-town"),
      farmer_name: userName(),
      phone: currentProfile?.phone || currentUser.user_metadata?.phone || "",
      photo_url: photo,
      description
    };

    const { error } = await supabase.from("listings").insert(listing);
    if (error) throw error;

    $("#product-form")?.reset();
    if ($("#photo-preview")) {
      $("#photo-preview").replaceChildren();
      $("#photo-preview").hidden = true;
    }

    $("#dynamic-product-fields")?.replaceChildren();
    updateSubcategories();

    status("farmer-status", "Listing published successfully.");
    toast("Your listing is live.");

    await loadListings();
    await loadFarmerListings();
  } catch (error) {
    console.error("Publish error:", error);
    status(
      "farmer-status",
      `Could not publish listing: ${error.message || "Unknown error"}`,
      true
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Publish Product";
    }
  }
}

/* -------------------- FARMER LISTINGS -------------------- */

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
    console.error(error);
    return status("farmer-status", "Could not load your listings.", true);
  }

  if (!data?.length) {
    container.appendChild(makeElement("p", "muted", "You have not published listings yet."));
    return;
  }

  data.forEach(item => {
    const row = makeElement("article", "farmer-listing");
    const details = makeElement("div");

    details.append(
      makeElement("strong", "", item.product_name),
      makeElement("p", "", `${item.category} · ${price(item.price)}`),
      makeElement("small", "", item.county || "Location not set")
    );

    const remove = makeButton("Delete", "button button-outline", async () => {
      if (!window.confirm(`Delete "${item.product_name}"?`)) return;

      const { error: deleteError } = await supabase
        .from("listings")
        .delete()
        .eq("id", item.id)
        .eq("owner_id", currentUser.id);

      if (deleteError) {
        console.error(deleteError);
        return toast("Could not delete listing.");
      }

      toast("Listing deleted.");
      await loadListings();
      await loadFarmerListings();
    });

    row.append(details, remove);
    container.appendChild(row);
  });
}

/* -------------------- DIRECT MESSAGING -------------------- */

function stopMessaging() {
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

  stopMessaging();
  container.replaceChildren();

  const { data: memberships, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error(error);
    return status("messages-status", "Could not load conversations. Check Supabase permissions.", true);
  }

  const ids = [...new Set((memberships || []).map(row => row.conversation_id))];

  if (!ids.length) {
    container.appendChild(makeElement(
      "p", "muted",
      "No conversations yet. Open a listing and choose Message seller."
    ));
    status("messages-status", "");
    return;
  }

  const [conversationResult, participantResult] = await Promise.all([
    supabase.from("conversations").select("*").in("id", ids).order("updated_at", { ascending: false }),
    supabase.from("conversation_participants").select("conversation_id,user_id").in("conversation_id", ids)
  ]);

  if (conversationResult.error || participantResult.error) {
    console.error(conversationResult.error || participantResult.error);
    return status("messages-status", "Could not load conversation details.", true);
  }

  const conversations = conversationResult.data || [];
  const participants = participantResult.data || [];
  const otherIds = [...new Set(participants
    .filter(row => row.user_id !== currentUser.id)
    .map(row => row.user_id))];

  let profiles = [];

  if (otherIds.length) {
    const result = await supabase
      .from(profileTable)
      .select("id,name")
      .in("id", otherIds);

    if (!result.error) profiles = result.data || [];
  }

  conversations.forEach(conversation => {
    const others = participants.filter(row =>
      row.conversation_id === conversation.id && row.user_id !== currentUser.id
    );

    const names = others.map(person =>
      profiles.find(profile => profile.id === person.user_id)?.name || "Marketplace member"
    );

    container.appendChild(makeButton(
      names.join(", ") || "Conversation",
      "conversation-item",
      () => openConversation(conversation.id, names.join(", ") || "Conversation")
    ));
  });

  status("messages-status", "");
}

async function startConversation(listing) {
  if (!currentUser) {
    toast("Sign in to message a seller.");
    showAuth();
    return;
  }

  if (!listing?.owner_id) return toast("This listing has no linked seller account.");
  if (listing.owner_id === currentUser.id) return toast("This is your own listing.");

  status("messages-status", "Opening conversation...");

  try {
    // Reuse an existing conversation only if it has exactly these two members.
    const { data: mine, error: mineError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", currentUser.id);

    if (mineError) throw mineError;

    const myIds = [...new Set((mine || []).map(row => row.conversation_id))];

    if (myIds.length) {
      const { data: shared, error: sharedError } = await supabase
        .from("conversation_participants")
        .select("conversation_id,user_id")
        .in("conversation_id", myIds);

      if (sharedError) throw sharedError;

      const grouped = new Map();

      (shared || []).forEach(row => {
        if (!grouped.has(row.conversation_id)) grouped.set(row.conversation_id, []);
        grouped.get(row.conversation_id).push(row.user_id);
      });

      const existingId = [...grouped.entries()].find(([, members]) =>
        members.length === 2 &&
        members.includes(currentUser.id) &&
        members.includes(listing.owner_id)
      )?.[0];

      if (existingId) {
        await openConversation(existingId, listing.farmer_name || "Seller");
        return;
      }
    }

    // This RPC securely adds both participants on the database side.
    const { data: conversationId, error: createError } = await supabase
      .rpc("create_conversation", { p_other_user: listing.owner_id });

    if (createError) throw createError;

    const { error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUser.id,
        body: `Hello! I am interested in your listing: ${listing.product_name}.`
      });

    if (messageError) throw messageError;

    await openConversation(conversationId, listing.farmer_name || "Seller");
  } catch (error) {
    console.error("Start conversation error:", error);
    status(
      "messages-status",
      `Could not start conversation: ${error.message || "Check your Supabase setup."}`,
      true
    );
    showPage("messages");
  }
}

async function openConversation(id, title = "Conversation") {
  if (!currentUser) return;

  activeConversation = id;
  showPage("messages");
  setText("conversation-header", title);

  const form = $("#message-form");
  if (form) form.dataset.conversationId = id;

  await loadMessages(id);
  stopMessaging();

  messageChannel = supabase
    .channel(`shamba-chat-${id}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${id}`
    }, () => {
      if (activeConversation === id) loadMessages(id);
    })
    .subscribe();

  // Backup refresh if Realtime cannot connect.
  messageRefreshTimer = setInterval(() => {
    if (activeConversation === id) loadMessages(id);
  }, 15000);
}

async function loadMessages(id) {
  const container = $("#message-list");
  if (!container || !currentUser) return;

  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return status("messages-status", "Could not load messages.", true);
  }

  container.replaceChildren();
  (data || []).forEach(message => {
    const mine = message.sender_id === currentUser.id;
    const bubble = makeElement(
      "article",
      `message-bubble ${mine ? "message-mine" : "message-theirs"}`
    );

    bubble.dataset.messageId = message.id;
    bubble.appendChild(makeElement("p", "message-text", message.body || ""));

    bubble.appendChild(makeElement(
      "small",
      "message-time",
      message.created_at
        ? new Date(message.created_at).toLocaleString("en-KE")
        : ""
    ));

    container.appendChild(bubble);
  });

  status("messages-status", "");
  container.scrollTop = container.scrollHeight;
}

async function handleMessageSubmit(event) {
  event.preventDefault();

  if (!currentUser || !activeConversation) {
    return status("messages-status", "Open a conversation first.", true);
  }

  const input = $("#message-input");
  const body = input?.value?.trim() || "";

  if (!body) return;
  if (body.length > 4000) {
    return status("messages-status", "Messages must be 4,000 characters or fewer.", true);
  }

  const button = $("#send-message-button");
  if (button) button.disabled = true;

  try {
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeConversation,
      sender_id: currentUser.id,
      body
    });

    if (error) throw error;

    input.value = "";
    await loadMessages(activeConversation);

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeConversation);

    if (updateError) console.warn("Could not update conversation timestamp:", updateError);
  } catch (error) {
    console.error(error);
    status("messages-status", `Message failed: ${error.message || "Check permissions."}`, true);
  } finally {
    if (button) button.disabled = false;
  }
}

/* -------------------- ACCOUNT & THEME -------------------- */

function updateAccount() {
  setText("account-label", userName());
  setText("farmer-name", userName());

  const farmer = userRole() === "farmer";

  $$('.nav-link[data-page="farmer"]').forEach(link => {
    link.hidden = !farmer;
  });

  $$('[data-page="farmer"]').forEach(element => {
    if (!element.classList.contains("nav-link")) element.hidden = !farmer;
  });
}

function setupTheme() {
  const toggle = $("#theme-toggle");
  if (!toggle) return;

  const saved = localStorage.getItem("shamba-theme");
  if (saved === "dark") document.body.classList.add("dark-theme");

  const refresh = () => {
    const dark = document.body.classList.contains("dark-theme");
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.textContent = dark ? "Light Mode" : "Dark Mode";
  };

  refresh();

  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    localStorage.setItem(
      "shamba-theme",
      document.body.classList.contains("dark-theme") ? "dark" : "light"
    );
    refresh();
  });
}

async function signOut() {
  stopMessaging();

  const { error } = await supabase.auth.signOut();
  if (error) return toast("Could not sign out.");

  currentUser = null;
  currentProfile = null;
  activeConversation = null;
  allListings = [];
  showAuth();
}

/* -------------------- STARTUP -------------------- */

async function startApp() {
  if ($("#auth-page")) $("#auth-page").hidden = true;
  if ($("#app-shell")) $("#app-shell").hidden = false;

  updateAccount();
  await loadListings();
  showPage(userRole() === "farmer" ? "farmer" : "market");
}

function setupEvents() {
  $("#auth-form")?.addEventListener("submit", handleAuth);

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
  setupCountyFilter();
}

async function init() {
  setText("current-year", new Date().getFullYear());

  setupCategories();
  setupEvents();
  loadCart();
  setText("cart-count", cart.reduce((sum, item) => sum + item.cartQuantity, 0));

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    currentUser = data.session?.user || null;

    if (currentUser) {
      currentProfile = await getProfile(currentUser);
      await startApp();
    } else {
      showAuth();
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        activeConversation = null;
        showAuth();
      }
    });
  } catch (error) {
    console.error("Startup error:", error);
    showAuth();
    status(
      "auth-status",
      `Connection problem: ${error.message || "Check Supabase settings."}`,
      true
    );
  }
}

init();
