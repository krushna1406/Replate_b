// ✅ Backend: Users & Listings on Google Sheet
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import jwt from "jsonwebtoken";

// ---- Setup paths ----
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Middlewares ----
app.use(cors({ origin: "https://replate-food.onrender.com" })); // frontend URL
app.use(express.json());

// ---- Serve static frontend ----
app.use(express.static(path.join(__dirname, "Public")));

// ---- Config ----
const JWT_SECRET = process.env.JWT_SECRET || "replate_secret_key"; // move to env var
const GOOGLE_USERS_URL =
  "https://script.google.com/macros/s/AKfycbzsdAStNC66ILczZVosZqtRwB1fwSLWI6cNbYJeledFTaZDcIyCcfUCTo26Naj-GSc/exec";
const GOOGLE_LISTINGS_URL =
  "https://script.google.com/macros/s/AKfycbxb8UfJvus8Z5DFLLjKdgHSxWfCO1hXV8OonkruDvjzkmQWgaXvrdn8ncT6Y9J_1Ow0/exec"; // separate Apps Script for listings

// ---- Safe fetch ----
let fetchImpl;
try {
  if (typeof globalThis.fetch === "function") {
    fetchImpl = globalThis.fetch.bind(globalThis);
  } else {
    const nf = await import("node-fetch");
    fetchImpl = nf.default ? nf.default : nf;
  }
} catch (err) {
  console.error("⚠️ Install node-fetch or use Node 18+ environment.");
  process.exit(1);
}

// ---- JWT middleware ----
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token)
    return res.status(401).json({ message: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token." });
    req.user = payload;
    next();
  });
}

// ---- API Routes ----
app.get("/", (req, res) => res.send("✅ Backend is running!"));

// Get all listings
app.get("/api/listings", async (req, res) => {
  try {
    const getRes = await fetchImpl(GOOGLE_LISTINGS_URL + "?action=get");
    if (!getRes.ok) return res.status(502).json({ message: "Failed to fetch listings." });
    const listings = await getRes.json();
    res.json(listings);
  } catch (err) {
    console.error("Listings fetch error:", err);
    res.status(500).json({ message: "Internal error fetching listings." });
  }
});

// Add a new listing
app.post("/api/listings", authenticateToken, async (req, res) => {
  try {
    const listing = req.body;
    if (!listing || Object.keys(listing).length === 0)
      return res.status(400).json({ message: "Listing body required." });

    listing.createdBy = req.user.email || "unknown";
    listing.createdAt = new Date().toISOString();

    const postRes = await fetchImpl(GOOGLE_LISTINGS_URL + "?action=add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    });

    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success)
      return res.status(500).json({ message: "Failed to save listing." });

    res.json({ message: "Listing saved successfully!", data: postJson.data });
  } catch (err) {
    console.error("Add listing error:", err);
    res.status(500).json({ message: "Internal error adding listing." });
  }
});

// Delete a listing
app.delete("/api/listings/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Listing ID required." });

    const postRes = await fetchImpl(GOOGLE_LISTINGS_URL + "?action=delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success)
      return res.status(500).json({ message: "Failed to delete listing." });

    res.json({ message: "Listing deleted successfully!" });
  } catch (err) {
    console.error("Delete listing error:", err);
    res.status(500).json({ message: "Internal error deleting listing." });
  }
});

// ✅ Signup Route
app.post("/signup", async (req, res) => {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Login Route
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await fetch(SCRIPT_URL);
    const users = await response.json();

    const user = users.find(
      (u) =>
        u.email.trim().toLowerCase() === email.trim().toLowerCase() &&
        u.password.trim() === password.trim()
    );

    if (user) {
      res.json({ success: true, message: "Login successful", user });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));


// ---- SPA fallback ----
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));
