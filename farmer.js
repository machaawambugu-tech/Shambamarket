
function renderFarmerListings() {
  const container = document.getElementById("farmer-listings");
  const empty = document.getElementById("empty-farmer-listings");
  const count = document.getElementById("my-listing-count");

  if (!container) return;

  container.innerHTML = farmerProducts.map(function (product) {
    const photo = product.photo
      ? `<img src="${escapeHTML(product.photo)}" alt="">`
      : escapeHTML(product.emoji || "🌱");

    return `
      <article class="farmer-listing-card">
        <div class="farmer-listing-image">${photo}</div>
        <div class="farmer-listing-info">
          <h3>${escapeHTML(product.name)}</h3>
          <p>${escapeHTML(product.category)} · ${escapeHTML(product.county)}</p>
          <p>KSh ${Number(product.price).toLocaleString("en-KE")} / kg</p>
          <p>${Number(product.quantity).toLocaleString("en-KE")} kg available</p>
        </div>
        <button class="delete-button"
          onclick="deleteProduct('${escapeHTML(product.id)}')">Delete</button>
      </article>
    `;
  }).join("");

  if (empty) empty.hidden = farmerProducts.length > 0;
  if (count) count.textContent = farmerProducts.length;
}

function deleteProduct(productId) {
  if (!confirm("Delete this product listing?")) return;

  const oldProducts = farmerProducts;
  farmerProducts = farmerProducts.filter(function (product) {
    return product.id !== productId;
  });

  if (!saveFarmerProducts()) {
    farmerProducts = oldProducts;
    return;
  }

  renderFarmerListings();
  renderProducts();
  showToast("Listing deleted.");
}

document.getElementById("product-form").addEventListener("submit", function (event) {
  event.preventDefault();

  const name = document.getElementById("product-name").value.trim();
  const category = document.getElementById("product-category").value;
  const condition = document.getElementById("product-condition").value;
  const county = document.getElementById("product-county").value;
  const town = document.getElementById("product-town").value.trim();
  const quantity = Number(document.getElementById("product-quantity").value);
  const price = Number(document.getElementById("product-price").value);
  const farmer = document.getElementById("farmer-name").value.trim();
  const phone = document.getElementById("farmer-phone").value.trim();
  const description = document.getElementById("product-description").value.trim();
  const photoInput = document.getElementById("product-photo");
  const file = photoInput.files[0];

  if (!category || !name || !county || !town || !farmer || !phone) {
    showToast("Please complete all required fields.");
    return;
  }

  if (quantity <= 0 || price < 0 || !Number.isFinite(quantity) || !Number.isFinite(price)) {
    showToast("Enter a valid quantity and price.");
    return;
  }

  if (file && file.size > 700000) {
    showToast("Choose a photo smaller than 700 KB.");
    return;
  }

  function publishProduct(photo) {
    const emojiByCategory = {
      "Fruits": "🍎",
      "Vegetables": "🥬",
      "Nuts": "🥜",
      "Starchy foods": "🥔",
      "Grains": "🌾",
      "Cereals": "🥣",
      "Legumes": "🫘",
      "Spices": "🌶️",
      "Herbal products": "🌿"
    };

    const product = {
      id: "farm-" + Date.now(),
      name: name,
      category: category,
      condition: condition,
      county: county,
      town: town,
      quantity: quantity,
      price: price,
      farmer: farmer,
      phone: phone,
      description: description,
      emoji: emojiByCategory[category] || "🌱",
      photo: photo || ""
    };

    farmerProducts.unshift(product);

    if (!saveFarmerProducts()) {
      farmerProducts.shift();
      return;
    }

    event.target.reset();
    renderFarmerListings();
    renderProducts();
    showToast("Your product has been listed on this browser!");
  }

  if (file) {
    const reader = new FileReader();

    reader.onload = function () {
      publishProduct(reader.result);
    };

    reader.onerror = function () {
      showToast("Could not read the photo. Please try again.");
    };

    reader.readAsDataURL(file);
  } else {
    publishProduct("");
  }
});

