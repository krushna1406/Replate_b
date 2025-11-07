const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");
const BASE_URL = "https://replate-food.onrender.com";

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm).entries());
  loginMsg.textContent = "Checking credentials...";
  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      loginMsg.textContent = `❌ ${result.message}`;
      loginMsg.classList.add("danger");
      return;
    }
    loginMsg.textContent = "✅ Login successful!";
    loginMsg.classList.remove("danger");
    localStorage.setItem("token", result.token);
    setTimeout(() => window.location.href = "index.html", 1500);
  } catch (error) {
    console.error("❌ Login error:", error);
    loginMsg.textContent = "❌ Unable to connect to server.";
    loginMsg.classList.add("danger");
  }
});
