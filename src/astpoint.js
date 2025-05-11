// astpoint.js - Export the Astpoint class for server use
const fs = require("fs");
const path = require("path");

class Astpoint {
  constructor(filePath) {
    this.filePath = filePath.endsWith(".ast") ? filePath : filePath + ".ast";
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "");
    }
  }

  _parse() {
    try {
      const content = fs.readFileSync(this.filePath, "utf-8");
      const tables = {};
      const lines = content.split("\n");

      let currentTable = null;
      let record = {};

      for (let line of lines.map((l) => l.trim())) {
        if (!line) continue; // Skip empty lines

        if (line.startsWith("@") && !line.startsWith("@end")) {
          currentTable = line.slice(1);
          tables[currentTable] = tables[currentTable] || [];
        } else if (line === "---") {
          if (currentTable && Object.keys(record).length > 0) {
            tables[currentTable].push({ ...record });
            record = {};
          }
        } else if (line === "@end") {
          // Ensure we add the last record if there's no trailing '---'
          if (currentTable && Object.keys(record).length > 0) {
            tables[currentTable].push({ ...record });
            record = {};
          }
          currentTable = null;
        } else if (line.includes(":") && currentTable) {
          const colonIndex = line.indexOf(":");
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();

          // Handle quoted and unquoted values
          record[key] =
            value.startsWith('"') && value.endsWith('"')
              ? value.slice(1, -1)
              : value;
        }
      }

      return tables;
    } catch (error) {
      throw new Error(`Failed to parse database: ${error.message}`);
    }
  }

  _stringify(tables) {
    try {
      let output = "";
      for (const [table, records] of Object.entries(tables)) {
        if (records.length === 0) continue;

        output += `@${table}\n`;
        for (const record of records) {
          for (const [key, value] of Object.entries(record)) {
            // Always quote values for consistency
            output += `${key}: "${String(value).replace(/"/g, '\\"')}"\n`;
          }
          output += "---\n";
        }
        output += "@end\n\n";
      }
      return output.trim();
    } catch (error) {
      throw new Error(`Failed to stringify database: ${error.message}`);
    }
  }

  insert(table, record) {
    try {
      const tables = this._parse();
      tables[table] = tables[table] || [];
      tables[table].push(record);
      fs.writeFileSync(this.filePath, this._stringify(tables));
      return { inserted: 1, table };
    } catch (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }
  }

  find(table, where = () => true) {
    try {
      const tables = this._parse();
      if (!tables[table]) {
        return [];
      }
      return (tables[table] || []).filter(where);
    } catch (error) {
      throw new Error(`Find failed: ${error.message}`);
    }
  }

  update(table, whereFn, updates) {
    try {
      const tables = this._parse();
      if (!tables[table]) {
        return { updated: 0, table };
      }

      let updatedCount = 0;
      tables[table] = (tables[table] || []).map((r) => {
        if (whereFn(r)) {
          updatedCount++;
          return { ...r, ...updates };
        }
        return r;
      });

      fs.writeFileSync(this.filePath, this._stringify(tables));
      return { updated: updatedCount, table };
    } catch (error) {
      throw new Error(`Update failed: ${error.message}`);
    }
  }

  delete(table, whereFn) {
    try {
      const tables = this._parse();
      if (!tables[table]) {
        return { deleted: 0, table };
      }

      const originalLength = tables[table].length;
      tables[table] = (tables[table] || []).filter((r) => !whereFn(r));
      const deletedCount = originalLength - tables[table].length;

      fs.writeFileSync(this.filePath, this._stringify(tables));
      return { deleted: deletedCount, table };
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  listTables() {
    const tables = this._parse();
    return Object.keys(tables);
  }

  dropTable(table) {
    try {
      const tables = this._parse();
      if (tables[table]) {
        delete tables[table];
        fs.writeFileSync(this.filePath, this._stringify(tables));
        return { dropped: true, table };
      }
      return { dropped: false, table };
    } catch (error) {
      throw new Error(`Drop table failed: ${error.message}`);
    }
  }

  count(table, where = () => true) {
    try {
      const records = this.find(table, where);
      return records.length;
    } catch (error) {
      throw new Error(`Count failed: ${error.message}`);
    }
  }
}

module.exports = { Astpoint };
