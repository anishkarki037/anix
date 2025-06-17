// queryParser.js - Query language interpreter
import Astpoint from "./astpoint.js";
import path from "node:path";

// Store active database connections
const connections = new Map();
let activeConnection = null;

function getDB() {
  if (!activeConnection) {
    throw new Error("No active database connection. Use 'USE <dbPath>' first.");
  }
  return connections.get(activeConnection);
}

function parseWhereClause(clause) {
  if (!clause) return () => true;

  // Support for basic operators: =, !=, >, <, >=, <=
  const operators = {
    "=": (a, b) => a === b,
    "!=": (a, b) => a !== b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    LIKE: (a, b) => {
      if (typeof a !== "string") return false;
      b = b.replace(/%/g, ".*");
      return new RegExp(`^${b}$`, "i").test(a);
    },
  };

  // Detect operator
  let operator = "=";
  let parts;

  for (const op of Object.keys(operators)) {
    if (clause.includes(op)) {
      operator = op;
      parts = clause.split(new RegExp(`\\s*${op}\\s*`));
      break;
    }
  }

  if (!parts) {
    parts = clause.split(/\s*=\s*/);
  }

  const [key, rawValue] = parts;

  // Handle string literals with quotes
  let value;
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    value = rawValue.slice(1, -1);
  } else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    value = rawValue.slice(1, -1);
  } else if (rawValue.toLowerCase() === "true") {
    value = true;
  } else if (rawValue.toLowerCase() === "false") {
    value = false;
  } else if (rawValue.toLowerCase() === "null") {
    value = null;
  } else if (!isNaN(rawValue)) {
    value = Number(rawValue);
  } else {
    value = rawValue;
  }

  return (record) => operators[operator](record[key.trim()], value);
}

