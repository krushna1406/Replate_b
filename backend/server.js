// Backend that saves users to Google Sheet and handles listings with webhook + delete functionality.
import express from "express"; // or const express = require("express");
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Optional: fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const fs = require("fs");
path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const PORT = 5000;
const JWT_SECRET = "replate_secret_key"; // Replace with env var in production

// Replace with your actual Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwEJYjuob6Z9PGIrmtAwGPMOGvz5yY36t1YsQhxQQYTarh0r_uNIBPtgBwpAytNCvEr/exec";

// Replace this with your own n8n webhook URL (Production, not /webhook-test)
// const N8N_WEBHOOK_URL = " https://lisa-electromotive-kaliyah.ngrok-free.dev/webhook/new-listing-v2";

const listingsFile = path.join(__dirname, "listings.json");

// ---- resilient fetch ----
let fetchImpl;
try {
  if (typeof globalThis.fetch === "function") {
    fetchImpl = globalThis.fetch.bind(globalThis);
  } else {
    const nf = require("node-fetch");
    fetchImpl = nf.default ? nf.default : nf;
  }
} catch (err) {
  console.error("⚠️ Install node-fetch or run on Node 18+.");
  process.exit(1);
}

// ---- Express setup ----
app.use(cors());
app.use(express.json());

// ---- Helper functions ----
function readListings() {
  try {
    if (!fs.existsSync(listingsFile)) return [];
    const raw = fs.readFileSync(listingsFile, "utf-8");
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Error reading listings.json:", err);
    return [];
  }
}

function writeListings(lists) {
  try {
    fs.writeFileSync(listingsFile, JSON.stringify(lists, null, 2));
    return true;
  } catch (err) {
    console.error("Error writing listings.json:", err);
    return false;
  }
}

// ---- JWT middleware ----
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token." });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token." });
    req.user = payload;
    next();
  });
}

// ---- Routes ----
app.get("/", (req, res) => res.send("Backend is running!"));

// Get all listings
app.get("/api/listings", (req, res) => {
  const lists = readListings();
  res.json(lists);
});

// Add a new listing (Webhook Trigger)
app.post("/api/listings", authenticateToken, async (req, res) => {
  const listing = req.body;
  if (!listing || Object.keys(listing).length === 0) {
    return res.status(400).json({ message: "Listing body required." });
  }

  // Save listing locally
  const lists = readListings();
  listing.id = (lists.length ? Number(lists[lists.length - 1].id || lists.length) + 1 : 1);
  listing.createdBy = req.user.email || "unknown";
  listing.createdAt = new Date().toISOString();
  lists.push(listing);

  if (!writeListings(lists)) {
    return res.status(500).json({ message: "Failed to save listing." });
  }

  console.log("📥 New listing saved:", listing);

  // Respond to frontend immediately (important!)
  res.json({ message: "Listing saved successfully!", data: listing });

  // Trigger n8n webhook in background (non-blocking)
  setTimeout(async () => {
    try {
      const webhookRes = await fetchImpl(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: listing.title,
          location: listing.location,
          quantity: listing.quantity,
          contact: listing.contact,
          createdBy: listing.createdBy,
          createdAt: listing.createdAt,
        }),
      });

      if (webhookRes.ok) {
        console.log("🔔 n8n webhook triggered successfully!");
      } else {
        console.error("⚠️ n8n webhook responded with:", webhookRes.status);
      }
    } catch (err) {
      console.error("⚠️ Failed to trigger n8n webhook:", err);
    }
  }, 100); // run after short delay
});

// Delete a listing
// Delete a listing
app.delete("/api/listings/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: "Listing ID required." });

  let lists = readListings();
  const initialLength = lists.length;
  lists = lists.filter((l) => String(l.id) !== String(id));

  if (lists.length === initialLength) {
    return res.status(404).json({ message: "Listing not found." });
  }

  if (!writeListings(lists)) {
    return res.status(500).json({ message: "Failed to delete listing." });
  }

  console.log(`🗑️ Listing with ID ${id} deleted.`);
  res.json({ message: "Listing claimed and removed successfully!" });
});

// ---- Signup ----
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required." });
    }

    const getRes = await fetchImpl(GOOGLE_SCRIPT_URL, { method: "GET" });
    if (!getRes.ok) return res.status(502).json({ message: "Failed to fetch user list." });

    const users = await getRes.json();
    const exists = Array.isArray(users) && users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase());
    if (exists) return res.status(400).json({ message: "User already exists." });

    const postRes = await fetchImpl(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success) {
      return res.status(500).json({ message: "Failed to save user." });
    }

    console.log("📝 New user saved:", email);
    res.json({ message: "Signup successful!" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Internal error during signup." });
  }
});

// ---- Login ----
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });

    const getRes = await fetchImpl(GOOGLE_SCRIPT_URL, { method: "GET" });
    if (!getRes.ok) return res.status(502).json({ message: "Failed to fetch user list." });

    const users = await getRes.json();
    const user = Array.isArray(users) && users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase() && String(u.password) === String(password));

    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign({ email: user.email, name: user.name || "" }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful!", token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal error during login." });
  }
});

// ---- Start server ----
PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));