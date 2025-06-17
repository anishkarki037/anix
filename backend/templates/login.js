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

router.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }
    // Find user by username or email
    const users = db.find(
      "users",
      (user) => user.username === username || user.email === username
    );
    if (users.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }
    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }
    const { password: pw, ...userWithoutPassword } = user;
    res.json({
      success: true,
      message: "Login successful",
      user: userWithoutPassword,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
