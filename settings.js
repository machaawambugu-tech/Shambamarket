
function applySavedTheme() {
  let theme = "light";

  try {
    theme = localStorage.getItem("shambaTheme") || "light";
  } catch (error) {
    // Use light mode if browser storage is unavailable.
  }

  document.body.classList.toggle("dark-mode", theme === "dark");
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark-mode");
  const theme = isDark ? "dark" : "light";

  try {
    localStorage.setItem("shambaTheme", theme);
  } catch (error) {
    showToast("Theme changed for this session only.");
    return;
  }

  showToast(isDark ? "Dark mode enabled." : "Light mode enabled.");
}

function initializeApp() {
  applySavedTheme();
  renderCategories();
  renderProducts();
  renderFarmerListings();
  renderMessages();
  renderOrders();
}

initializeApp();

