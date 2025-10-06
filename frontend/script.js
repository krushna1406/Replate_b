// ----- DOM elements -----
const modal = document.getElementById("modal");
const openDonateBtn = document.getElementById("open-donate");
const openDonate2Btn = document.getElementById("open-donate-2");
const openDonate3Btn = document.getElementById("open-donate-3");
const closeBtn = document.getElementById("close");
const cancelBtn = document.getElementById("cancel");
const form = document.getElementById("form");
const formMsg = document.getElementById("formMsg");
const listContainer = document.getElementById("list");
const searchInput = document.getElementById("search");
const filterSelect = document.getElementById("filterTag");
const resetBtn = document.getElementById("reset");

// ----- Modal functions -----
function openModal() { modal.style.display = "flex"; }
function closeModal() { modal.style.display = "none"; }

openDonateBtn?.addEventListener("click", openModal);
openDonate2Btn?.addEventListener("click", openModal);
openDonate3Btn?.addEventListener("click", openModal);
closeBtn?.addEventListener("click", closeModal);
cancelBtn?.addEventListener("click", closeModal);
window.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// ----- Listings fetch/render -----
let allListings = [];

async function fetchAndStoreListings() {
  try {
    const res = await fetch("http://localhost:5000/api/listings");
    if (!res.ok) throw new Error("Failed to fetch listings");
    const listings = await res.json();
    allListings = listings;
    renderListings(allListings);
  } catch (err) {
    console.error(err);
    listContainer.innerHTML = "<p>Failed to load listings.</p>";
  }
}

function renderListings(listings) {
  listContainer.innerHTML = "";
  if (!listings || listings.length === 0) {
    listContainer.innerHTML = "<p>No listings available.</p>";
    return;
  }

  listings.forEach(listing => {
    const div = document.createElement("div");
    div.className = "card listing";
    div.innerHTML = `
      <h3>${escapeHtml(listing.name)} (${escapeHtml(listing.role)})</h3>
      <p>Type: ${escapeHtml(listing.type)} | Qty: ${escapeHtml(listing.qty)}</p>
      <p>Pickup Location: ${escapeHtml(listing.address)}</p>
      <p>Contact: ${escapeHtml(listing.phone)}</p>
      <p>Notes: ${escapeHtml(listing.notes || "-")}</p>
      <p>Safe-by: ${escapeHtml(listing.safeBy || "-")}</p>
    `;
    listContainer.appendChild(div);
  });
}

// tiny helper to avoid raw HTML injection
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// ----- Form submit: create listing -----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  formMsg.textContent = "Publishing...";

  try {
    const token = localStorage.getItem("token"); 
    if (!token) throw new Error("No authentication token found. Please login.");

    const response = await fetch("http://localhost:5000/api/listings", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await response.json();
    formMsg.textContent = "✅ Listing created successfully!";
    form.reset();

    await fetchAndStoreListings();

    setTimeout(() => {
      modal.style.display = "none";
      formMsg.textContent = "";
    }, 1200);

  } catch (err) {
    console.error("Submit error:", err);
    formMsg.textContent = "❌ " + err.message;
  }
});

// ----- Filters & search -----
filterSelect.addEventListener("change", applyFilters);
searchInput.addEventListener("input", applyFilters);
resetBtn.addEventListener("click", () => {
  searchInput.value = "";
  filterSelect.value = "";
  renderListings(allListings);
});

function applyFilters() {
  const filter = filterSelect.value.trim().toLowerCase();
  let filtered = allListings.slice();

  if (filter) {
    filtered = filtered.filter(l => (l.type||"").toLowerCase() === filter ||
                                    (l.role||"").toLowerCase() === filter);
  }

  const term = searchInput.value.trim().toLowerCase();
  if (term) {
    filtered = filtered.filter(l =>
      (l.name||"").toLowerCase().includes(term) ||
      (l.address||"").toLowerCase().includes(term) ||
      (l.notes||"").toLowerCase().includes(term)
    );
  }

  renderListings(filtered);
}

// ----- Check login and redirect if not -----
function checkLogin() {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("You must login first!");
    window.location.href = "login.html";
  }
}

// initial load
window.addEventListener("DOMContentLoaded", () => {
  checkLogin();
  fetchAndStoreListings();
});
