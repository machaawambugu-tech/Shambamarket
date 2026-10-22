
const sampleProducts = [
  {
    id: "sample-1",
    name: "Fresh Mangoes",
    category: "Fruits",
    condition: "Fresh",
    county: "Machakos",
    town: "Makueni",
    quantity: 200,
    price: 60,
    farmer: "Green Valley Farm",
    phone: "0700000001",
    description: "Freshly harvested mangoes.",
    emoji: "🥭",
    sample: true
  },
  {
    id: "sample-2",
    name: "Farm Tomatoes",
    category: "Vegetables",
    condition: "Fresh",
    county: "Nakuru",
    town: "Naivasha",
    quantity: 100,
    price: 45,
    farmer: "Sunrise Farm",
    phone: "0700000002",
    description: "Fresh red tomatoes.",
    emoji: "🍅",
    sample: true
  },
  {
    id: "sample-3",
    name: "Dry Maize",
    category: "Grains",
    condition: "Dried",
    county: "Uasin Gishu",
    town: "Eldoret",
    quantity: 500,
    price: 55,
    farmer: "Highland Growers",
    phone: "0700000003",
    description: "Dry maize for sale.",
    emoji: "🌽",
    sample: true
  },
  {
    id: "sample-4",
    name: "Irish Potatoes",
    category: "Starchy foods",
    condition: "Fresh",
    county: "Nyeri",
    town: "Nyeri Town",
    quantity: 250,
    price: 50,
    farmer: "Hilltop Farm",
    phone: "0700000004",
    description: "Freshly dug potatoes.",
    emoji: "🥔",
    sample: true
  },
  {
    id: "sample-5",
    name: "Groundnuts",
    category: "Nuts",
    condition: "Dried",
    county: "Kisumu",
    town: "Kisumu",
    quantity: 80,
    price: 180,
    farmer: "Lakeview Farm",
    phone: "0700000005",
    description: "Good quality groundnuts.",
    emoji: "🥜",
    sample: true
  },
  {
    id: "sample-6",
    name: "Dry Beans",
    category: "Legumes",
    condition: "Dried",
    county: "Meru",
    town: "Meru Town",
    quantity: 120,
    price: 140,
    farmer: "Harvest Fields",
    phone: "0700000006",
    description: "Clean dry beans.",
    emoji: "🫘",
    sample: true
  }
];

function loadSavedProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem("shambaProducts"));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

let farmerProducts = loadSavedProducts();
let activeCategory = "All";

function getAllProducts() {
  return sampleProducts.concat(farmerProducts);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function saveFarmerProducts() {
  try {
    localStorage.setItem("shambaProducts", JSON.stringify(farmerProducts));
    return true;
  } catch (error) {
    showToast("Could not save. Try a smaller photo or clear browser storage.");
    return false;
  }
}

function renderProducts() {
  const container = document.getElementById("product-list");
  const empty = document.getElementById("empty-products");
  const count = document.getElementById("product-count");

  if (!container) return;

  const search = (
    document.getElementById("search-input")?.value || ""
  ).trim().toLowerCase();

  const county = document.getElementById("county-filter")?.value || "";

  const filtered = getAllProducts().filter(function (product) {
    const matchesCategory =
      activeCategory === "All" || product.category === activeCategory;

    const searchable = [
      product.name,
      product.category,
      product.county,
      product.town,
      product.farmer
    ].join(" ").toLowerCase();

    return matchesCategory &&
      searchable.includes(search) &&
      (!county || product.county === county);
  });

  container.innerHTML = filtered.map(function (product) {
    const photo = product.photo
      ? `<img src="${escapeHTML(product.photo)}" alt="${escapeHTML(product.name)}">`
      : escapeHTML(product.emoji || "🌱");

    return `
      <article class="product-card">
        <div class="product-photo">${photo}</div>
        <div class="product-content">
          <span class="product-category">${escapeHTML(product.category)}</span>
          <h3>${escapeHTML(product.name)}</h3>
          <p class="product-location">📍 ${escapeHTML(product.town)}, ${escapeHTML(product.county)}</p>
          <p class="product-condition">${escapeHTML(product.condition)} · ${escapeHTML(product.farmer)}</p>
          <p class="product-price">KSh ${Number(product.price).toLocaleString("en-KE")} <small>/ kg</small></p>
          <p class="product-quantity">${Number(product.quantity).toLocaleString("en-KE")} kg available</p>
          <div class="product-actions">
            <button class="primary-button" onclick="createOrder('${escapeHTML(product.id)}')">Order</button>
            <button class="secondary-button" onclick="contactFarmer('${escapeHTML(product.id)}')">Contact</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  if (empty) empty.hidden = filtered.length !== 0;
  if (count) count.textContent = filtered.length + " products";
}

function contactFarmer(productId) {
  const product = getAllProducts().find(function (item) {
    return item.id === productId;
  });

  if (!product) return;

  localStorage.setItem("shambaContact", JSON.stringify({
    farmer: product.farmer,
    product: product.name,
    phone: product.phone
  }));

  showPage("messages");
  showToast("Contact details prepared. Demo chat is not connected to the farmer.");
}

