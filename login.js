
document.getElementById("login-form").addEventListener("submit", function (event) {
  event.preventDefault();

  const name = document.getElementById("login-name").value.trim();
  const phone = document.getElementById("login-phone").value.trim();

  if (!name || !phone) {
    showToast("Enter your name and phone number.");
    return;
  }

  try {
    localStorage.setItem("shambaUserName", name);
    localStorage.setItem("shambaUserPhone", phone);
  } catch (error) {
    showToast("Could not save your demo profile.");
    return;
  }

  showToast("Welcome to SHAMBAMARKET, " + name + "!");
  showPage("soko");
});

