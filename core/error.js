// error.js

class AnixError extends Error {
  constructor(message, filePath, lineNumber, lineContent) {
    const location = filePath ? ` in ${filePath}` : "";
    const lineInfo = lineNumber ? ` (line ${lineNumber})` : "";
    const contentInfo = lineContent ? `\n\n> ${lineContent.trim()}\n` : "";

    // Improved formatting for readability
    super(
      `Anix Parsing Error${lineInfo}${location}:\n${message}${contentInfo}`
    );
    this.name = "AnixError";
  }
}

module.exports = AnixError;
