import { fileURLToPath } from "url";
import { dirname } from "path";
import express from "express";
import { Astpoint } from "../../core/astpoint.js";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const db = new Astpoint(path.join(__dirname, "../database/database.ast"));

router.post("/api/contact", (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }
    const newContact = {
      name,
      email,
      message,
      createdAt: new Date().toISOString(),
    };
    const result = db.insert("contacts", newContact);
    if (result.inserted) {
      res
        .status(201)
        .json({ success: true, message: "Contact message sent successfully" });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to send message" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
