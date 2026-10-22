
const productCategories = [
  { name: "Fruits", emoji: "🍎" },
  { name: "Vegetables", emoji: "🥬" },
  { name: "Nuts", emoji: "🥜" },
  { name: "Starchy foods", emoji: "🥔" },
  { name: "Grains", emoji: "🌾" },
  { name: "Cereals", emoji: "🥣" },
  { name: "Legumes", emoji: "🫘" },
  { name: "Spices", emoji: "🌶️" },
  { name: "Herbal products", emoji: "🌿" }
];

function renderCategories() {
  const container = document.getElementById("category-list");
  const selector = document.getElementById("product-category");

  if (container) {
    const allCategories = [{ name: "All", emoji: "🛒" }]
      .concat(productCategories);

    container.innerHTML = allCategories.map(function (category) {
      const selected = activeCategory === category.name ? "selected" : "";

      return `
        <button class="category-card ${selected}"
          onclick="selectCategory('${escapeHTML(category.name)}')">
          <span class="category-image">${category.emoji}</span>
          <span class="category-title">${escapeHTML(category.name)}</span>
        </button>
      `;
    }).join("");
  }

  if (selector) {
    selector.innerHTML =
      '<option value="">Choose a category</option>' +
      productCategories.map(function (category) {
        return `<option value="${escapeHTML(category.name)}">${escapeHTML(category.name)}</option>`;
      }).join("");
  }

  const categoryCount = document.getElementById("category-count");
  if (categoryCount) categoryCount.textContent = productCategories.length;
}

function selectCategory(category) {
  activeCategory = category;
  renderCategories();
  renderProducts();
}

document.getElementById("search-input").addEventListener("input", renderProducts);
document.getElementById("county-filter").addEventListener("change", renderProducts);

