# Astpoint Database

Astpoint is a lightweight, file-based database system designed for rapid prototyping and integration with the Anix framework. It provides simple data storage and retrieval for small to medium-sized projects, making it ideal for web apps, prototypes, and educational purposes.

## Features

- File-based storage (no external DB required)
- Easy integration with Anix backend
- Simple API for CRUD operations
- Supports JSON data format
- CLI and server utilities for management

## Setup

1. Ensure Node.js is installed.
2. Navigate to the `views/backend/astpoint` directory.
3. Install dependencies (if any):
   ```bash
   npm install
   ```
4. Run the Astpoint server or CLI as needed:
   ```bash
   node astpoint-server.js
   # or
   node astpoint-cli.js
   ```

## Usage Example

- Store data:
  ```js
  // Example usage in Node.js
  const db = require("./astpoint");
  db.save("users", { id: 1, name: "Alice" });
  ```
- Retrieve data:
  ```js
  const users = db.get("users");
  ```

## File Structure

- `astpoint.js` - Core database logic
- `astpoint-server.js` - REST API server
- `astpoint-cli.js` - Command-line interface
- `data/` - Data storage directory

## License

MIT
