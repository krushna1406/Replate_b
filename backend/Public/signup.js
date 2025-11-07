const signupForm = document.getElementById("signupForm");
const signupMsg = document.getElementById("signupMsg");
const BASE_URL = "https://replate-food.onrender.com";

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(signupForm).entries());
  signupMsg.textContent = "Creating account...";
  try {
    const res = await fetch(`${BASE_URL}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      signupMsg.textContent = `❌ ${result.message}`;
      signupMsg.classList.add("danger");
      return;
    }
    signupMsg.textContent = "✅ Account created successfully!";
    signupMsg.classList.remove("danger");
    setTimeout(() => window.location.href = "login.html", 1500);
  } catch (err) {
    console.error("❌ Signup error:", err);
    signupMsg.textContent = "❌ Unable to connect to server.";
    signupMsg.classList.add("danger");
  }
});