function parseObject(jsonLike) {
  // Remove all whitespace except between quotes
  let jsonString = jsonLike.trim();

  // Handle cases where the object might be wrapped in {}
  if (jsonString.startsWith("{") && jsonString.endsWith("}")) {
    jsonString = jsonString.slice(1, -1).trim();
  }

  // Convert to valid JSON
  jsonString = jsonString
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":') // Ensure property names are quoted
    .replace(/'/g, '"') // Replace single quotes with double quotes
    .replace(/"\s*:\s*/g, '":'); // Remove spaces around colons

  try {
    return JSON.parse(`{${jsonString}}`);
  } catch (e) {
    try {
      // Fallback to eval if JSON.parse fails
      return eval(`({${jsonLike}})`);
    } catch (err) {
      throw new Error(`Invalid object format: ${jsonLike}`);
    }
  }
}

export default function runQuery(command) {
  try {
    const lines = command
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return { success: true, message: "Empty command" };

    const firstLine = lines[0];

    // USE command to select database file
    if (firstLine.toUpperCase().startsWith("USE ")) {
      const dbPath = firstLine.substring(4).trim();
      const normalizedPath = path.resolve(dbPath.replace(/['"]/g, ""));

      if (!connections.has(normalizedPath)) {
        connections.set(normalizedPath, new Astpoint(normalizedPath));
      }

      activeConnection = normalizedPath;
      return {
        success: true,
        message: `Using database: ${path.basename(normalizedPath)}`,
      };
    }

    // DATABASE INFO command
    if (firstLine.toUpperCase() === "DATABASE INFO") {
      if (!activeConnection) {
        return { success: false, error: "No active database connection" };
      }

      const db = getDB();
      const tables = db.listTables();
      const tableCounts = {};

      for (const table of tables) {
        tableCounts[table] = db.count(table);
      }

      return {
        success: true,
        database: path.basename(activeConnection),
        tables: tableCounts,
      };
    }

    // LIST TABLES command
    if (firstLine.toUpperCase() === "LIST TABLES") {
      const db = getDB();
      return {
        success: true,
        tables: db.listTables(),
      };
    }

    // DROP TABLE command
    if (firstLine.toUpperCase().startsWith("DROP TABLE ")) {
      const tableName = firstLine.substring(11).trim();
      const db = getDB();
      const result = db.dropTable(tableName);

      return {
        success: true,
        ...result,
      };
    }

    // INSERT INTO command
    if (firstLine.toUpperCase().startsWith("INSERT INTO ")) {
      const [, , table] = firstLine.split(/\s+/);
      const jsonBlock = lines.slice(1).join(" ").trim();

      // Handle case where object is on same line
      const objectStart = firstLine.indexOf("{");
      let record;
      if (objectStart > -1) {
        record = parseObject(
          firstLine.substring(objectStart) + lines.slice(1).join(" ")
        );
      } else {
        record = parseObject(jsonBlock);
      }

      const db = getDB();
      const result = db.insert(table, record);

      return {
        success: true,
        message: `Inserted into ${table}`,
        ...result,
      };
    }

    // FIND FROM command
    if (firstLine.toUpperCase().startsWith("FIND FROM ")) {
      const [_, tablePart] = firstLine.split(/FIND FROM\s+/i);

      let table, wherePart;
      if (tablePart.toUpperCase().includes(" WHERE ")) {
        [table, wherePart] = tablePart.split(/\s+WHERE\s+/i);
      } else {
        table = tablePart;
      }

      const db = getDB();
      const records = wherePart
        ? db.find(table.trim(), parseWhereClause(wherePart))
        : db.find(table.trim());

      return {
        success: true,
        count: records.length,
        data: records,
      };
    }

    // COUNT FROM command
    if (firstLine.toUpperCase().startsWith("COUNT FROM ")) {
      const [_, tablePart] = firstLine.split(/COUNT FROM\s+/i);

      let table, wherePart;
      if (tablePart.toUpperCase().includes(" WHERE ")) {
        [table, wherePart] = tablePart.split(/\s+WHERE\s+/i);
      } else {
        table = tablePart;
      }

      const db = getDB();
      const count = wherePart
        ? db.count(table.trim(), parseWhereClause(wherePart))
        : db.count(table.trim());

      return {
        success: true,
        table: table.trim(),
        count,
      };
    }

    // DELETE FROM command
    if (firstLine.toUpperCase().startsWith("DELETE FROM ")) {
      const [_, tablePart] = firstLine.split(/DELETE FROM\s+/i);

      let table, wherePart;
      if (tablePart.toUpperCase().includes(" WHERE ")) {
        [table, wherePart] = tablePart.split(/\s+WHERE\s+/i);
      } else {
        throw new Error("DELETE requires a WHERE clause");
      }

      const db = getDB();
      const result = db.delete(table.trim(), parseWhereClause(wherePart));

      return {
        success: true,
        message: `Deleted from ${table}`,
        ...result,
      };
    }

    // UPDATE command
    // UPDATE command
    if (firstLine.toUpperCase().startsWith("UPDATE ")) {
      const [, rest] = firstLine.split(/UPDATE\s+/i);

      let table, whereClause;
      if (rest.toUpperCase().includes(" WHERE ")) {
        [table, whereClause] = rest.split(/\s+WHERE\s+/i);
      } else {
        throw new Error("UPDATE requires a WHERE clause");
      }

      // Find SET clause - can be on same line or next line
      let updatesLine = lines.find((l) => l.toUpperCase().startsWith("SET "));
      if (!updatesLine) {
        // Check if SET is part of the first line
        const setIndex = firstLine.toUpperCase().indexOf(" SET ");
        if (setIndex > -1) {
          updatesLine = firstLine.substring(setIndex);
        } else {
          throw new Error("UPDATE requires a SET clause");
        }
      }

      const updatesBlock = updatesLine.substring(4).trim();
      const updates = parseObject(updatesBlock);

      const db = getDB();
      const result = db.update(
        table.trim(),
        parseWhereClause(whereClause),
        updates
      );

      return {
        success: true,
        message: `Updated ${table}`,
        ...result,
      };
    }

    // HELP command
    if (firstLine.toUpperCase() === "HELP") {
      return {
        success: true,
        message: "Use 'SYNTAX' command to see full syntax documentation",
      };
    }

    // SYNTAX command
    if (firstLine.toUpperCase() === "SYNTAX") {
      return {
        success: true,
        syntax: [
          "USE <path>                    - Select database file",
          "DATABASE INFO                 - Show database information",
          "LIST TABLES                   - List all tables",
          "DROP TABLE <table>            - Delete a table",
          "INSERT INTO <table>           - Insert a record",
          "{ key: value }                - Record to insert",
          "FIND FROM <table>             - Find all records",
          "FIND FROM <table> WHERE <cond> - Find records with condition",
          "COUNT FROM <table>            - Count records",
          "COUNT FROM <table> WHERE <cond> - Count records with condition",
          "DELETE FROM <table> WHERE <cond> - Delete records",
          "UPDATE <table> WHERE <cond>   - Update records",
          "SET { key: value }            - Values to update",
          "HELP                          - Show help",
          "SYNTAX                        - Show syntax",
          "EXIT                          - Exit CLI",
        ],
      };
    }

    return {
      success: false,
      error: "Unknown command. Type 'SYNTAX' for help.",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
