
/* 1. SETTINGS AND SAMPLE PRODUCTS */
const STORAGE_KEY = "shambamarket-products-v1";

const categoryInfo = {
  fruit: { label: "Fruit", icon: "🍎" },
  vegetable: { label: "Vegetable", icon: "🥬" },
  grain: { label: "Grain & cereal", icon: "🌽" },
  starchy: { label: "Starchy food", icon: "🥔" },
  spice: { label: "Spice & herb", icon: "🌿" }
};

const sampleProducts = [
  {
    name: "Fresh Mangoes",
    type: "fruit",
    county: "Makueni",
    quantity: 50,
    price: 80,
    contact: "Demo contact"
  },
  {
    name: "Fresh Tomatoes",
    type: "vegetable",
    county: "Nakuru",
    quantity: 30,
    price: 100,
    contact: "Demo contact"
  },
  {
    name: "Dry Maize",
    type: "grain",
    county: "Trans Nzoia",
    quantity: 100,
    price: 55,
    contact: "Demo contact"
  },
  {
    name: "Sweet Potatoes",
    type: "starchy",
    county: "Kisumu",
    quantity: 40,
    price: 65,
    contact: "Demo contact"
  },
  {
    name: "Fresh Coriander",
    type: "spice",
    county: "Kiambu",
    quantity: 20,
    price: 40,
    contact: "Demo contact"
  }
];

/* 2. CONNECT TO THE HTML ELEMENTS */
const productList = document.getElementById("product-list");
const searchInput = document.getElementById("search");
const categoryInput = document.getElementById("category");
const productForm = document.getElementById("product-form");
const resultCount = document.getElementById("result-count");
const emptyState = document.getElementById("empty-state");
const message = document.getElementById("message");

/* 3. LOAD PRODUCTS SAVED IN THIS BROWSER */
function loadProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved !== null) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Saved listings could not be loaded.");
  }

  return sampleProducts.map(product => ({ ...product }));
}

let products = loadProducts();

/* 4. SAVE PRODUCTS IN THIS BROWSER */
function saveProducts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return true;
  } catch (error) {
    return false;
  }
}

/* 5. DISPLAY AND FILTER PRODUCT CARDS */
function displayProducts() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedCategory = categoryInput.value;

  const filteredProducts = products.filter(product => {
    const searchableText =
      `${product.name} ${product.county}`.toLowerCase();

    const matchesSearch = searchableText.includes(searchTerm);

    const matchesCategory =
      selectedCategory === "all" ||
      product.type === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  productList.replaceChildren();

  resultCount.textContent =
    `${filteredProducts.length} ${
      filteredProducts.length === 1 ? "product" : "products"
    }`;

  emptyState.hidden = filteredProducts.length > 0;

  filteredProducts.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";

    const icon = document.createElement("div");
    icon.className = "product-icon";
    icon.textContent =
      categoryInfo[product.type]?.icon || "🌱";
    icon.setAttribute("aria-hidden", "true");

    const title = document.createElement("h3");
    title.textContent = product.name;

    const category = document.createElement("p");
    category.textContent =
      categoryInfo[product.type]?.label || "Produce";

    const location = document.createElement("p");
    location.textContent = `📍 ${product.county} County`;

    const quantity = document.createElement("p");
    quantity.textContent = `${product.quantity} kg available`;

    const price = document.createElement("div");
    price.className = "product-price";
    price.textContent =
      `KSh ${Number(product.price).toLocaleString("en-KE")} / kg`;

    const contact = document.createElement("p");
    contact.className = "contact-line";
    contact.textContent = `☎ Farmer: ${product.contact}`;

    card.append(icon, title, category, location, quantity, price, contact);
    productList.appendChild(card);
  });
}

/* 6. SEARCH AND CATEGORY FILTERS */
searchInput.addEventListener("input", displayProducts);
categoryInput.addEventListener("change", displayProducts);

/* 7. ADD A NEW FARMER LISTING */
productForm.addEventListener("submit", function(event) {
  event.preventDefault();

  const newProduct = {
    name: document.getElementById("name").value.trim(),
    type: document.getElementById("type").value,
    county: document.getElementById("county").value.trim(),
    quantity: Number(document.getElementById("quantity").value),
    price: Number(document.getElementById("price").value),
    contact: document.getElementById("contact").value.trim()
  };

  if (
    !newProduct.name ||
    !newProduct.county ||
    !newProduct.contact ||
    !categoryInfo[newProduct.type] ||
    !Number.isFinite(newProduct.quantity) ||
    !Number.isFinite(newProduct.price) ||
    newProduct.quantity <= 0 ||
    newProduct.price <= 0
  ) {
    message.textContent =
      "Please enter valid details in every field.";
    return;
  }

  products.unshift(newProduct);

  const saved = saveProducts();

  productForm.reset();
  searchInput.value = "";
  categoryInput.value = "all";

  displayProducts();

  message.textContent = saved
    ? "✓ Product added! It is saved in this browser."
    : "Product added for this session, but could not be saved.";

  document.getElementById("market").scrollIntoView({
    behavior: "smooth"
  });
});

/* 8. START THE MARKETPLACE */
displayProducts();
