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

  // Generate SEO tags from the parsed data
  const seoTags = Object.entries(parser.seoData)
    .map(([key, value]) => {
      if (key.startsWith("og:")) {
        return `<meta property="${key}" content="${value}" />`;
      }
      return `<meta name="${key}" content="${value}" />`;
    })
    .join("\n      ");

  const finalHtml = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${parser.pageName || path.basename(inputFile, ".anix")}</title>
      ${seoTags}
      <link rel="stylesheet" href="./assets/css/style.css" />
      <link rel="stylesheet" href="./assets/css/shorthand.css" />
      <link rel="icon" type="image/x-icon" href="./favicon.ico">
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

  // Step 1: Collect all include and import targets
  const nonPageFiles = new Set();
  const includeRegex = /include\s+(["'])(.+?)\1;/g;
  const importRegex = /^import\s+(['"])(.+?)\1;/gm;

  for (const file of allFiles) {
    const content = fs.readFileSync(path.join(viewsPath, file), "utf-8");
    let match;

    // Find all included files
    while ((match = includeRegex.exec(content)) !== null) {
      nonPageFiles.add(match[2]);
    }
    // Find all imported component files
    while ((match = importRegex.exec(content)) !== null) {
      nonPageFiles.add(match[2]);
    }
  }

  // Step 2: Build only non-included and non-imported .anix files
  allFiles.forEach((file) => {
    // If a file is in the nonPageFiles set, it's a partial/component, so we skip it.
    // The main index.anix is always built.
    if (file === "index.anix" || !nonPageFiles.has(file)) {
      const outputFile = file.replace(".anix", ".html");
      const outputDir = path.dirname(path.join(distPath, outputFile));

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      buildPage(file, outputFile);
    }
  });

  copyPublicAssets();
}

build();
