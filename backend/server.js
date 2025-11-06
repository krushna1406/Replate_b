// ✅ Backend that saves users to Google Sheet and handles listings with webhook + delete functionality.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import jwt from "jsonwebtoken";
import fs from "fs";

// ---- Setup paths ----
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Middlewares ----
app.use(cors());
app.use(express.json());

// ---- Serve static frontend ----
app.use(express.static(path.join(__dirname, "Public")));

// ---- Config ----
const JWT_SECRET = "replate_secret_key"; // TODO: move to Render Environment variable
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwEJYjuob6Z9PGIrmtAwGPMOGvz5yY36t1YsQhxQQYTarh0r_uNIBPtgBwpAytNCvEr/exec";
// const N8N_WEBHOOK_URL = "https://your-webhook-url.com"; // optional

const listingsFile = path.join(__dirname, "listings.json");

// ---- Safe fetch handler ----
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
  if (!token)
    return res.status(401).json({ message: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token." });
    req.user = payload;
    next();
  });
}

// ---- API Routes ----
app.get("/", (req, res) => res.send("✅ Backend is running fine!"));

// Get all listings
app.get("/api/listings", (req, res) => {
  const lists = readListings();
  res.json(lists);
});

// Add a new listing
app.post("/api/listings", authenticateToken, async (req, res) => {
  const listing = req.body;
  if (!listing || Object.keys(listing).length === 0)
    return res.status(400).json({ message: "Listing body required." });

  const lists = readListings();
  listing.id = lists.length ? lists[lists.length - 1].id + 1 : 1;
  listing.createdBy = req.user.email || "unknown";
  listing.createdAt = new Date().toISOString();
  lists.push(listing);

  if (!writeListings(lists))
    return res.status(500).json({ message: "Failed to save listing." });

  console.log("📥 New listing saved:", listing);
  res.json({ message: "Listing saved successfully!", data: listing });

  // Optional webhook trigger
  if (typeof N8N_WEBHOOK_URL !== "undefined" && N8N_WEBHOOK_URL) {
    setTimeout(async () => {
      try {
        const webhookRes = await fetchImpl(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(listing),
        });
        console.log(
          "🔔 n8n webhook triggered:",
          webhookRes.ok ? "Success" : "Failed"
        );
      } catch (err) {
        console.error("⚠️ Webhook error:", err);
      }
    }, 100);
  }
});

// Delete a listing
app.delete("/api/listings/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  if (!id)
    return res.status(400).json({ message: "Listing ID required." });

  let lists = readListings();
  const newLists = lists.filter((l) => String(l.id) !== String(id));

  if (newLists.length === lists.length)
    return res.status(404).json({ message: "Listing not found." });

  if (!writeListings(newLists))
    return res.status(500).json({ message: "Failed to delete listing." });

  console.log(`🗑️ Listing ${id} deleted.`);
  res.json({ message: "Listing deleted successfully!" });
});

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required." });

    const getRes = await fetchImpl(GOOGLE_SCRIPT_URL, { method: "GET" });
    if (!getRes.ok)
      return res.status(502).json({ message: "Failed to fetch users." });

    const users = await getRes.json();
    const exists =
      Array.isArray(users) &&
      users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase()
      );
    if (exists)
      return res.status(400).json({ message: "User already exists." });

    const postRes = await fetchImpl(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success)
      return res.status(500).json({ message: "Failed to save user." });

    console.log("📝 User registered:", email);
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
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const getRes = await fetchImpl(GOOGLE_SCRIPT_URL, { method: "GET" });
    if (!getRes.ok)
      return res.status(502).json({ message: "Failed to fetch users." });

    const users = await getRes.json();
    const user =
      Array.isArray(users) &&
      users.find(
        (u) =>
          u.email.toLowerCase() === email.toLowerCase() &&
          u.password === password
      );

    if (!user)
      return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign(
      { email: user.email, name: user.name || "" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ message: "Login successful!", token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal login error." });
  }
});

// ---- SPA fallback (important, use /* not *) ----
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at port ${PORT}`)
);
