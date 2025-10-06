// server.js
// Robust backend that saves users to Google Sheet and serves listings.
// Usage: node server.js
// Make sure your Apps Script web app is deployed and accessible

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 5000;
const JWT_SECRET = "replate_secret_key"; // Replace with env var in production

// ---- Replace this with your deployed Apps Script URL ----
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxNAzYAROmefBWGhUyE2mC9Clm7S5-LEpeyIG1I5OMle5f1Htj-bcsdWBOqvEwqRjRY/exec";

const listingsFile = path.join(__dirname, "listings.json");

// ---- resilient fetch: works on Node 18+ or with node-fetch v2/v3 ----
let fetchImpl;
try {
  // try built-in/global fetch (Node 18+)
  if (typeof globalThis.fetch === "function") {
    fetchImpl = globalThis.fetch.bind(globalThis);
  } else {
    // try node-fetch (v2 or v3)
    // For node-fetch v3: require('node-fetch').default
    const nf = require("node-fetch");
    fetchImpl = nf.default ? nf.default : nf;
  }
} catch (err) {
  console.error("⚠️ Fetch not found. Please install node-fetch (`npm i node-fetch`) or run on Node 18+.");
  process.exit(1);
}

// ---- Express setup ----
app.use(cors());
app.use(express.json());

// ---- Helper: read listings.json safely ----
function readListings() {
  try {
    if (!fs.existsSync(listingsFile)) return [];
    const raw = fs.readFileSync(listingsFile, "utf-8");
    if (!raw) return [];
    return JSON.parse(raw);
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
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token." });
    req.user = payload;
    next();
  });
}

// ---- Routes ----
app.get("/", (req, res) => res.send("Backend is running!"));

// GET listings (public)
app.get("/api/listings", (req, res) => {
  const lists = readListings();
  return res.json(lists);
});

// POST listing (protected)
app.post("/api/listings", authenticateToken, (req, res) => {
  const listing = req.body;
  if (!listing || Object.keys(listing).length === 0) {
    return res.status(400).json({ message: "Listing body required." });
  }

  const lists = readListings();
  // optional: attach id & createdBy
  listing.id = (lists.length ? Number(lists[lists.length - 1].id || lists.length) + 1 : 1);
  listing.createdBy = req.user.email || "unknown";
  listing.createdAt = new Date().toISOString();

  lists.push(listing);

  if (!writeListings(lists)) {
    return res.status(500).json({ message: "Failed to save listing." });
  }

  console.log("📥 New listing saved:", listing);
  return res.json({ message: "Listing saved successfully!", data: listing });
});

// ---- Signup: store user in Google Sheet ----
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required." });
    }

    // Fetch existing users from Google Script
    const getRes = await fetchImpl(GOOGLE_SCRIPT_URL, { method: "GET" });
    if (!getRes.ok) {
      const txt = await getRes.text();
      console.error("Error fetching users from Google Script:", getRes.status, txt);
      return res.status(502).json({ message: "Failed to fetch user list from Google Sheets." });
    }

    const users = await getRes.json();
    // users is expected to be array of objects with 'email' and 'password' keys (as string)
    const exists = Array.isArray(users) && users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase());
    if (exists) {
      return res.status(400).json({ message: "User already exists." });
    }

    // Post new user to Google Script (Apps Script doPost expects JSON with name,email,password)
    const postRes = await fetchImpl(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    // Apps Script returns JSON { success: true, message: "..." }
    const postJson = await postRes.json();

    if (!postRes.ok || !postJson || postJson.success !== true) {
      console.error("Failed to save user to Google Script:", postRes.status, postJson);
      return res.status(500).json({ message: "Failed to save user to Google Sheets." });
    }

    console.log("📝 New user saved to Google Sheet:", email);
    return res.json({ message: "Signup successful!" });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Internal server error during signup." });
  }
});

// ---- Login: read users from Google Sheet and validate ----
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required." });
    }

    const getRes = await fetchImpl(GOOGLE_SCRIPT_URL, { method: "GET" });
    if (!getRes.ok) {
      const txt = await getRes.text();
      console.error("Error fetching users from Google Script:", getRes.status, txt);
      return res.status(502).json({ message: "Failed to fetch user list from Google Sheets." });
    }

    const users = await getRes.json();

    // Match email & password (exact match). Sheet values may be strings.
    const user = Array.isArray(users) && users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase() && String(u.password) === String(password));

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Create JWT containing email and optionally name
    const token = jwt.sign({ email: user.email, name: user.name || "" }, JWT_SECRET, { expiresIn: "1h" });
    return res.json({ message: "Login successful!", token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Internal server error during login." });
  }
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
