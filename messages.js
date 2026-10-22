
function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem("shambaMessages"));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

let messages = loadMessages();

function renderMessages() {
  const container = document.getElementById("message-list");
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = '<p class="muted">No messages yet. Write a message to start your demo conversation.</p>';
    return;
  }

  container.innerHTML = messages.map(function (message) {
    return `
      <div class="message-bubble">
        <strong>${escapeHTML(message.sender)}</strong>
        <div>${escapeHTML(message.text)}</div>
        <small>${escapeHTML(message.time)}</small>
      </div>
    `;
  }).join("");

  container.scrollTop = container.scrollHeight;
}

document.getElementById("message-form").addEventListener("submit", function (event) {
  event.preventDefault();

  const input = document.getElementById("message-input");
  const text = input.value.trim();

  if (!text) return;

  messages.push({
    sender: localStorage.getItem("shambaUserName") || "Demo user",
    text: text,
    time: new Date().toLocaleString()
  });

  try {
    localStorage.setItem("shambaMessages", JSON.stringify(messages));
  } catch (error) {
    messages.pop();
    showToast("Could not save the message.");
    return;
  }

  input.value = "";
  renderMessages();
});

