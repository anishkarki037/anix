// compiler.js
const fs = require("fs");
const path = require("path");
const AnixParser = require("./parser");
const { copyPublicAssets } = require("./fileHandler");

const viewsPath = path.join(__dirname, "..", "views");
const distPath = path.join(__dirname, "..", "dist");

// Add this helper function at the top of compiler.js
function getAllAnixFiles(dirPath, relativeTo = dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(relativeTo, fullPath);
    if (entry.isDirectory()) {
      return getAllAnixFiles(fullPath, relativeTo);
    } else if (entry.isFile() && entry.name.endsWith(".anix")) {
      return [relativePath];
    }
    return [];
  });
  return files.map((file) => file.replace(/\\/g, "/")); // Normalize paths for consistency
}

function buildPage(inputFile, outputFile) {
  const parser = new AnixParser(viewsPath);
  const htmlContent = parser.parseFile(inputFile);

  const finalHtml = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${parser.pageName || path.basename(inputFile, ".anix")}</title>
      <link rel="stylesheet" href="./assets/css/style.css" />
      <link rel="stylesheet" href="./assets/css/shorthand.css" />
      <link rel="stylesheet" href="./assets/css/docs.css" />
    </head>
    <body>
      ${htmlContent}
      <script src="./assets/js/app.js"></script>
    </body>
  </html>`.trim();

  const outputPath = path.join(distPath, outputFile);
  const outputDir = path.dirname(outputPath);

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, finalHtml);

  console.log(`✅ ${outputFile} built in dist/`);
}

function build() {
  const parser = new AnixParser(viewsPath);
  const allFiles = getAllAnixFiles(viewsPath);

  // Step 1: Collect all include targets
  const includedFiles = new Set();

  for (const file of allFiles) {
    const content = fs.readFileSync(path.join(viewsPath, file), "utf-8"); //
    let match;
    while ((match = parser.includeRegex.exec(content)) !== null) {
      includedFiles.add(match[1]);
    }
  }

  // Step2: Build only non-included .anix files
  allFiles.forEach((file) => {
    // If it's the main file, we skip it since it's special and should be handled as index.html
    if (file === "index.anix" || !includedFiles.has(file)) {
      // Output path needs to handle subdirectories
      const outputFile = file.replace(".anix", ".html");
      const outputDir = path.dirname(path.join(distPath, outputFile));

      // Create subdirectory in dist if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      buildPage(file, outputFile);
    }
  });
  copyPublicAssets();
}

build();
