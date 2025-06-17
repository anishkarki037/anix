const fs = require("fs");
const path = require("path");

function copyPublicAssets() {
  const srcDir = path.join(__dirname, "..", "views", "assets");
  const destDir = path.join(__dirname, "..", "dist", "assets");

  if (!fs.existsSync(srcDir)) {
    console.log("⚠️ No public assets to copy.");
    return;
  }

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy all files from source assets to destination assets
  fs.readdirSync(srcDir).forEach((file) => {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);

    // Check if it's a directory
    if (fs.lstatSync(srcFile).isDirectory()) {
      // Create the directory in destination if needed
      if (!fs.existsSync(destFile)) {
        fs.mkdirSync(destFile, { recursive: true });
      }

      // Copy directory contents recursively
      copyDirectory(srcFile, destFile);
    } else {
      // Copy file
      fs.copyFileSync(srcFile, destFile);
    }
  });

  console.log("✅ Public assets folder copied to dist/assets/");
}

// Helper function to copy directories recursively
function copyDirectory(src, dest) {
  fs.readdirSync(src).forEach((file) => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);

    if (fs.lstatSync(srcFile).isDirectory()) {
      // Create the directory in destination if needed
      if (!fs.existsSync(destFile)) {
        fs.mkdirSync(destFile, { recursive: true });
      }

      // Recursive call for subdirectories
      copyDirectory(srcFile, destFile);
    } else {
      // Copy file
      fs.copyFileSync(srcFile, destFile);
    }
  });
}

module.exports = { copyPublicAssets };
