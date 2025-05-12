// dev-server.js
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const { Server } = require("socket.io");
const AnixParser = require("./parser");

// Setup paths
const PORT = process.env.PORT || 3000;
const viewsPath = path.join(__dirname, "..", "views");
const assetsPath = path.join(viewsPath, "assets");

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Setup parser
const parser = new AnixParser(viewsPath);

// Track connected clients
let connectedClients = 0;

// Middleware to serve static files from the assets folder inside views
app.use("/assets", express.static(assetsPath));

// Parse Anix file and return HTML
function parseAnixFile(filename) {
  try {
    const htmlContent = parser.parseFile(filename);

    // Create a complete HTML document with live reload script
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${path.basename(filename, ".anix")}</title>
        <link rel="stylesheet" href="./assets/css/style.css" />
        <link rel="stylesheet" href="./assets/css/shorthand.css" />
        <script src="/socket.io/socket.io.js"></script>
        <script>
          // Live reload script
          const socket = io();
          socket.on('fileChanged', (data) => {
            console.log('File changed:', data.file);
            if (data.shouldReload) {
              window.location.reload();
            }
          });
        </script>
      </head>
      <body>
        ${htmlContent}
        <script src="./assets/js/app.js"></script>
        <script src="./assets/js/templates.js"></script>
      </body>
    </html>`;
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error);
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Error</title>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          const socket = io();
          socket.on('fileChanged', () => window.location.reload());
        </script>
        <style>
          body { font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.5; }
          .error { background: #ffebee; border-left: 4px solid #f44336; padding: 1rem; }
          pre { background: #f5f5f5; padding: 1rem; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>Error Parsing Anix File</h1>
        <div class="error">
          <p><strong>${error.message}</strong></p>
          <pre>${error.stack}</pre>
        </div>
        <p>Fix the error and save the file to reload.</p>
      </body>
    </html>`;
  }
}

// Main route handler
app.get("/", (req, res) => {
  res.send(parseAnixFile("index.anix"));
});

// Handle other pages
app.get("/:page", (req, res) => {
  const pageName = req.params.page;
  const pageFile = pageName.endsWith(".html")
    ? pageName.replace(".html", ".anix")
    : `${pageName}.anix`;

  // Check if the file exists
  const filePath = path.join(viewsPath, pageFile);
  if (fs.existsSync(filePath)) {
    res.send(parseAnixFile(pageFile));
  } else {
    res.status(404).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Page Not Found</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.5; }
          .error { background: #ffebee; border-left: 4px solid #f44336; padding: 1rem; }
        </style>
      </head>
      <body>
        <h1>404 - Page Not Found</h1>
        <div class="error">
          <p>The file "${pageFile}" does not exist in the views directory.</p>
        </div>
      </body>
    </html>`);
  }
});

// Socket connection
io.on("connection", (socket) => {
  connectedClients++;
  console.log(`Client connected. Total clients: ${connectedClients}`);

  socket.on("disconnect", () => {
    connectedClients--;
    console.log(`Client disconnected. Total clients: ${connectedClients}`);
  });
});

// File watcher
function setupWatcher() {
  // Watch .anix files and assets
  const watcher = chokidar.watch(
    [path.join(viewsPath, "**/*.anix"), path.join(assetsPath, "**/*")],
    {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
    }
  );

  // File change events
  watcher.on("change", (filePath) => {
    console.log(`File changed: ${filePath}`);

    // Determine if we need to reload the page
    const shouldReload = true;
    const relativePath = path.relative(path.join(__dirname, ".."), filePath);

    // Notify connected clients
    io.emit("fileChanged", {
      file: relativePath,
      shouldReload,
    });
  });

  console.log("Watching for file changes...");
}

// Start server
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║                                            ║
  ║   🚀 Anix Dev Server Running               ║
  ║   http://localhost:${PORT}                   ║
  ║                                            ║
  ║   Press Ctrl+C to stop                     ║
  ║                                            ║
  ╚════════════════════════════════════════════╝
  `);

  setupWatcher();
});
