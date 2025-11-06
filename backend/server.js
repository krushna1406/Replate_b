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
  "https://script.google.com/macros/s/AKfycbz3AN5uZoL6k0hELn0MRQAq7TR78Owort13OsH-SX4mO12p8KC1eTuc558WWDgHNoad/exec";
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

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required." });

    const getRes = await fetchImpl(GOOGLE_USERS_URL + "?action=get");
    const users = await getRes.json();
    const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) return res.status(400).json({ message: "User already exists." });

    const postRes = await fetchImpl(GOOGLE_USERS_URL + "?action=add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success)
      return res.status(500).json({ message: "Failed to save user." });

    res.json({ message: "Signup successful!" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Internal signup error." });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });

    const getRes = await fetchImpl(GOOGLE_USERS_URL + "?action=get");
    const users = await getRes.json();
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign({ email: user.email, name: user.name || "" }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful!", token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal login error." });
  }
});

// ---- SPA fallback ----
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));
