// astpoint-cli.js - Command Line Interface
import readline from "node:readline";
import runQuery from "./astpoint/queryParser.js";

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

// Helper functions for color formatting
const colorize = {
  cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  red: (text) => `${colors.red}${text}${colors.reset}`,
  blue: (text) => `${colors.blue}${text}${colors.reset}`,
  bold: {
    blue: (text) => `${colors.bright}${colors.blue}${text}${colors.reset}`,
  },
};

// ASCII art banner
const banner = `
============================================================================
||                                                                          ||
||                                                                          ||
||   █████╗ ███████╗████████╗██████╗  ██████╗ ██╗███╗   ██╗████████╗        ||
||  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗██║████╗  ██║╚══██╔══╝▄ ██╗▄  ||
||  ███████║███████╗   ██║   ██████╔╝██║   ██║██║██╔██╗ ██║   ██║    ████╗  ||
||  ██╔══██║╚════██║   ██║   ██╔═══╝ ██║   ██║██║██║╚██╗██║   ██║   ▀╚██╔▀  ||
||  ██║  ██║███████║   ██║   ██║     ╚██████╔╝██║██║ ╚████║   ██║     ╚═╝   ||
||  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝      ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝           ||
||                                                                          ||
||                                                                          ||
=============================================================================
`;

console.log(colorize.cyan(banner));
console.log(colorize.green("🟢 Astpoint DB CLI v1.0.0 — Type queries below."));
console.log(
  colorize.yellow("Type 'SYNTAX' for command help or 'EXIT' to quit.\n")
);
console.log(
  colorize.yellow(
    "Multiline inputs are automatically converted to single line commands.\n"
  )
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: colorize.bold.blue("Astpoint > "),
});

rl.prompt();
let buffer = "";
let multilineMode = false;
let bracketCount = 0;

// Convert multiline to single line while preserving content inside brackets
function convertMultilineToSingleLine(input) {
  let result = "";
  let insideBrackets = false;
  let insideQuotes = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // Handle escape sequences inside quotes
    if (insideQuotes && char === "\\") {
      escapeNext = true;
      result += char;
      continue;
    }

    // Handle quote boundaries
    if (char === '"' && !escapeNext) {
      insideQuotes = !insideQuotes;
    }

    // Reset escape flag
    escapeNext = false;

    // Handle bracket boundaries (only when not inside quotes)
    if (!insideQuotes) {
      if (char === "{") {
        insideBrackets = true;
      } else if (char === "}") {
        insideBrackets = false;
      }
    }

    // Handle newlines
    if (char === "\n" || char === "\r") {
      // Keep newlines inside brackets or quotes, replace with space otherwise
      if (insideBrackets || insideQuotes) {
        result += char;
      } else {
        result += " ";
      }
    } else {
      result += char;
    }
  }

  return result;
}

// Process all commands (split by delimiter if present)
function processCommands(input) {
  // First, convert multiline to single line (preserving JSON structure)
  const singleLineInput = convertMultilineToSingleLine(input);

  // Now split by the command separator '->'
  const commands = singleLineInput
    .split("->")
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd);

  // Process each command
  for (const cmd of commands) {
    try {
      const result = runQuery(cmd);
      console.log(colorize.green(`✅ Query executed successfully`));
      // Display results if any...
    } catch (err) {
      console.error(colorize.red(`❌ Error: ${err.message}`));
    }
  }
}

rl.on("line", (line) => {
  const trimmedLine = line.trim();

  // Handle exit command
  if (trimmedLine.toLowerCase() === "exit") {
    console.log(colorize.green("Goodbye! 👋"));
    return rl.close();
  }

  // Handle specially pasted multi-line content
  if (line.includes("\n")) {
    // This is content pasted with multiple lines - process directly
    processCommands(line);
    console.log(); // Add empty line for readability
    rl.prompt();
    return;
  }

  // Add the line to our buffer
  buffer += line + "\n";

  // Count brackets to track nested structures
  for (const char of line) {
    if (char === "{") bracketCount++;
    if (char === "}") bracketCount--;
  }

  // Determine if we should process the command(s)
  const shouldProcess = bracketCount === 0 && buffer.trim().length > 0;

  if (shouldProcess) {
    processCommands(buffer);

    // Reset for next command
    buffer = "";
    multilineMode = false;
    bracketCount = 0;
    console.log(); // Add empty line for readability
    rl.setPrompt(colorize.bold.blue("Astpoint > "));
    rl.prompt();
  } else {
    // Still in multiline mode
    multilineMode = true;
    rl.setPrompt(colorize.bold.blue("      ... > "));
    rl.prompt();
  }
});

// Handle pasted content with ctrl+v
process.stdin.on("data", (data) => {
  // Check if this is likely a paste event (contains newlines)
  if (data.toString().includes("\n") && !multilineMode) {
    // This is handled by the 'line' event above
  }
});

rl.on("close", () => {
  console.log(colorize.green("\nAstpoint DB CLI closed."));
  process.exit(0);
});

// Catch errors
process.on("uncaughtException", (err) => {
  console.error(colorize.red(`❌ Unexpected error: ${err.message}`));
  console.log(colorize.yellow("Please report this issue at GitHub."));
});
