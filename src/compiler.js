// compiler.js
const fs = require("fs");
const path = require("path");
const AnixParser = require("./parser");
const { copyPublicAssets } = require("./fileHandler");

const viewsPath = path.join(__dirname, "..", "views");
const distPath = path.join(__dirname, "..", "dist");

function buildPage(inputFile, outputFile) {
  const parser = new AnixParser(viewsPath);
  const htmlContent = parser.parseFile(inputFile);

  const finalHtml = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${path.basename(outputFile, ".html")}</title>
      <link rel="stylesheet" href="./assets/css/style.css" />
      <link rel="stylesheet" href="./assets/css/shorthand.css" />
    </head>
    <body>
      ${htmlContent}
      <script src="./assets/js/app.js"></script>
    </body>
  </html>`.trim();

  if (!fs.existsSync(distPath)) fs.mkdirSync(distPath);
  fs.writeFileSync(path.join(distPath, outputFile), finalHtml);

  console.log(`✅ ${outputFile} built in dist/`);
}

function build() {
  const parser = new AnixParser(viewsPath);
  const allFiles = fs.readdirSync(viewsPath).filter((f) => f.endsWith(".anix"));

  // Step 1: Collect all include targets
  const includedFiles = new Set();

  for (const file of allFiles) {
    const content = fs.readFileSync(path.join(viewsPath, file), "utf-8");
    let match;
    while ((match = parser.includeRegex.exec(content)) !== null) {
      includedFiles.add(match[1]);
    }
  }

  // Step 2: Build only non-included .anix files
  allFiles.forEach((file) => {
    // If it's the main file, we skip it since it's special and should be handled as index.html
    if (file === "index.anix" || !includedFiles.has(file)) {
      const outputFile =
        file === "index.anix" ? "index.html" : file.replace(".anix", ".html");
      buildPage(file, outputFile);
    }
  });

  copyPublicAssets();
}

build();
