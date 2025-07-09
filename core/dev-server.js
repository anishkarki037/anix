// dev-server.js
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const { Server } = require("socket.io");
const chalk = require("chalk");
const AnixParser = require("./parser");
const gradient = require("gradient-string");
const os = require("os");
// Setup paths
const PORT = process.env.PORT || 3000;
const viewsPath = path.join(__dirname, "..", "views");
const assetsPath = path.join(viewsPath, "assets");

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Setup parser
// const parser = new AnixParser(viewsPath);
const errorLog = chalk.bold.red;
const successLog = chalk.green;
const warnLog = chalk.yellow;
const infoLog = chalk.cyan;

// Track connected clients
let connectedClients = 0;

// Middleware to serve static files from the assets folder inside views
app.use("/assets", express.static(assetsPath));

// Parse Anix file and return HTML
function parseAnixFile(filename) {
  const parser = new AnixParser(viewsPath); // <-- ADD THIS LINE
  try {
    const htmlContent = parser.parseFile(filename);

    // Generate SEO tags from the parsed data
    const seoTags = Object.entries(parser.seoData)
      .map(([key, value]) => {
        if (key.startsWith("og:")) {
          return `<meta property="${key}" content="${value}" />`;
        }
        return `<meta name="${key}" content="${value}" />`;
      })
      .join("\n        ");

    // Create a complete HTML document with live reload script
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${parser.pageName || path.basename(filename, ".anix")}</title>
        ${seoTags}
        <link rel="stylesheet" href="./assets/css/style.css" />
        <link rel="stylesheet" href="./assets/css/shorthand.css" />
        <link rel="icon" type="image/x-icon" href="./favicon.ico">
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
    // Log the error to the server console with color
    console.error(errorLog(`\n🚨 Error parsing ${filename}:`));
    console.error(errorLog(error.stack));
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Anix Build Error</title>
        <style>
          body { margin: 0; }
          .error-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 20, 30, 0.95);
            color: #e8e8e8;
            font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
            line-height: 1.6;
            padding: 2rem;
            box-sizing: border-box;
            z-index: 999999;
            overflow-y: auto;
          }
          .error-container {
            max-width: 800px;
            margin: 0 auto;
          }
          .error-title {
            font-size: 1.5rem;
            color: #ff5555;
            border-bottom: 2px solid #ff5555;
            padding-bottom: 0.5rem;
            margin-bottom: 1rem;
          }
          .error-message {
            font-size: 1.1rem;
            color: #ffb8b8;
          }
          .error-stack {
            background: rgba(0, 0, 0, 0.3);
            padding: 1rem;
            border-radius: 6px;
            font-size: 0.9rem;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-top: 1.5rem;
          }
          .footer-note {
            margin-top: 2rem;
            color: #888;
            font-style: italic;
          }
        </style>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          const socket = io();
          socket.on('fileChanged', () => window.location.reload());

          // NEW: Also log the error to the browser console
          const error = ${JSON.stringify({
            message: error.message,
            stack: error.stack,
          })};
          console.error(\`Anix Parse Error: \${error.message}\`);
          console.error(error.stack);
        </script>
      </head>
      <body>
        <div class="error-overlay">
          <div class="error-container">
            <h1 class="error-title">Failed to Compile</h1>
            <p class="error-message">${error.message}</p>
            <pre class="error-stack">${error.stack}</pre>
            <p class="footer-note">Fix the error in your editor and save the file to reload.</p>
          </div>
        </div>
      </body>
    </html>`;
  }
}

// Main route handler
app.get("/", (req, res) => {
  res.send(parseAnixFile("index.anix"));
});

// Handle other pages
// app.get("/:page", (req, res) => {
//   const pageName = req.params.page;
//   const pageFile = pageName.endsWith(".html")
//     ? pageName.replace(".html", ".anix")
//     : `${pageName}.anix`;

//   // Check if the file exists
//   const filePath = path.join(viewsPath, pageFile);
//   if (fs.existsSync(filePath)) {
//     res.send(parseAnixFile(pageFile));
//   } else {
//     res.status(404).send(`
//     <!DOCTYPE html>
//     <html>
//       <head>
//         <title>Page Not Found</title>
//         <style>
//           body { font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.5; }
//           .error { background: #ffebee; border-left: 4px solid #f44336; padding: 1rem; }
//         </style>
//       </head>
//       <body>
//         <h1>404 - Page Not Found</h1>
//         <div class="error">
//           <p>The file "${pageFile}" does not exist in the views directory.</p>
//         </div>
//       </body>
//     </html>`);
//   }
// });

app.get("*", (req, res) => {
  let pageFile = req.path;

  // If root, serve index.anix
  if (pageFile === "/") {
    pageFile = "index.anix";
  } else {
    // Remove leading slash
    pageFile = pageFile.substring(1);

    // Handle requests for .html files or extensionless URLs
    if (pageFile.endsWith(".html")) {
      pageFile = pageFile.replace(".html", ".anix");
    } else if (!path.extname(pageFile)) {
      // This handles clean URLs like /about by trying to find /about.anix
      pageFile = `${pageFile}.anix`;
    }
  }

  const filePath = path.join(viewsPath, pageFile);

  if (fs.existsSync(filePath)) {
    res.send(parseAnixFile(pageFile));
  } else {
    // A more generic 404 message
    res.status(404).send(`
      <!DOCTYPE html><html><head><title>Page Not Found</title></head>
      <body><h1>404 - Page Not Found</h1><p>The file "${pageFile}" could not be found.</p></body></html>
    `);
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
// Helper function to get the local network IP
function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      const { address, family, internal } = iface;
      if (family === "IPv4" && !internal) {
        return address;
      }
    }
  }
  return "N/A";
}

// Start server
server.listen(PORT, () => {
  const localURL = `http://localhost:${PORT}`;
  const networkURL = `http://${getLocalNetworkIP()}:${PORT}`;

  const anixLogo = `
  █████╗ ███╗   ██╗██╗██╗  ██╗
 ██╔══██╗████╗  ██║██║╚██╗██╔╝
 ███████║██╔██╗ ██║██║ ╚███╔╝ 
 ██╔══██║██║╚██╗██║██║ ██╔██╗ 
 ██║  ██║██║ ╚████║██║██╔╝ ██╗
 ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝

  `;

  const serverInfo = `
    ${chalk.bold("Anix Dev Server")}

    ${chalk.cyan("Local:")}   ${localURL}
    ${chalk.cyan("Network:")} ${networkURL}
  `;

  // Use chalk.cyan for a light blue color instead of the gradient
  console.log(chalk.cyan(anixLogo));

  console.log(serverInfo);
  console.log(warnLog("Watching for file changes... Press Ctrl+C to stop."));

  setupWatcher();
});
