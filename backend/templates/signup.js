import { fileURLToPath } from "url";
import { dirname } from "path";
import express from "express";
import bcrypt from "bcrypt";
import { Astpoint } from "../../core/astpoint.js";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const db = new Astpoint(path.join(__dirname, "../database/database.ast"));

router.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password, fullName, age, terms } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and password are required",
      });
    }
    const existingUsers = db.find(
      "users",
      (user) => user.username === username
    );
    if (existingUsers.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "Username already taken" });
    }
    const existingEmails = db.find("users", (user) => user.email === email);
    if (existingEmails.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = {
      username,
      email,
      password: hashedPassword,
      fullName: fullName || "",
      age: age || null,
      terms: terms === "on" || terms === true ? "accepted" : "declined",
      createdAt: new Date().toISOString(),
    };
    const result = db.insert("users", newUser);
    if (result.inserted) {
      const { password, ...userWithoutPassword } = newUser;
      res.status(201).json({
        success: true,
        message: "User created successfully",
        user: userWithoutPassword,
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to create user" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
