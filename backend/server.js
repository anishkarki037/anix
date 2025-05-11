// server.js - Express server that interfaces with Astpoint DB
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Astpoint from "./astpoint/astpoint.js";
import fs from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5431;

// Database connections cache
const dbConnections = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// Get available database files
function getAvailableDatabases() {
  const dbDir = path.join(__dirname, "database");

  // Create database directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Read all .ast files
  const files = fs
    .readdirSync(dbDir)
    .filter((file) => file.endsWith(".ast"))
    .map((file) => ({
      name: file,
      path: path.join("database", file),
      size: fs.statSync(path.join(dbDir, file)).size,
      modified: fs.statSync(path.join(dbDir, file)).mtime,
    }));

  return files;
}

// Get or create database connection
function getDbConnection(dbPath) {
  // Normalize path
  const normalizedPath = path.resolve(dbPath);

  if (!dbConnections.has(normalizedPath)) {
    dbConnections.set(normalizedPath, new Astpoint(normalizedPath));
  }

  return dbConnections.get(normalizedPath);
}

// Routes

// Get list of databases
app.get("/api/databases", (req, res) => {
  try {
    const databases = getAvailableDatabases();
    res.json({ success: true, databases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new database
app.post("/api/databases", (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Database name is required" });
    }

    // Ensure it has .ast extension
    const dbName = name.endsWith(".ast") ? name : `${name}.ast`;
    const dbPath = join(__dirname, "database", dbName);

    // Check if file already exists
    if (fs.existsSync(dbPath)) {
      return res
        .status(400)
        .json({ success: false, error: "Database already exists" });
    }

    // Create empty file
    fs.writeFileSync(dbPath, "");

    // Add to connections
    getDbConnection(dbPath);

    res.json({
      success: true,
      message: "Database created",
      database: {
        name: dbName,
        path: join("database", dbName),
        size: 0,
        modified: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete database
app.delete("/api/databases/:name", (req, res) => {
  try {
    const dbName = req.params.name;
    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    // Remove from connections
    const normalizedPath = path.resolve(dbPath);
    dbConnections.delete(normalizedPath);

    // Delete file
    fs.unlinkSync(dbPath);

    res.json({ success: true, message: "Database deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get database tables
app.get("/api/databases/:name/tables", (req, res) => {
  try {
    const dbName = req.params.name;
    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);
    const tables = db.listTables();

    // Get record counts for each table
    const tablesWithCounts = tables.map((table) => ({
      name: table,
      count: db.count(table),
    }));

    res.json({ success: true, tables: tablesWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new table (by inserting a record)
app.post("/api/databases/:name/tables", (req, res) => {
  try {
    const dbName = req.params.name;
    const { tableName, record } = req.body;

    if (!tableName || !tableName.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Table name is required" });
    }

    if (!record || typeof record !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "Initial record is required" });
    }

    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);

    // Check if table already exists
    const existingTables = db.listTables();
    if (existingTables.includes(tableName)) {
      return res
        .status(400)
        .json({ success: false, error: "Table already exists" });
    }

    // Insert record to create table
    const result = db.insert(tableName, record);

    res.json({
      success: true,
      message: "Table created",
      table: {
        name: tableName,
        count: 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete table
app.delete("/api/databases/:name/tables/:table", (req, res) => {
  try {
    const dbName = req.params.name;
    const tableName = req.params.table;
    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);
    const result = db.dropTable(tableName);

    res.json({
      success: true,
      message: `Table ${result.dropped ? "deleted" : "not found"}`,
      table: tableName,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get table records
app.get("/api/databases/:name/tables/:table/records", (req, res) => {
  try {
    const dbName = req.params.name;
    const tableName = req.params.table;
    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);
    const records = db.find(tableName);

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert record
app.post("/api/databases/:name/tables/:table/records", (req, res) => {
  try {
    const dbName = req.params.name;
    const tableName = req.params.table;
    const { record } = req.body;

    if (!record || typeof record !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "Record is required" });
    }

    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);
    const result = db.insert(tableName, record);

    res.json({
      success: true,
      message: "Record inserted",
      record,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update records
app.put("/api/databases/:name/tables/:table/records", (req, res) => {
  try {
    const dbName = req.params.name;
    const tableName = req.params.table;
    const { filter, updates } = req.body;

    if (!filter || typeof filter !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "Filter condition is required" });
    }

    if (!updates || typeof updates !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "Updates are required" });
    }

    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);

    // Create filter function
    const filterFn = (record) => {
      for (const [key, value] of Object.entries(filter)) {
        if (record[key] !== value) {
          return false;
        }
      }
      return true;
    };

    const result = db.update(tableName, filterFn, updates);

    res.json({
      success: true,
      message: `Updated ${result.updated} record(s)`,
      updated: result.updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete records
app.delete("/api/databases/:name/tables/:table/records", (req, res) => {
  try {
    const dbName = req.params.name;
    const tableName = req.params.table;
    const filter = req.body;

    if (!filter || typeof filter !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "Filter condition is required" });
    }

    const dbPath = join(__dirname, "database", dbName);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    const db = getDbConnection(dbPath);

    // Create filter function
    const filterFn = (record) => {
      for (const [key, value] of Object.entries(filter)) {
        if (record[key] !== value) {
          return false;
        }
      }
      return true;
    };

    const result = db.delete(tableName, filterFn);

    res.json({
      success: true,
      message: `Deleted ${result.deleted} record(s)`,
      deleted: result.deleted,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute a raw query
app.post("/api/query", (req, res) => {
  try {
    const { database, query } = req.body;

    if (!database) {
      return res
        .status(400)
        .json({ success: false, error: "Database name is required" });
    }

    if (!query) {
      return res
        .status(400)
        .json({ success: false, error: "Query is required" });
    }

    const dbPath = join(__dirname, "database", database);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      return res
        .status(404)
        .json({ success: false, error: "Database not found" });
    }

    // Import dynamically to avoid circular dependencies
    import("./astpoint/queryParser.js")
      .then((module) => {
        // Set active DB
        const activeDB = getDbConnection(dbPath);

        // Execute query
        const result = module.default(query);

        res.json({
          success: true,
          result,
        });
      })
      .catch((error) => {
        res.status(500).json({ success: false, error: error.message });
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Astpoint Web GUI running on http://localhost:${PORT}`);
});

// Create public directory if it doesn't exist
const publicDir = join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Export app for testing
export default app;
