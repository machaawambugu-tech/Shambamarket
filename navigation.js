
function showPage(pageName) {
  document.querySelectorAll(".page").forEach(function (page) {
    page.classList.remove("active-page");
  });

  const selectedPage = document.getElementById(pageName + "-page");

  if (!selectedPage) return;

  selectedPage.classList.add("active-page");

  document.querySelectorAll(".nav-link").forEach(function (button) {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(function () {
    toast.classList.remove("show");
  }, 3000);
}

