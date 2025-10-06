// login.js

const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(loginForm).entries());
  loginMsg.textContent = "Checking credentials...";

  try {
    const response = await fetch("http://localhost:5000/api/login", {
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

    // Store JWT token for authenticated routes
    localStorage.setItem("token", result.token);

    // Redirect to homepage after 1.5 sec
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1500);
  } catch (error) {
    console.error("❌ Login error:", error);
    loginMsg.textContent = "❌ Unable to connect to server.";
    loginMsg.classList.add("danger");
  }
});
