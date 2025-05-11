import { fileURLToPath } from "url";
import { dirname } from "path";
import express from "express";
import { Astpoint } from "../../src/astpoint.js";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const db = new Astpoint(path.join(__dirname, "../database/database.ast"));

router.post("/api/search", (req, res) => {
  try {
    const { table, query } = req.body;
    if (!table || !query) {
      return res
        .status(400)
        .json({ success: false, message: "Table and query are required" });
    }
    // Simple search: match any field containing the query string (case-insensitive)
    const results = db.find(table, (item) => {
      return Object.values(item).some(
        (val) =>
          typeof val === "string" &&
          val.toLowerCase().includes(query.toLowerCase())
      );
    });
    res.json({ success: true, count: results.length, results });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
