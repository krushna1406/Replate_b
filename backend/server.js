// This is server.js

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const JWT_SECRET = "replate_secret_key"; 
// store securely in .env in real projects
const listingsFile = path.join(__dirname, "listings.json");
const usersFile = path.join(__dirname, "users.json");

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token." });

    req.user = user;
    next();
  });
}
const app = express();
const PORT = 5000;
// Middleware
app.use(cors());
app.use(express.json());
// Test route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});
// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}


// POST route
// POST route: Create a new listing (protected)
app.post("/api/listings", authenticateToken, (req, res) => {
  const listing = req.body;

  let listings = [];
  try {
    if (fs.existsSync(listingsFile)) {
      const data = fs.readFileSync(listingsFile, "utf-8");
      listings = JSON.parse(data || "[]");
    }
  } catch (err) {
    console.error("Error reading listings.json:", err);
    listings = [];
  }

  listings.push(listing);

  try {
    fs.writeFileSync(listingsFile, JSON.stringify(listings, null, 2));
    console.log("📥 New listing saved:", listing);
    res.json({ message: "Listing saved successfully!", data: listing });
  } catch (err) {
    console.error("Error writing listings.json:", err);
    res.status(500).json({ message: "Failed to save listing" });
  }
});
// **GET route**
app.get("/api/listings", (req, res) => {
  const filePath = path.join(__dirname, "listings.json");

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const listings = JSON.parse(data);
    res.json(listings);
  } catch (err) {
    console.error("Error reading listings.json:", err);
    res.status(500).json({ message: "Failed to fetch listings" });
  }
});
// POST route: User login with JWT
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  try {
    const data = fs.readFileSync(usersFile, "utf-8");
    const users = JSON.parse(data || "[]");

    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token (expires in 1 hour)
    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ message: "Login successful!", token });

  } catch (err) {
    console.error("Error reading users.json:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST route: User signup
app.post("/api/signup", (req, res) => {
  const { email, password } = req.body;

  try {
    let users = [];
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, "utf-8");
      users = JSON.parse(data || "[]");
    }

    // Check if user already exists
    const exists = users.find(u => u.email === email);
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Add new user
    users.push({ email, password });

    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    console.log("📝 New user created:", email);

    res.json({ message: "Signup successful!" });

  } catch (err) {
    console.error("Error reading/writing users.json:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
// POST route: user login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  let users = [];
  try {
    if (fs.existsSync(usersFile)) {
      const data = fs.readFileSync(usersFile, "utf-8");
      users = JSON.parse(data || "[]");
    }
  } catch (err) {
    console.error("Error reading users.json:", err);
    users = [];
  }

  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Generate JWT
  const token = jwt.sign({ email: user.email, role: user.role || "user" }, JWT_SECRET, { expiresIn: "1h" });

  res.json({ token, user: { email: user.email, role: user.role } });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});