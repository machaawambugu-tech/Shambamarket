
/* FUNCTION 1: Sample marketplace products */
const products = [
  {
    name: "Fresh Mangoes",
    type: "fruit",
    county: "Makueni",
    quantity: 50,
    price: 80,
    contact: "Sample contact"
  },
  {
    name: "Fresh Tomatoes",
    type: "vegetable",
    county: "Nakuru",
    quantity: 30,
    price: 100,
    contact: "Sample contact"
  },
  {
    name: "Dry Maize",
    type: "grain",
    county: "Trans Nzoia",
    quantity: 100,
    price: 55,
    contact: "Sample contact"
  }
];

const productList = document.getElementById("product-list");
const searchInput = document.getElementById("search");
const categoryInput = document.getElementById("category");
const productForm = document.getElementById("product-form");
const message = document.getElementById("message");

/* FUNCTION 2: Display products */
function displayProducts() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedCategory = categoryInput.value;

  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm) ||
      product.county.toLowerCase().includes(searchTerm);

    const matchesCategory =
      selectedCategory === "all" ||
      product.type === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  productList.replaceChildren();

  if (filteredProducts.length === 0) {
    productList.textContent = "No matching products found.";
    return;
  }

  filteredProducts.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";

    const title = document.createElement("h3");
    title.textContent = product.name;

    const details = [
      `Category: ${product.type}`,
      `County: ${product.county}`,
      `Quantity: ${product.quantity} kg`,
      `Price: KSh ${product.price} per kg`,
      `Contact: ${product.contact}`
    ];

    card.appendChild(title);

    details.forEach(detail => {
      const paragraph = document.createElement("p");
      paragraph.textContent = detail;
      card.appendChild(paragraph);
    });

    productList.appendChild(card);
  });
}

/* FUNCTION 3: Search and category filters */
searchInput.addEventListener("input", displayProducts);
categoryInput.addEventListener("change", displayProducts);

/* FUNCTION 4: Add a farmer's product */
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
    !Number.isFinite(newProduct.quantity) ||
    !Number.isFinite(newProduct.price) ||
    newProduct.quantity <= 0 ||
    newProduct.price <= 0
  ) {
    message.textContent = "Please enter valid product details.";
    return;
  }

  products.unshift(newProduct);
  productForm.reset();

  searchInput.value = "";
  categoryInput.value = "all";

  displayProducts();
  message.textContent = "Product added successfully!";
});

/* FUNCTION 5: Load the initial marketplace */
displayProducts();
