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

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// const parser = new AnixParser(viewsPath);
const errorLog = chalk.bold.red;
const successLog = chalk.green;
const warnLog = chalk.yellow;
const infoLog = chalk.cyan;

// Track connected clients
let connectedClients = 0;

app.use("/assets", express.static(assetsPath));

// Parse anix file and return HTML
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
       
      </body>
    </html>`;
  } catch (error) {
    console.error(errorLog(`\n🚨 Error parsing ${filename}:`));
    console.error(errorLog(error.stack));

    return `
<!DOCTYPE html>
<html>
  <head>
    <title>Anix Build Error</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body { 
        margin: 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        overflow: hidden;
      }
      
      .error-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        background: rgba(15, 23, 42, 0.85);
        color: #f8fafc;
        line-height: 1.6;
        padding: 1rem;
        z-index: 999999;
        overflow-y: auto;
        animation: fadeIn 0.3s ease-out;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .error-container {
        max-width: 700px;
        margin: 1rem auto;
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 
          0 20px 25px -5px rgba(0, 0, 0, 0.1),
          0 10px 10px -5px rgba(0, 0, 0, 0.04),
          0 0 0 1px rgba(255, 255, 255, 0.05);
        animation: slideUp 0.4s ease-out 0.1s both;
      }
      
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(40px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .error-header {
        display: flex;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      }
      
      .error-icon {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 0.75rem;
        box-shadow: 0 4px 12px -4px rgba(239, 68, 68, 0.4);
      }
      
      .error-icon svg {
        width: 16px;
        height: 16px;
        stroke: white;
        stroke-width: 2;
      }
      
      .error-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #f8fafc;
        margin: 0;
        letter-spacing: -0.025em;
      }
      
      .error-subtitle {
        font-size: 0.875rem;
        color: #94a3b8;
        margin-top: 0.125rem;
        font-weight: 400;
      }
      
      .error-message {
        font-size: 0.95rem;
        color: #fecaca;
        background: rgba(239, 68, 68, 0.1);
        padding: 1rem;
        border-radius: 12px;
        border: 1px solid rgba(239, 68, 68, 0.2);
        margin-bottom: 1.25rem;
        font-weight: 500;
        line-height: 1.5;
      }
      
      .error-stack-container {
        position: relative;
      }
      
      .error-stack-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }
      
      .error-stack-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: #cbd5e1;
        display: flex;
        align-items: center;
      }
      
      .error-stack-title svg {
        width: 14px;
        height: 14px;
        margin-right: 0.5rem;
        stroke: currentColor;
      }
      
      .copy-button {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #60a5fa;
        padding: 0.375rem 0.75rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }
      
      .copy-button:hover {
        background: rgba(59, 130, 246, 0.2);
        transform: translateY(-1px);
      }
      
      .copy-button svg {
        width: 12px;
        height: 12px;
        stroke: currentColor;
      }
      
      .error-stack {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(51, 65, 85, 0.4);
        padding: 1rem;
        border-radius: 12px;
        font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
        font-size: 0.8rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: #e2e8f0;
        overflow-x: auto;
        max-height: 300px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
      }
      
      .error-stack::-webkit-scrollbar {
        width: 8px;
      }
      
      .error-stack::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .error-stack::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.3);
        border-radius: 4px;
      }
      
      .error-stack::-webkit-scrollbar-thumb:hover {
        background: rgba(148, 163, 184, 0.5);
      }
      
      .footer-note {
        margin-top: 1.25rem;
        padding: 1rem;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: 12px;
        color: #86efac;
        font-style: normal;
        font-weight: 500;
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .footer-note svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        flex-shrink: 0;
      }
      
      .pulse-dot {
        width: 6px;
        height: 6px;
        background: #22c55e;
        border-radius: 50%;
        margin-right: 0.375rem;
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      .keyboard-hint {
        margin-top: 1rem;
        padding: 0.75rem;
        background: rgba(148, 163, 184, 0.1);
        border-radius: 8px;
        font-size: 0.8rem;
        color: #94a3b8;
        text-align: center;
        font-weight: 500;
      }
      
      .keyboard-hint kbd {
        background: rgba(51, 65, 85, 0.8);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 4px;
        padding: 0.2rem 0.4rem;
        font-family: inherit;
        font-size: 0.7rem;
        font-weight: 600;
        color: #f1f5f9;
        margin: 0 0.2rem;
      }
      
      @media (max-width: 768px) {
        .error-overlay {
          padding: 0.75rem;
        }
        
        .error-container {
          margin: 0.5rem auto;
          padding: 1.25rem;
          border-radius: 16px;
        }
        
        .error-title {
          font-size: 1.125rem;
        }
        
        .error-message {
          font-size: 0.875rem;
          padding: 0.875rem;
        }
        
        .error-stack {
          font-size: 0.75rem;
          padding: 0.875rem;
        }
      }
    </style>
    <script src="/socket.io/socket.io.js"></script>
    <script>
      const socket = io();
      socket.on('fileChanged', () => window.location.reload());

      // error logging
      const error = ${JSON.stringify({
        message: error.message,
        stack: error.stack,
      })};
      console.error(\`Anix Parse Error: \${error.message}\`);
      console.error(error.stack);
      
      // Copy to clipboard functionality
      function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
          const button = document.querySelector('.copy-button');
          const originalText = button.innerHTML;
          button.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Copied!';
          setTimeout(() => {
            button.innerHTML = originalText;
          }, 2000);
        });
      }
    </script>
  </head>
  <body>
    <div class="error-overlay">
      <div class="error-container">
        <div class="error-header">
          <div class="error-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
          </div>
          <div>
            <h1 class="error-title">Build Failed</h1>
            <p class="error-subtitle">Anix compilation error</p>
          </div>
        </div>
        
        <div class="error-message">${error.message}</div>
        
        <div class="error-stack-container">
          <div class="error-stack-header">
            <div class="error-stack-title">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m-4 4l-4 4 4 4m8-8l4 4-4 4"/>
              </svg>
              Stack Trace
            </div>
            <button class="copy-button" onclick="copyToClipboard(\`${error.stack.replace(
              /`/g,
              "\\`"
            )}\`)">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
              </svg>
              Copy
            </button>
          </div>
          <pre class="error-stack">${error.stack}</pre>
        </div>
        
        <div class="footer-note">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <div>
            <div class="pulse-dot"></div>
            Watching for changes... Fix the error and save to reload automatically.
          </div>
        </div>
        
        <div class="keyboard-hint">
          Press <kbd>Ctrl</kbd> + <kbd>C</kbd> in terminal to stop the dev server
        </div>
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

  console.log(chalk.cyan(anixLogo));

  console.log(serverInfo);
  console.log(warnLog("Watching for file changes... Press Ctrl+C to stop."));

  setupWatcher();
});
