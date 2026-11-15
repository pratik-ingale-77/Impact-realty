require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Database models
const propertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  type: { type: String, enum: ["Apartment", "Commercial"], required: true },
  status: {
    type: String,
    enum: ["Available", "Ready to Move", "Under Construction", "Sold"],
    default: "Available"
  },
  price: { type: Number, required: true },
  priceText: String,
  bhk: String,
  area: String,
  image: String,
  description: String,
  amenities: [String],
  featured: { type: Boolean, default: false }
}, { timestamps: true });

const enquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: String,
  interest: String,
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
  visitDate: String,
  callbackTime: String,
  message: String,
  status: { type: String, default: "New" }
}, { timestamps: true });

const Property = mongoose.model("Property", propertySchema);
const Enquiry = mongoose.model("Enquiry", enquirySchema);

// Admin login uses credentials stored in .env
function adminOnly(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) return res.status(401).json({ message: "Admin login required" });

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired login" });
  }
}

// Basic check
app.get("/", (req, res) => {
  res.json({ message: "Impact Realty API is running" });
});

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body || {};

  if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD ||
    !process.env.JWT_SECRET
  ) {
    return res.status(500).json({ message: "Admin environment settings are missing" });
  }

  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Incorrect email or password" });
  }

  const token = jwt.sign({ role: "admin", email }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });

  res.json({ token, message: "Login successful" });
});

// Public: list properties
app.get("/api/properties", async (req, res) => {
  try {
    const filter = {};
    if (req.query.location) filter.location = new RegExp(`^${req.query.location}$`, "i");
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.maxPrice) filter.price = { $lte: Number(req.query.maxPrice) };

    const properties = await Property.find(filter).sort({ featured: -1, createdAt: -1 });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ message: "Could not load properties" });
  }
});

// Public: one property
app.get("/api/properties/:id", async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(property);
  } catch {
    res.status(400).json({ message: "Invalid property ID" });
  }
});

// Admin: add property
app.post("/api/properties", adminOnly, async (req, res) => {
  try {
    const property = await Property.create(req.body);
    res.status(201).json(property);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Admin: edit property
app.put("/api/properties/:id", adminOnly, async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(property);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Admin: delete property
app.delete("/api/properties/:id", adminOnly, async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ message: "Property deleted" });
  } catch {
    res.status(400).json({ message: "Invalid property ID" });
  }
});

// Public: send enquiry / site visit request
app.post("/api/enquiries", async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    const enquiry = await Enquiry.create({
      name,
      phone,
      email: req.body.email,
      interest: req.body.interest,
      propertyId: req.body.propertyId || null,
      visitDate: req.body.visitDate,
      callbackTime: req.body.callbackTime,
      message: req.body.message
    });

    res.status(201).json({ message: "Enquiry received", enquiryId: enquiry._id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Admin: view enquiries
app.get("/api/enquiries", adminOnly, async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 });
    res.json(enquiries);
  } catch {
    res.status(500).json({ message: "Could not load enquiries" });
  }
});

// Admin: update enquiry status
app.patch("/api/enquiries/:id", adminOnly, async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );
    if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
    res.json(enquiry);
  } catch {
    res.status(400).json({ message: "Could not update enquiry" });
  }
});

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  app.listen(PORT, () => {
    console.log(`Impact Realty API running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Backend could not start:", error.message);
  process.exit(1);
});
