
/* SHAMBAMARKET: Marketplace with real food photos */

const STORAGE_KEY = "shambamarket-products-v2";

const categoryInfo = {
  fruit: {
    label: "Fruits",
    image: "https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=800&q=80"
  },
  vegetable: {
    label: "Vegetables",
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80"
  },
  grain: {
    label: "Grains & cereals",
    image: "https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=800&q=80"
  },
  starchy: {
    label: "Starchy foods",
    image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=800&q=80"
  },
  spice: {
    label: "Spices & herbs",
    image: "https://images.unsplash.com/photo-1615485500704-8e990f9900f2?auto=format&fit=crop&w=800&q=80"
  }
};

/* SAMPLE PRODUCTS: demo prices and contacts */
const sampleProducts = [
  {
    name: "Fresh Mangoes",
    type: "fruit",
    county: "Makueni",
    quantity: 50,
    price: 80,
    contact: ""
  },
  {
    name: "Fresh Vegetables",
    type: "vegetable",
    county: "Nakuru",
    quantity: 30,
    price: 100,
    contact: ""
  },
  {
    name: "Maize",
    type: "grain",
    county: "Trans Nzoia",
    quantity: 100,
    price: 55,
    contact: ""
  },
  {
    name: "Potatoes",
    type: "starchy",
    county: "Nyandarua",
    quantity: 40,
    price: 65,
    contact: ""
  },
  {
    name: "Fresh Herbs",
    type: "spice",
    county: "Kiambu",
    quantity: 20,
    price: 40,
    contact: ""
  }
];

const productList = document.getElementById("product-list");
const searchInput = document.getElementById("search");
const categoryInput = document.getElementById("category");
const productForm = document.getElementById("product-form");
const resultCount = document.getElementById("result-count");
const emptyState = document.getElementById("empty-state");
const message = document.getElementById("message");

/* Load products saved in this browser */
function loadProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const data = JSON.parse(saved);
      if (Array.isArray(data)) return data;
    }
  } catch (error) {
    console.warn("Could not load saved products.");
  }

  return sampleProducts.map(product => ({ ...product }));
}

let products = loadProducts();

/* Save listings in this browser */
function saveProducts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return true;
  } catch (error) {
    return false;
  }
}

/* Create a safe text element */
function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

/* Display product photos and information */
function displayProducts() {
  const term = searchInput.value.toLowerCase().trim();
  const selected = categoryInput.value;

  const matches = products.filter(product => {
    const text = `${product.name} ${product.county}`.toLowerCase();
    return text.includes(term) &&
      (selected === "all" || product.type === selected);
  });

  productList.replaceChildren();
  resultCount.textContent =
    `${matches.length} ${matches.length === 1 ? "product" : "products"}`;
  emptyState.hidden = matches.length !== 0;

  matches.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";

    const category = categoryInfo[product.type] || categoryInfo.fruit;

    /* Product photograph */
    const photo = document.createElement("img");
    photo.className = "product-photo";
    photo.src = product.image || category.image;
    photo.alt = product.name;
    photo.loading = "lazy";

    /* Show a fallback image if a photo cannot load */
    photo.onerror = function() {
      if (photo.dataset.fallback !== "used") {
        photo.dataset.fallback = "used";
        photo.src = category.image;
      }
    };

    card.appendChild(photo);

    addText(card, "span", "product-category", category.label);
    addText(card, "h3", "product-name", product.name);
    addText(card, "p", "product-location", `📍 ${product.county} County`);
    addText(card, "p", "product-quantity", `${product.quantity} kg available`);
    addText(
      card,
      "p",
      "product-price",
      `KSh ${Number(product.price).toLocaleString("en-KE")} / kg`
    );

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "View product details";
    details.appendChild(summary);

    addText(details, "p", "", `Category: ${category.label}`);
    addText(details, "p", "", `County: ${product.county}`);
    addText(details, "p", "", `Available: ${product.quantity} kg`);

    if (product.contact) {
      addText(details, "p", "", `Farmer contact: ${product.contact}`);

      const phone = product.contact.replace(/[^\d+]/g, "");
      if (/^\+?\d{9,15}$/.test(phone)) {
        const call = document.createElement("a");
        call.className = "contact-button";
        call.href = `tel:${phone}`;
        call.textContent = "☎ Contact Farmer";
        details.appendChild(call);
      }
    } else {
      addText(details, "p", "demo-note", "Demo listing — no verified farmer contact.");
    }

    card.appendChild(details);
    productList.appendChild(card);
  });
}

/* Search and category controls */
searchInput.addEventListener("input", displayProducts);
categoryInput.addEventListener("change", displayProducts);

/* Add a product from the farmer form */
productForm.addEventListener("submit", event => {
  event.preventDefault();

  const product = {
    name: document.getElementById("name").value.trim(),
    type: document.getElementById("type").value,
    county: document.getElementById("county").value.trim(),
    quantity: Number(document.getElementById("quantity").value),
    price: Number(document.getElementById("price").value),
    contact: document.getElementById("contact").value.trim()
  };

  if (
    !product.name ||
    !product.county ||
    !categoryInfo[product.type] ||
    !Number.isFinite(product.quantity) ||
    !Number.isFinite(product.price) ||
    product.quantity <= 0 ||
    product.price <= 0
  ) {
    message.textContent = "Please check all your product details.";
    return;
  }

  products.unshift(product);
  const saved = saveProducts();

  productForm.reset();
  searchInput.value = "";
  categoryInput.value = "all";
  displayProducts();

  message.textContent = saved
    ? "Product added successfully!"
    : "Added for this session, but saving failed.";

  document.getElementById("market").scrollIntoView({
    behavior: "smooth"
  });
});

/* Start the marketplace */
displayProducts();
