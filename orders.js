
function loadOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem("shambaOrders"));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

let orders = loadOrders();

function createOrder(productId) {
  const product = getAllProducts().find(function (item) {
    return item.id === productId;
  });

  if (!product) {
    showToast("Product not found.");
    return;
  }

  const accepted = confirm(
    "Create a demo order for " + product.name +
    " at KSh " + product.price + " per kg?"
  );

  if (!accepted) return;

  const order = {
    id: "ORD-" + Date.now(),
    product: product.name,
    farmer: product.farmer,
    price: product.price,
    status: "Demo order",
    date: new Date().toLocaleDateString()
  };

  orders.unshift(order);

  try {
    localStorage.setItem("shambaOrders", JSON.stringify(orders));
  } catch (error) {
    orders.shift();
    showToast("Could not save this order.");
    return;
  }

  renderOrders();
  showToast("Demo order created.");
}

function renderOrders() {
  const container = document.getElementById("orders-list");
  const empty = document.getElementById("empty-orders");
  const count = document.getElementById("my-order-count");

  if (!container) return;

  container.innerHTML = orders.map(function (order) {
    return `
      <article class="order-card">
        <h3>${escapeHTML(order.product)}</h3>
        <p>Order number: ${escapeHTML(order.id)}</p>
        <p>Farmer: ${escapeHTML(order.farmer)}</p>
        <p>Price: KSh ${Number(order.price).toLocaleString("en-KE")} per kg</p>
        <p>Date: ${escapeHTML(order.date)}</p>
        <span class="order-status">${escapeHTML(order.status)}</span>
      </article>
    `;
  }).join("");

  if (empty) empty.hidden = orders.length > 0;
  if (count) count.textContent = orders.length;
}
