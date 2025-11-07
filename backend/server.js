// ✅ server.js (Render-ready)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import jwt from "jsonwebtoken";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: ["https://replate-food.onrender.com", "http://localhost:3000"],
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "Public")));

const JWT_SECRET = process.env.JWT_SECRET || "replate_secret_key";

// <-- Replace these with your deployed Apps Script URLs -->
const GOOGLE_USERS_URL = "https://script.google.com/macros/s/AKfycbwVx4CsD8xtCjTAzrX83X641pazwU6ccp7KtV_VewVQYVTYRruJWzdWhJZD3arPhb-2/exec";
const GOOGLE_LISTINGS_URL = "https://script.google.com/macros/s/AKfycbzqhUv7dPp9599PmcxlnCJgz47uuypo94pzQMEmDo7PVt0Q6p9eKBRvfpxPP7V7UPNG/exec";

// safe fetch
let fetchImpl;
try {
  if (typeof globalThis.fetch === "function") fetchImpl = globalThis.fetch.bind(globalThis);
  else {
    const nf = await import("node-fetch");
    fetchImpl = nf.default ? nf.default : nf;
  }
} catch (err) {
  console.error("⚠️ fetch unavailable:", err);
  process.exit(1);
}

// JWT middleware
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

// --- Helpers to transform between sheet headers and frontend fields ---
// sheet uses: listId, role, resname, phone, address, type, quantity, safeby, notes, createdBy, createdAt
function sheetToClient(s) {
  return {
    id: s.listId ? Number(s.listId) : s.listId,
    role: s.role || "",
    name: s.resname || "",
    phone: s.phone || "",
    address: s.address || "",
    type: s.type || "",
    quantity: s.quantity || "",
    safeby: s.safeby || s.safeBy || "",
    notes: s.notes || "",
    createdBy: s.createdBy || "",
    createdAt: s.createdAt || ""
  };
}
function clientToSheet(body, createdBy, createdAt) {
  return {
    // do NOT include listId (sheet will auto assign)
    role: body.role || "",
    resname: body.name || "",
    phone: body.phone || "",
    address: body.address || "",
    type: body.type || "",
    quantity: body.quantity || "",
    safeby: body.safeby || body.safeBy || "",
    notes: body.notes || "",
    createdBy: createdBy || "",
    createdAt: createdAt || new Date().toISOString()
  };
}

// --- Routes ---

app.get("/", (req, res) => res.send("✅ Backend is running!"));

// Get listings (maps listId/resname → id/name so frontend code works unchanged)
app.get("/api/listings", async (req, res) => {
  try {
    const getRes = await fetchImpl(`${GOOGLE_LISTINGS_URL}?action=get`);
    if (!getRes.ok) {
      const text = await getRes.text();
      console.error("Listings fetch non-ok:", getRes.status, text);
      return res.status(502).json({ message: "Failed to fetch listings." });
    }
    const sheetListings = await getRes.json();
    const mapped = Array.isArray(sheetListings) ? sheetListings.map(sheetToClient) : [];
    return res.json(mapped);
  } catch (err) {
    console.error("Listings fetch error:", err);
    return res.status(500).json({ message: "Internal error fetching listings." });
  }
});

// Add listing (convert client keys → sheet keys)
app.post("/api/listings", authenticateToken, async (req, res) => {
  try {
    const listing = req.body;
    if (!listing || Object.keys(listing).length === 0)
      return res.status(400).json({ message: "Listing body required." });

    const createdBy = req.user.email || "unknown";
    const createdAt = new Date().toISOString();
    const sheetBody = clientToSheet(listing, createdBy, createdAt);

    const postRes = await fetchImpl(`${GOOGLE_LISTINGS_URL}?action=add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sheetBody)
    });

    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success) {
      console.error("Add listing failed:", postRes.status, postJson);
      return res.status(500).json({ message: "Failed to save listing." });
    }

    // postJson.data is an array/row — Apps Script returns row array; our Apps Script returns data object => we map safe
    const returned = postJson.data || postJson.row || postJson;
    // If returned is array, map by headers — but our Apps Script returns data object; try to map robustly:
    const sheetObj = returned && typeof returned === "object" ? returned : {};
    const clientObj = sheetToClient(sheetObj);
    return res.json({ message: "Listing saved successfully!", data: clientObj });
  } catch (err) {
    console.error("Add listing error:", err);
    return res.status(500).json({ message: "Internal error adding listing." });
  }
});

// Delete listing (Apps Script expects body.id to match listId)
app.delete("/api/listings/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Listing ID required." });

    const postRes = await fetchImpl(`${GOOGLE_LISTINGS_URL}?action=delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success) {
      console.error("Delete listing failed:", postRes.status, postJson);
      return res.status(500).json({ message: "Failed to delete listing." });
    }

    return res.json({ message: "Listing deleted successfully!" });
  } catch (err) {
    console.error("Delete listing error:", err);
    return res.status(500).json({ message: "Internal error deleting listing." });
  }
});

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: "All fields required." });

    const getRes = await fetchImpl(`${GOOGLE_USERS_URL}?action=get`);
    if (!getRes.ok) {
      console.error("Users GET failed:", getRes.status, await getRes.text());
      return res.status(502).json({ message: "Failed to fetch users." });
    }
    const users = await getRes.json();
    const exists = Array.isArray(users) && users.find(u => String(u.email || "").toLowerCase() === String(email).toLowerCase());
    if (exists) return res.status(400).json({ message: "User already exists." });

    const postRes = await fetchImpl(`${GOOGLE_USERS_URL}?action=add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success) {
      console.error("Users POST failed:", postRes.status, postJson);
      return res.status(500).json({ message: "Failed to save user." });
    }
    return res.json({ message: "Signup successful!" });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Internal signup error." });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });

    const getRes = await fetchImpl(`${GOOGLE_USERS_URL}?action=get`);
    if (!getRes.ok) {
      console.error("Users GET failed:", getRes.status, await getRes.text());
      return res.status(502).json({ message: "Failed to fetch users." });
    }
    const users = await getRes.json();

    const user = Array.isArray(users) && users.find(u =>
      String(u.email || "").trim().toLowerCase() === String(email).trim().toLowerCase() &&
      String(u.password || "") === String(password)
    );

    if (!user) {
      console.log("Login failed:", email, "usersCount:", Array.isArray(users) ? users.length : 0);
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign({ email: user.email, name: user.name || "" }, JWT_SECRET, { expiresIn: "1h" });
    return res.json({ message: "Login successful!", token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Internal login error." });
  }
});

// SPA fallback
app.get("(.*)", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));
