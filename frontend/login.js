// This is login js

// Get DOM elements
const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Get form data
  const data = Object.fromEntries(new FormData(loginForm).entries());
  console.log("📝 Login data:", data);

  try {
    const response = await fetch("http://localhost:5000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      loginMsg.textContent = `❌ ${result.message}`;
      loginMsg.classList.add("danger");
      return;
    }

    // Success
    loginMsg.textContent = "✅ Login successful!";
    loginMsg.classList.remove("danger");

    // Save token or user info if using JWT
    localStorage.setItem("token", result.token);

    // Redirect to homepage after login
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);

  } catch (error) {
    console.error("❌ Login fetch error:", error);
    loginMsg.textContent = "❌ Something went wrong!";
    loginMsg.classList.add("danger");
  }
});
