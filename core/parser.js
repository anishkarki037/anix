// parser.js
const fs = require("fs");
const path = require("path");

// A custom error class for more detailed and readable parser errors.
class AnixError extends Error {
  constructor(message, filePath, lineNumber, lineContent) {
    const location = filePath ? ` in ${filePath}` : "";
    const lineInfo = lineNumber ? ` on line ${lineNumber}` : "";
    const contentInfo = lineContent ? `\n\n> ${lineContent.trim()}\n` : "";
    super(`Anix Parser Error${location}${lineInfo}: ${message}${contentInfo}`);
    this.name = "AnixError";
  }
}

class AnixParser {
  constructor(viewsPath) {
    this.viewsPath = viewsPath;
    this.components = {};
    this.variables = {};
    this.loops = [];

    // Parsing state for error reporting and context
    this.currentFile = null;
    this.currentLineNumber = 0;

    // Regex patterns
    this.includeRegex = /include\s+(["'])(.+?)\1;/g;
    this.importRegex = /^import\s+(["'])(.+?)\1\s*;?/;
    this.commentRegex = /^\s*(\/\/|#|###)/;

    // State for parsing
    this.openBlocks = []; // stack to track open tags
    this.insideMultilineScript = false;
    this.scriptContent = "";
    this.pageName = null;

    this.insideMultilineScript = false;
    this.scriptContent = "";
    this.scriptBlockDepth = 0; // Add this line
    // NEW: State for multiline variable assignments
    this.insideMultilineAssignment = false;
    this.multilineVarName = "";
    this.multilineContent = "";
    this.multilineBraceDepth = 0;
    this.multilineBracketDepth = 0;

    this.insidePreBlock = false;
    this.preBlockDepth = 0;
    this.preContent = [];
    this.preAttrs = "";
    // --- NEW: SEO data storage ---
    this.seoData = {};

    // Void (self-closing) HTML tags
    this.voidTags = [
      "input",
      "img",
      "br",
      "hr",
      "meta",
      "link",
      "source",
      "area",
      "base",
      "col",
      "embed",
      "keygen",
      "param",
      "track",
      "wbr",
    ];

    // Custom Anix JavaScript commands
    this.jsCommands = {
      "js:click": "addEventListener('click', function(event) {",
      "js:hover": "addEventListener('mouseover', function(event) {",
      "js:leave": "addEventListener('mouseout', function(event) {",
      "js:submit":
        "addEventListener('submit', function(event) { event.preventDefault(); ",
      "js:change": "addEventListener('change', function(event) {",
      "js:keyup": "addEventListener('keyup', function(event) {",
      "js:load": "addEventListener('DOMContentLoaded', function() {",
      "js:ajax": "fetch",
      "js:get": "document.querySelector",
      "js:getAll": "document.querySelectorAll",
      "js:toggle": "classList.toggle",
      "js:addClass": "classList.add",
      "js:removeClass": "classList.remove",
      "js:wait": "setTimeout(function() {",
    };
  }

  // Helper to throw consistent, detailed errors.
  throwError(message, lineContent) {
    throw new AnixError(
      message,
      this.currentFile,
      this.currentLineNumber,
      lineContent
    );
  }

  // --- NEW: Method to load and parse a component file ---
  loadComponentsFromFile(componentPath) {
    const fullPath = path.join(this.viewsPath, componentPath);
    if (!fs.existsSync(fullPath)) {
      this.throwError(`Component file not found: ${componentPath}`);
    }

    // Temporarily set context for potential errors during component loading
    const previousFile = this.currentFile;
    this.currentFile = fullPath;
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    let inComponent = false;
    let currentComponent = null;
    let bodyLines = [];
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      this.currentLineNumber = i + 1;
      if (!inComponent) {
        const match = line.match(/^component\s+([\w-]+)\s*\(([^)]*)\)\s*\{/);
        if (match) {
          inComponent = true;
          const [, name, props] = match;
          currentComponent = {
            name,
            props: props ? props.split(",").map((p) => p.trim()) : [],
            body: "",
          };
          braceDepth = (line.match(/\{/g) || []).length;
        }
      } else {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;

        if (braceDepth <= 0) {
          const closingBraceIndex = line.lastIndexOf("}");
          bodyLines.push(line.substring(0, closingBraceIndex));
          currentComponent.body = bodyLines.join("\n").trim();
          this.components[currentComponent.name] = currentComponent;

          inComponent = false;
          currentComponent = null;
          bodyLines = [];
          braceDepth = 0;
        } else {
          bodyLines.push(line);
        }
      }
    }
    this.currentFile = previousFile; // Restore context
  }
  parseJsArguments(argsString) {
    const args = [];
    let current = "";
    let insideString = false;
    let stringChar = null;
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (!insideString) {
        if (char === '"' || char === "'") {
          insideString = true;
          stringChar = char;
          current += char;
        } else if (char === "(") {
          parenDepth++;
          current += char;
        } else if (char === ")") {
          parenDepth--;
          current += char;
        } else if (char === "{") {
          braceDepth++;
          current += char;
        } else if (char === "}") {
          braceDepth--;
          current += char;
        } else if (char === "[") {
          bracketDepth++;
          current += char;
        } else if (char === "]") {
          bracketDepth--;
          current += char;
        } else if (
          char === "," &&
          parenDepth === 0 &&
          braceDepth === 0 &&
          bracketDepth === 0
        ) {
          args.push(this.parseJsArgument(current.trim()));
          current = "";
        } else {
          current += char;
        }
      } else {
        current += char;
        if (char === stringChar && argsString[i - 1] !== "\\") {
          insideString = false;
          stringChar = null;
        }
      }
    }

    if (current.trim()) {
      args.push(this.parseJsArgument(current.trim()));
    }

    return args;
  }
  // Set template data (would be called from your main app)
  setData(data) {
    this.variables = { ...this.variables, ...data };
  }

  // Helper to resolve variable references
  resolveVariable(varName) {
    // Handle dot notation for nested objects
    const parts = varName.split(".");
    let value = this.variables;

    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // MODIFIED: This now uses the 'processLine' helper for recursion
  parseForLoop(line, lines, currentIndex) {
    const forMatch = line.match(/^for\s+(\w+)\s+in\s+([\w.]+)\s*\{$/);
    if (!forMatch) return null;

    const [, itemVar, arrayVar] = forMatch;
    const arrayData = this.resolveVariable(arrayVar);
    if (!Array.isArray(arrayData)) {
      this.throwError(`For loop: '${arrayVar}' is not an array`, line);
    }

    let braceDepth = 1;
    let endIndex = currentIndex + 1;
    const loopBodyLines = [];
    while (endIndex < lines.length && braceDepth > 0) {
      const currentLine = lines[endIndex];
      braceDepth += (currentLine.match(/\{/g) || []).length;
      braceDepth -= (currentLine.match(/\}/g) || []).length;
      if (braceDepth > 0) {
        loopBodyLines.push(lines[endIndex]);
      }
      endIndex++;
    }

    // Always resolve the latest value of the array from this.variables for reactivity
    const getArrayData = () => this.resolveVariable(arrayVar);
    let html = "";
    const originalVars = JSON.parse(JSON.stringify(this.variables));

    const arr = getArrayData();
    if (Array.isArray(arr)) {
      arr.forEach((item, index) => {
        this.variables[itemVar] = item;
        // special loop variables
        this.variables[`${itemVar}_index`] = index;
        this.variables[`${itemVar}_first`] = index === 0;
        this.variables[`${itemVar}_last`] = index === arr.length - 1;

        // RECURSIVE PART: Parse the body of the loop
        for (let i = 0; i < loopBodyLines.length; i++) {
          const result = this.processLine(loopBodyLines, i);
          if (result) {
            html += result.html;
            i = result.newIndex;
          }
        }
      });
    }

    this.variables = originalVars;
    return { html, skipToIndex: endIndex - 1 };
  }

  // Handle if statements
  parseIfStatement(line, lines, currentIndex) {
    // MODIFIED: Match 'if' or '@if'
    const initialIfMatch = line.match(/^(?:if|@if)\s+(.+?)\s*\{$/);
    if (!initialIfMatch) {
      return null;
    }

    let html = "";
    let conditionMet = false;
    let currentPosition = currentIndex;

    const findBlock = (startIdx) => {
      let depth = 1;
      const body = [];
      let endIdx = startIdx + 1;
      while (endIdx < lines.length) {
        const currentLine = lines[endIdx];
        depth += (currentLine.match(/\{/g) || []).length;
        depth -= (currentLine.match(/\}/g) || []).length;
        if (depth > 0) {
          body.push(currentLine);
        } else {
          const lastBraceIndex = currentLine.lastIndexOf("}");
          const contentBeforeBrace = currentLine.substring(0, lastBraceIndex);
          if (contentBeforeBrace.trim()) {
            body.push(contentBeforeBrace);
          }
          return { body, endIdx };
        }
        endIdx++;
      }
      throw new Error("Unclosed block in if statement.");
    };

    // --- 1. Process the initial `if` or `@if` block ---
    const ifCondition = initialIfMatch[1];
    const { body: ifBody, endIdx: ifEndIdx } = findBlock(currentPosition);
    if (this.evaluateCondition(ifCondition)) {
      conditionMet = true;
      html += this.parseBody(ifBody);
    }
    currentPosition = ifEndIdx;

    // --- 2. Loop to find and process `else if` and `else` blocks ---
    while (currentPosition < lines.length) {
      const blockEndingLine = lines[currentPosition];
      const nextLine = lines[currentPosition + 1];

      let elseIfMatch, elseMatch;
      let isSameLine = false;
      let consumedNextLine = false;

      // Check for same-line `} else ...`
      if (blockEndingLine) {
        const trimmed = blockEndingLine.trim();
        // MODIFIED: Recognize @else if, @elseif, else if
        elseIfMatch = trimmed.match(
          /^}\s*(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        // MODIFIED: Recognize @else, else
        elseMatch = trimmed.match(/^}\s*(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) {
          isSameLine = true;
        }
      }

      // Check for next-line `else ...` if same-line didn't match
      if (!isSameLine && blockEndingLine?.trim() === "}" && nextLine) {
        const trimmed = nextLine.trim();
        // MODIFIED: Recognize @else if, @elseif, else if on next line
        elseIfMatch = trimmed.match(
          /^(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        // MODIFIED: Recognize @else, else on next line
        elseMatch = trimmed.match(/^(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) {
          consumedNextLine = true;
        }
      }

      if (elseIfMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const { body, endIdx } = findBlock(startOfBlock);
        if (!conditionMet) {
          const condition = elseIfMatch[1];
          if (this.evaluateCondition(condition)) {
            conditionMet = true;
            html += this.parseBody(body);
          }
        }
        currentPosition = endIdx;
        continue; // Look for more else if/else
      } else if (elseMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const { body, endIdx } = findBlock(startOfBlock);
        if (!conditionMet) {
          html += this.parseBody(body);
        }
        currentPosition = endIdx;
        break; // `else` is always the end of the chain
      } else {
        // No more `else` or `else if` found, the chain is over.
        break;
      }
    }

    return { html, skipToIndex: currentPosition };
  }

  // Evaluate conditions for if statements
  evaluateCondition(condition) {
    // Handle simple comparisons
    const comparisonMatch = condition.match(
      /^(\w+(?:\.\w+)*)\s*(==|!=|>|<|>=|<=)\s*(.+)$/
    );
    if (comparisonMatch) {
      const [, leftVar, operator, rightValue] = comparisonMatch;
      const leftVal = this.resolveVariable(leftVar);
      let rightVal = rightValue;

      // Parse right value
      if (rightValue.match(/^["'].*["']$/)) {
        rightVal = rightValue.slice(1, -1); // Remove quotes
      } else if (rightValue.match(/^\d+$/)) {
        rightVal = parseInt(rightValue);
      } else if (rightValue.match(/^\d*\.\d+$/)) {
        rightVal = parseFloat(rightValue);
      } else if (rightValue === "true") {
        rightVal = true;
      } else if (rightValue === "false") {
        rightVal = false;
      } else {
        rightVal = this.resolveVariable(rightValue);
      }

      switch (operator) {
        case "==":
          return leftVal == rightVal;
        case "!=":
          return leftVal != rightVal;
        case ">":
          return leftVal > rightVal;
        case "<":
          return leftVal < rightVal;
        case ">=":
          return leftVal >= rightVal;
        case "<=":
          return leftVal <= rightVal;
        default:
          return false;
      }
    }

    // Handle simple variable existence check
    const varMatch = condition.match(/^(\w+(?:\.\w+)*)$/);
    if (varMatch) {
      const value = this.resolveVariable(varMatch[1]);
      return !!value;
    }

    return false;
  }

  // Handle variable assignments
  // Handle variable assignments
  // Handle variable assignments (both single-line and multiline)
  parseVariableAssignment(line) {
    // Match: set varName = value (start of assignment)
    const setMatch = line.match(/^set\s+(\w+)\s*=\s*(.*)$/);
    if (!setMatch) return null;

    const [, varName, value] = setMatch;
    let parsedValue = value.trim();

    // Check if this is a complete single-line assignment
    if (this.isCompleteAssignment(parsedValue)) {
      // Handle single-line assignment
      return this.processSingleLineAssignment(varName, parsedValue);
    } else {
      // Start multiline assignment
      this.insideMultilineAssignment = true;
      this.multilineVarName = varName;
      this.multilineContent = parsedValue;
      this.multilineBraceDepth =
        (parsedValue.match(/\{/g) || []).length -
        (parsedValue.match(/\}/g) || []).length;
      this.multilineBracketDepth =
        (parsedValue.match(/\[/g) || []).length -
        (parsedValue.match(/\]/g) || []).length;
      return ""; // No HTML output yet
    }
  }

  // NEW: Helper method to check if assignment is complete
  isCompleteAssignment(value) {
    const braceCount =
      (value.match(/\{/g) || []).length - (value.match(/\}/g) || []).length;
    const bracketCount =
      (value.match(/\[/g) || []).length - (value.match(/\]/g) || []).length;
    return braceCount === 0 && bracketCount === 0;
  }

  // NEW: Helper method to process single-line assignments
  processSingleLineAssignment(varName, parsedValue) {
    // Check for Array or Object literals first
    if (
      (parsedValue.startsWith("[") && parsedValue.endsWith("]")) ||
      (parsedValue.startsWith("{") && parsedValue.endsWith("}"))
    ) {
      try {
        parsedValue = eval(`(${parsedValue})`);
      } catch (e) {
        throw new Error(
          `Invalid Array/Object syntax for variable '${varName}': ${e.message}`
        );
      }
    }
    // MODIFIED: Attempt to evaluate as a JavaScript expression
    else {
      try {
        // Temporarily set variables in a local scope for eval
        const tempScope = {};
        for (const key in this.variables) {
          tempScope[key] = this.variables[key];
        }
        // Use a function to execute the eval in a controlled scope
        const evaluateInScope = new Function(
          ...Object.keys(tempScope),
          `return ${parsedValue};`
        );
        parsedValue = evaluateInScope(...Object.values(tempScope));

        // If the evaluation results in a string that was originally quoted, remove quotes
        if (
          typeof parsedValue === "string" &&
          parsedValue.match(/^["'].*["']$/)
        ) {
          parsedValue = parsedValue.slice(1, -1);
        }
      } catch (e) {
        // Fallback to existing logic for primitives if eval fails
        if (parsedValue.match(/^["'].*["']$/)) {
          parsedValue = parsedValue.slice(1, -1); // Remove quotes
        } else if (parsedValue.match(/^\d+$/)) {
          parsedValue = parseInt(parsedValue);
        } else if (parsedValue.match(/^\d*\.\d+$/)) {
          parsedValue = parseFloat(parsedValue);
        } else if (parsedValue === "true") {
          parsedValue = true;
        } else if (parsedValue === "false") {
          parsedValue = false;
        } else {
          // Try to resolve as a reference to another variable
          const resolvedValue = this.resolveVariable(parsedValue);
          if (resolvedValue !== undefined) {
            parsedValue = resolvedValue;
          }
        }
      }
    }

    this.variables[varName] = parsedValue;

    return ""; // No HTML output for variable assignments
  }

  // NEW: Method to handle multiline assignment continuation
  // NEW: Method to handle multiline assignment continuation
  handleMultilineAssignment(line) {
    this.multilineContent += "\n" + line;

    // Update brace/bracket depth
    this.multilineBraceDepth +=
      (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    this.multilineBracketDepth +=
      (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length;

    // Check if assignment is complete (both braces and brackets should be balanced)
    if (this.multilineBraceDepth <= 0 && this.multilineBracketDepth <= 0) {
      // Assignment complete, process it
      try {
        const result = this.processSingleLineAssignment(
          this.multilineVarName,
          this.multilineContent.trim()
        );

        // Reset multiline state
        this.insideMultilineAssignment = false;
        this.multilineVarName = "";
        this.multilineContent = "";
        this.multilineBraceDepth = 0;
        this.multilineBracketDepth = 0;

        return result;
      } catch (error) {
        // Reset state on error too
        this.insideMultilineAssignment = false;
        this.multilineVarName = "";
        this.multilineContent = "";
        this.multilineBraceDepth = 0;
        this.multilineBracketDepth = 0;
        throw error;
      }
    }

    return ""; // Still collecting multiline content
  }

  // Enhanced variable interpolation

  interpolateVariables(text) {
    return text.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, expression) => {
      // Call the new evaluator to get the result
      const value = this.evaluateExpression(expression);
      return value !== undefined ? String(value) : match;
    });
  }

  // Add this method to convert string arguments to proper types
  parseJsArgument(arg) {
    arg = arg.trim();

    // Handle quoted strings
    if (
      (arg.startsWith('"') && arg.endsWith('"')) ||
      (arg.startsWith("'") && arg.endsWith("'"))
    ) {
      return arg.slice(1, -1); // Remove quotes
    }

    // Handle numbers
    if (/^\d+$/.test(arg)) {
      return parseInt(arg, 10);
    }

    if (/^\d*\.\d+$/.test(arg)) {
      return parseFloat(arg);
    }

    // Handle booleans
    if (arg === "true") return true;
    if (arg === "false") return false;
    if (arg === "null") return null;
    if (arg === "undefined") return undefined;

    // Return as string for other cases
    return arg;
  }
  // --- NEW: Method to parse attributes from a component tag ---
  parseComponentAttributes(attrString) {
    const props = {};
    const attrRegex = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? true; // double-quoted, single-quoted, unquoted, or boolean
      props[key] = value;
    }
    return props;
  }

  parseFile(filename) {
    console.log(`[DEBUG] Starting to parse: ${filename}`);
    this.currentFile = filename; // Set the context for the main file
    this.pageName = null;
    this.components = {}; // Reset components for each new file parse
    this.variables = {}; // Reset variables for each file
    this.seoData = {}; // Reset SEO data for each file
    this.openBlocks = [];

    const filePath = path.join(this.viewsPath, filename);
    if (!fs.existsSync(filePath)) {
      this.throwError(`Entry file not found: ${filename}`);
    }

    let content = fs.readFileSync(filePath, "utf-8");
    content = this.resolveIncludes(content, filePath);

    const lines = content.split("\n");
    let html = "";
    let insideJsCommand = false;
    let jsCommandName = "";
    let jsSelector = "";
    let jsContent = "";
    let jsBlockDepth = 0;
    let insideSeoBlock = false;
    let seoBraceDepth = 0;
    let seoLines = [];

    for (let i = 0; i < lines.length; i++) {
      this.currentLineNumber = i + 1;
      let line = lines[i].trim();
      if (!line) continue;
      // SEO block start
      if (!insideSeoBlock && line.startsWith("seo ") && line.endsWith("{")) {
        insideSeoBlock = true;
        seoBraceDepth = 1;
        continue;
      }
      if (insideSeoBlock) {
        seoBraceDepth += (line.match(/\{/g) || []).length;
        seoBraceDepth -= (line.match(/\}/g) || []).length;
        if (seoBraceDepth <= 0) {
          // End of SEO block, parse collected lines
          insideSeoBlock = false;
          for (const seoLine of seoLines) {
            const match = seoLine.match(/^([\w:-]+)\s*:\s*(["'])(.*?)\2\s*;?$/);
            if (match) {
              const key = match[1];
              const value = match[3];
              this.seoData[key] = value;
            }
          }
          seoLines = [];
          continue;
        } else {
          if (line !== "}") seoLines.push(line);
          continue;
        }
      }

      // MOVED TO THE TOP: Check if we are inside a JS command FIRST.
      // This gives it priority over all other checks.
      if (insideJsCommand) {
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        jsBlockDepth += openBraces - closeBraces;

        if (jsBlockDepth <= 0) {
          const closingBraceIndex = line.lastIndexOf("}");
          jsContent += line.substring(0, closingBraceIndex);
          let generatedJs = "";
          const command = jsCommandName;
          const selector =
            jsCommandName === "js:click" ? jsSelector : `'${jsSelector}'`;
          const content = jsContent.trim();
          const jsCode = this.jsCommands[command];
          if (command === "js:ajax") {
            generatedJs = `fetch(${selector}, ${content || "{}"})`;
          } else if (command === "js:get" || command === "js:getAll") {
            generatedJs = `${jsCode}(${selector})`;
            if (content) generatedJs += `.${content}`;
          } else if (
            command === "js:toggle" ||
            command === "js:addClass" ||
            command === "js:removeClass"
          ) {
            generatedJs = `document.querySelector(${selector}).${jsCode}('${content}')`;
          } else if (command === "js:wait") {
            const timeMatch = selector.match(/(\d+)(ms|s)?/);
            let time = 0;
            if (timeMatch) {
              time = parseInt(timeMatch[1]);
              if (timeMatch[2] === "s") time *= 1000;
            }
            generatedJs = `${jsCode}\n  ${content}\n}, ${time})`;
          } else {
            generatedJs = `document.querySelector(${selector}).${jsCode}\n  ${content}\n})`;
          }
          html += `<script>${generatedJs}</script>\n`;
          const remainingContent = line.substring(closingBraceIndex + 1).trim();
          if (remainingContent) {
            const parsed = this.parseLine(remainingContent);
            if (parsed) html += parsed + "\n";
          }
          insideJsCommand = false;
          jsCommandName = "";
          jsSelector = "";
          jsContent = "";
          jsBlockDepth = 0;
        } else {
          jsContent += line + "\n";
        }
        continue;
      }

      // ADD this block to handle the script block's content
      if (this.insideMultilineScript) {
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        this.scriptBlockDepth += openBraces - closeBraces;

        if (this.scriptBlockDepth <= 0) {
          const closingIndex = line.lastIndexOf("}");
          this.scriptContent += line.substring(0, closingIndex);
          html += `<script>${this.scriptContent.trim()}</script>\n`;
          this.insideMultilineScript = false;
          this.scriptBlockDepth = 0;

          const remaining = line.substring(closingIndex + 1).trim();
          if (remaining) {
            const parsed = this.parseLine(remaining);
            if (parsed) html += parsed + "\n";
          }
        } else {
          this.scriptContent += line + "\n";
        }
        continue;
      }

      if (this.insidePreBlock) {
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        this.preBlockDepth += openBraces - closeBraces;

        if (this.preBlockDepth <= 0) {
          // End of pre block
          let content = this.preContent.join("\n");
          // Escape HTML entities
          content = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

          const preHtml = `<pre${this.preAttrs}>${content}</pre>`;
          html += preHtml;

          // Reset state
          this.insidePreBlock = false;
          this.preBlockDepth = 0;
          this.preContent = [];
          this.preAttrs = "";
        } else {
          this.preContent.push(line);
        }
        continue;
      }
      // Check for start of pre block
      const preBlockStart = line.match(/^(pre(?:[.#][\w-]+)*)\s*\{$/);
      if (preBlockStart) {
        const tag = preBlockStart[1];
        let tagName = "pre";
        let classList = [];
        let idAttr = "";
        const tagParts = tag.split(/(?=[.#])/);
        tagParts.forEach((part) => {
          if (part.startsWith(".")) classList.push(part.slice(1));
          else if (part.startsWith("#")) idAttr = part.slice(1);
        });
        let attrs = "";
        if (classList.length) attrs += ` class="${classList.join(" ")}"`;
        if (idAttr) attrs += ` id="${idAttr}"`;

        this.insidePreBlock = true;
        this.preBlockDepth = 1;
        this.preContent = [];
        this.preAttrs = attrs;
        continue;
      }
      // The rest of the logic follows, now in the correct order.
      if (!this.pageName) {
        const pageMatch = line.match(/^page\s*\[\s*(["'])([^"']+)\1/);
        if (pageMatch) this.pageName = pageMatch[2];
      }

      if (this.insideMultilineAssignment) {
        const result = this.handleMultilineAssignment(line);
        if (result !== null) {
          if (result) html += result + "\n";
        }
        continue;
      }

      if (line.startsWith("}")) {
        if (line !== "}") {
          throw new Error(
            `Syntax Error: Unexpected characters found after closing brace '}'. Full line: "${line}"`
          );
        }
        const closingTag = this.openBlocks.pop();
        if (!closingTag) {
          throw new Error("Syntax Error: Unmatched closing brace '}'.");
        }
        html += `</${closingTag}>\n`;
        continue;
      }

      const assignment = this.parseVariableAssignment(line);
      if (assignment !== null) {
        if (assignment) html += assignment + "\n";
        continue;
      }

      const ifStatement = this.parseIfStatement(line, lines, i);
      if (ifStatement) {
        html += ifStatement.html;
        i = ifStatement.skipToIndex;
        continue;
      }

      const forLoop = this.parseForLoop(line, lines, i);
      if (forLoop) {
        html += forLoop.html;
        i = forLoop.skipToIndex;
        continue;
      }
      const foreachLoop = this.parseForeach(line, lines, i);
      if (foreachLoop) {
        html += foreachLoop.html;
        i = foreachLoop.skipToIndex;
        continue;
      }
      if (typeof this.parseWatcher === "function") {
        const watcherBlock = this.parseWatcher(line, lines, i);
        if (watcherBlock) {
          html += watcherBlock.html;
          i = watcherBlock.skipToIndex;
          continue;
        }
      }

      const importMatch = line.match(this.importRegex);
      if (importMatch) {
        this.loadComponentsFromFile(importMatch[2]);
        continue;
      }
      if (line.match(/^script\s*\{/)) {
        this.insideMultilineScript = true;
        this.scriptBlockDepth = 1;
        const startIndex = line.indexOf("{") + 1;
        this.scriptContent = line.substring(startIndex) + "\n";
        continue;
      }

      const componentUsageMatch = line.match(/^<([\w-]+)\s*([^>]*?)\s*\/>/);
      if (componentUsageMatch) {
        const [, componentName, attrString] = componentUsageMatch;
        if (this.components[componentName]) {
          const component = this.components[componentName];
          const props = this.parseComponentAttributes(attrString);
          let expandedBody = component.body;
          for (const propName of component.props) {
            const value = props[propName] || "";
            const regex = new RegExp(`{{\\s*${propName}\\s*}}`, "g");
            expandedBody = expandedBody.replace(regex, value);
          }
          expandedBody = this.interpolateVariables(expandedBody);
          const expandedHtml = expandedBody
            .split("\n")
            .map((l) => this.parseLine(l.trim()))
            .filter(Boolean)
            .join("\n");
          html += expandedHtml + "\n";
          continue;
        }
      }

      // Check for start of multiline JS command
      let jsCommandMatch = null;
      const jsBlock = this.parseMultiLineJsCommand(line, lines, i);
      if (jsBlock) {
        html += jsBlock.html;
        i = jsBlock.skipToIndex;
        continue;
      }
      if (insideJsCommand) continue;

      const parsed = this.parseLine(line);
      if (parsed) {
        // The final interpolation happens in parseLine now
        html += parsed + "\n";
      }
    }

    if (insideJsCommand) {
      throw new Error(
        `Unclosed JS command block starting with: ${jsCommandName}(${jsSelector}) {`
      );
    }

    if (this.openBlocks.length > 0) {
      const openTag = this.openBlocks[this.openBlocks.length - 1];
      throw new Error(`Syntax Error: Unclosed block for tag '${openTag}'.`);
    }

    return html + this.generateStateManager();
  }
  parseMultiLineJsCommand(line, lines, currentIndex) {
    let jsCommandMatch = null;
    for (const command of Object.keys(this.jsCommands)) {
      const regex = new RegExp(`^(${command})(?:\\(([^)]*)\\))?\\s*\\{`);
      jsCommandMatch = line.match(regex);
      if (jsCommandMatch) break;
    }

    if (!jsCommandMatch) {
      return null; // Not a multi-line JS command
    }

    const commandName = jsCommandMatch[1];
    const selector = (jsCommandMatch[2] || "").trim();

    // Find the end of the block by counting braces
    let braceDepth =
      (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    let endIndex = currentIndex;
    const bodyLines = [line.substring(line.indexOf("{") + 1)];

    if (braceDepth > 0) {
      endIndex++;
      while (endIndex < lines.length && braceDepth > 0) {
        const currentLine = lines[endIndex];
        braceDepth += (currentLine.match(/\{/g) || []).length;
        braceDepth -= (currentLine.match(/\}/g) || []).length;
        bodyLines.push(currentLine);
        endIndex++;
      }
      endIndex--; // Correct for the final increment
    }

    let fullBody = bodyLines.join("\n");
    const lastBraceIndex = fullBody.lastIndexOf("}");
    const content = fullBody.substring(0, lastBraceIndex).trim();

    // Generate the JS code
    let generatedJs = "";
    const jsCode = this.jsCommands[commandName];
    const cleanSelector = selector.replace(/['"]/g, "");

    // Logic for different command types
    if (commandName === "js:wait") {
      const timeMatch = selector.match(/(\d+)(ms|s)?/);
      let time = 0;
      if (timeMatch) {
        time = parseInt(timeMatch[1]);
        if (timeMatch[2] === "s") time *= 1000;
      }
      generatedJs = `${jsCode}\n  ${content}\n}, ${time})`;
    } else {
      // Handles js:click, js:hover, etc.
      generatedJs = `document.querySelector('${cleanSelector}').${jsCode}\n  ${content}\n})`;
    }

    const html = `<script>${generatedJs}</script>\n`;

    return { html, skipToIndex: endIndex };
  }
  // NEW HELPER: This method contains the main parsing logic from your original parseFile.
  // It can be called from anywhere, making it reusable for nested blocks.
  processLine(lines, i) {
    let line = lines[i];
    this.currentLineNumber = i + 1;
    const jsBlock = this.parseMultiLineJsCommand(line, lines, i);
    if (jsBlock) {
      return { html: jsBlock.html, newIndex: jsBlock.skipToIndex };
    }
    // Handle multi-line assignment state
    if (this.insideMultilineAssignment) {
      const result = this.handleMultilineAssignment(line);
      return { html: result || "", newIndex: i };
    }

    line = line.trim();

    // Check for closing brace for block tags
    if (line.startsWith("}")) {
      if (line !== "}") {
        this.throwError(`Unexpected characters after closing brace '}'.`, line);
      }
      const closingTag = this.openBlocks.pop();
      if (!closingTag) {
        this.throwError("Unmatched closing brace '}'.", line);
      }
      return { html: `</${closingTag}>\n`, newIndex: i };
    }

    // Check for all directives in order
    const assignment = this.parseVariableAssignment(line);
    if (assignment !== null) {
      return { html: assignment ? assignment + "\n" : "", newIndex: i };
    }

    const ifStatement = this.parseIfStatement(line, lines, i);
    if (ifStatement) {
      return { html: ifStatement.html, newIndex: ifStatement.skipToIndex };
    }

    const forLoop = this.parseForLoop(line, lines, i);
    if (forLoop) {
      return { html: forLoop.html, newIndex: forLoop.skipToIndex };
    }

    const importMatch = line.match(this.importRegex);
    if (importMatch) {
      this.loadComponentsFromFile(importMatch[2]);
      return { html: "", newIndex: i };
    }

    const componentUsageMatch = line.match(/^<([\w-]+)\s*([^>]*?)\s*\/>/);
    if (componentUsageMatch) {
      const [, componentName, attrString] = componentUsageMatch;
      if (this.components[componentName]) {
        const component = this.components[componentName];
        const props = this.parseComponentAttributes(attrString);
        let expandedBody = component.body;
        for (const propName of component.props) {
          const value = props[propName] || "";
          const regex = new RegExp(`{{\\s*${propName}\\s*}}`, "g");
          expandedBody = expandedBody.replace(regex, value);
        }

        // Here, we create a temporary new parser instance to parse the component body
        // This isolates the component's parsing from the main file's state
        const tempParser = new AnixParser(this.viewsPath);
        tempParser.variables = this.variables; // Share variables
        tempParser.components = this.components; // Share components
        const expandedHtml = tempParser.parseFileContent(expandedBody);

        return { html: expandedHtml + "\n", newIndex: i };
      }
    }

    // Fallback to the simple parseLine for basic tags
    const parsed = this.parseLine(line);
    if (parsed) {
      // The final interpolation is now handled inside parseLine
      return { html: parsed + "\n", newIndex: i };
    }

    return null; // No action taken for this line
  }

  // This is a new helper method to allow components to be parsed recursively
  parseFileContent(content) {
    const lines = content.split("\n");
    let html = "";
    for (let i = 0; i < lines.length; i++) {
      const result = this.processLine(lines, i);
      if (result) {
        html += result.html;
        i = result.newIndex;
      }
    }
    return html;
  }

  // MODIFIED: This now uses the 'processLine' helper for recursion
  parseForLoop(line, lines, currentIndex) {
    const forMatch = line.match(/^for\s+(\w+)\s+in\s+([\w.]+)\s*\{$/);
    if (!forMatch) return null;

    const [, itemVar, arrayVar] = forMatch;
    const arrayData = this.resolveVariable(arrayVar);
    if (!Array.isArray(arrayData)) {
      throw new Error(`For loop: '${arrayVar}' is not an array`);
    }

    let braceDepth = 1;
    let endIndex = currentIndex + 1;
    const loopBodyLines = [];
    while (endIndex < lines.length && braceDepth > 0) {
      const currentLine = lines[endIndex];
      braceDepth += (currentLine.match(/\{/g) || []).length;
      braceDepth -= (currentLine.match(/\}/g) || []).length;
      if (braceDepth > 0) loopBodyLines.push(currentLine);
      endIndex++;
    }

    // Always resolve the latest value of the array from this.variables for reactivity
    const getArrayData = () => this.resolveVariable(arrayVar);
    let html = "";
    const originalVars = JSON.parse(JSON.stringify(this.variables));

    const arr = getArrayData();
    arr.forEach((item, index) => {
      this.variables[itemVar] = item;
      this.variables[`${itemVar}_index`] = index;
      this.variables[`${itemVar}_first`] = index === 0;
      this.variables[`${itemVar}_last`] = index === arr.length - 1;

      // RECURSIVE PART: Parse the body of the loop
      for (let i = 0; i < loopBodyLines.length; i++) {
        const result = this.processLine(loopBodyLines, i);
        if (result) {
          html += result.html;
          i = result.newIndex;
        }
      }
    });

    this.variables = originalVars;
    return { html, skipToIndex: endIndex - 1 };
  }

  // New helper to parse the body of a block recursively
  parseBody(bodyLines) {
    let html = "";
    if (!bodyLines || bodyLines.length === 0) {
      return "";
    }
    for (let i = 0; i < bodyLines.length; i++) {
      const result = this.processLine(bodyLines, i);
      if (result) {
        html += result.html;
        i = result.newIndex;
      }
    }
    return html;
  }
  // Add this new method anywhere inside the AnixParser class
  evaluateExpression(expression) {
    // Create a list of all variables from the current state
    const scopeVarNames = Object.keys(this.variables);
    // Create the arguments and values for the function constructor
    const scopeVarValues = Object.values(this.variables);

    try {
      const evaluator = new Function(...scopeVarNames, `return ${expression};`);
      return evaluator(...scopeVarValues);
    } catch (e) {
      // If evaluation fails, return the original expression to avoid crashing
      console.error(
        `Anix Error: Could not evaluate expression "{{${expression}}}".`,
        e.message
      );
      return `{{${expression}}}`;
    }
  }
  getDependencies(expression) {
    const dependencies = new Set();
    // This finds all potential variable names in an expression
    const potentialVars = expression.match(/[a-zA-Z_]\w*(?:\.\w+)*/g) || [];
    for (const varName of potentialVars) {
      // Check if it's a defined state variable
      if (Object.keys(this.state).includes(varName.split(".")[0])) {
        dependencies.add(varName.split(".")[0]);
      }
    }
    return Array.from(dependencies);
  }
  // REWRITTEN (AGAIN): To correctly handle same-line and next-line if/else if/else chains and add 'elseif' alias.
  parseIfStatement(line, lines, currentIndex) {
    const initialIfMatch = line.match(/^(?:if|@if)\s+(.+?)\s*\{$/);
    if (!initialIfMatch) {
      return null;
    }

    let html = "";
    let conditionMet = false;
    let currentPosition = currentIndex;

    const findBlock = (startIdx) => {
      let depth = 1;
      const body = [];
      let endIdx = startIdx + 1;
      while (endIdx < lines.length) {
        const currentLine = lines[endIdx];
        depth += (currentLine.match(/\{/g) || []).length;
        depth -= (currentLine.match(/\}/g) || []).length;
        if (depth > 0) {
          body.push(currentLine);
        } else {
          const lastBraceIndex = currentLine.lastIndexOf("}");
          const contentBeforeBrace = currentLine.substring(0, lastBraceIndex);
          if (contentBeforeBrace.trim()) {
            body.push(contentBeforeBrace);
          }
          return { body, endIdx };
        }
        endIdx++;
      }
      throw new Error("Unclosed block in if statement.");
    };

    // --- 1. Process the initial `if` block ---
    const ifCondition = initialIfMatch[1];
    const { body: ifBody, endIdx: ifEndIdx } = findBlock(currentPosition);
    if (this.evaluateCondition(ifCondition)) {
      conditionMet = true;
      html += this.parseBody(ifBody);
    }
    currentPosition = ifEndIdx;

    // --- 2. Loop to find and process `else if` and `else` blocks ---
    while (currentPosition < lines.length) {
      const blockEndingLine = lines[currentPosition];
      const nextLine = lines[currentPosition + 1];

      let elseIfMatch, elseMatch;
      let isSameLine = false;
      let consumedNextLine = false;

      // Check for same-line `} else ...`
      if (blockEndingLine) {
        const trimmed = blockEndingLine.trim();
        elseIfMatch = trimmed.match(
          /^}\s*(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        elseMatch = trimmed.match(/^}\s*(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) {
          isSameLine = true;
        }
      }

      // Check for next-line `else ...` if same-line didn't match
      if (!isSameLine && blockEndingLine?.trim() === "}" && nextLine) {
        const trimmed = nextLine.trim();
        elseIfMatch = trimmed.match(
          /^(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        elseMatch = trimmed.match(/^(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) {
          consumedNextLine = true;
        }
      }

      if (elseIfMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const { body, endIdx } = findBlock(startOfBlock);
        if (!conditionMet) {
          const condition = elseIfMatch[1];
          if (this.evaluateCondition(condition)) {
            conditionMet = true;
            html += this.parseBody(body);
          }
        }
        currentPosition = endIdx;
        continue; // Look for more else if/else
      } else if (elseMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const { body, endIdx } = findBlock(startOfBlock);
        if (!conditionMet) {
          html += this.parseBody(body);
        }
        currentPosition = endIdx;
        break; // `else` is always the end of the chain
      } else {
        // No more `else` or `else if` found, the chain is over.
        break;
      }
    }

    return { html, skipToIndex: currentPosition };
  }

  // Helper method to find the matching closing brace for a string with braces
  findMatchingClosingBrace(str) {
    let depth = 0;
    let startFound = false;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === "{") {
        startFound = true;
        depth++;
      } else if (str[i] === "}") {
        depth--;
        if (startFound && depth === 0) {
          return i; // Found matching closing brace
        }
      }
    }
    return -1; // No matching closing brace found
  }

  resolveIncludes(content, parentFilePath) {
    const parentDir = path.dirname(parentFilePath);
    return content.replace(this.includeRegex, (match, quote, includeFile) => {
      const includePath = path.resolve(parentDir, includeFile);
      if (fs.existsSync(includePath)) {
        const includedContent = fs.readFileSync(includePath, "utf-8");
        // Recursively resolve includes within the included file
        return this.resolveIncludes(includedContent, includePath);
      } else {
        // We don't have the line number of the include statement easily here,
        // but we can provide the file where the error occurred.
        throw new AnixError(
          `Include file not found: ${includeFile}`,
          parentFilePath
        );
      }
    });
  }

  parseLine(line) {
    // MODIFICATION: Interpolation is now handled inside the tag matching logic
    // to ensure it only applies to content.

    // Updated pre tag regex to accept both quote types
    const preTagMatch = line.match(
      /^(pre(?:[.#][\w-]+)*)(?:\s*\{)?\s*(["'])([\s\S]*?)\2\s*$/
    );
    if (preTagMatch) {
      const tag = preTagMatch[1];
      const rawContent = preTagMatch[3];
      let tagName = "pre";
      let classList = [];
      let idAttr = "";
      const tagParts = tag.split(/(?=[.#])/);
      tagParts.forEach((part) => {
        if (part.startsWith(".")) classList.push(part.slice(1));
        else if (part.startsWith("#")) idAttr = part.slice(1);
      });
      let attrs = "";
      if (classList.length) attrs += ` class="${classList.join(" ")}"`;
      if (idAttr) attrs += ` id="${idAttr}"`;
      const cleanContent = rawContent.replace(/\\n/g, "\n");
      const escapedContent = cleanContent
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      return `<pre${attrs}>${escapedContent}</pre>`;
    }
    if (!line || this.commentRegex.test(line)) return "";

    const importJsMatch = line.match(
      /^importjs\s+(["'])([^"']+)\1\s*:\s*([\w$]+)\(([^)]*)\);?\s*$/
    );
    if (importJsMatch) {
      const jsPath = importJsMatch[2];
      const funcName = importJsMatch[3];
      const rawArgs = importJsMatch[4];

      let args = [];
      if (rawArgs.trim()) {
        // Parse arguments more carefully to handle quoted strings
        args = this.parseJsArguments(rawArgs);
      }

      // Determine the absolute path
      let absPath = jsPath;
      let possiblePaths = [jsPath];
      if (!path.isAbsolute(jsPath)) {
        // Try multiple potential locations
        const possiblePaths = [
          path.join(process.cwd(), jsPath.replace(/^\//, "")), // Remove leading slash if present
          path.join(process.cwd(), "views", jsPath.replace(/^\//, "")),
          path.join(
            process.cwd(),
            "views",
            "assets",
            "js",
            path.basename(jsPath)
          ),
          path.join(this.viewsPath, jsPath.replace(/^\//, "")),
        ];

        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            absPath = testPath;
            break;
          }
        }
      }

      if (!fs.existsSync(absPath)) {
        throw new Error(
          `importjs: JavaScript file not found at '${jsPath}'. Searched paths: ${
            possiblePaths?.join(", ") || jsPath
          }`
        );
      }

      try {
        // Clear the module from cache to ensure fresh execution
        delete require.cache[require.resolve(absPath)];
        const mod = require(absPath);

        if (typeof mod[funcName] === "function") {
          const result = mod[funcName](...args);
          // Return the result as a string (assuming it returns HTML)
          return typeof result === "string" ? result : String(result);
        } else {
          throw new Error(
            `importjs: Function '${funcName}' not found in ${jsPath}`
          );
        }
      } catch (err) {
        throw new Error(`importjs error in '${jsPath}': ${err.message}`);
      }
    }

    const templateDirectiveMatch = line.match(/^\{\{\s*([\w$]+)\s*\}\}$/);
    if (templateDirectiveMatch) {
      const funcName = templateDirectiveMatch[1];
      let absPath = path.join(
        process.cwd(),
        "views",
        "assets",
        "js",
        "templates.js"
      );
      if (!fs.existsSync(absPath)) {
        absPath = path.join(process.cwd(), "assets", "js", "templates.js");
      }
      if (fs.existsSync(absPath)) {
        try {
          delete require.cache[require.resolve(absPath)];
          const mod = require(absPath);
          if (typeof mod[funcName] === "function") {
            return mod[funcName]();
          } else {
            throw new Error(
              `Template Error: Function '${funcName}' not found in templates.js`
            );
          }
        } catch (err) {
          throw new Error(`Template Error in 'templates.js': ${err.message}`);
        }
      } else {
        throw new Error(`Template Error: 'templates.js' file not found.`);
      }
    }

    for (const [command, jsCode] of Object.entries(this.jsCommands)) {
      if (line.startsWith(command)) {
        const jsMatch = line.match(/^(js:\w+)\(([^)]*)\)\s*\{(.*)\}\s*;?$/);
        if (jsMatch) {
          const selector = jsMatch[2].trim();
          const content = jsMatch[3].trim();
          let generatedJs = "";
          if (command === "js:ajax") {
            generatedJs = `fetch('${selector}', ${content || "{}"})`;
          } else if (command === "js:get" || command === "js:getAll") {
            generatedJs = `${jsCode}('${selector}')`;
            if (content) {
              generatedJs += `.${content}`;
            }
          } else if (
            command === "js:toggle" ||
            command === "js:addClass" ||
            command === "js:removeClass"
          ) {
            generatedJs = `document.querySelector('${selector}').${jsCode}('${content}')`;
          } else if (command === "js:wait") {
            const timeMatch = selector.match(/(\d+)(ms|s)?/);
            let time = 0;
            if (timeMatch) {
              time = parseInt(timeMatch[1]);
              if (timeMatch[2] === "s") time *= 1000;
            }
            generatedJs = `${jsCode}\n  ${content}\n}, ${time})`;
          } else {
            // Corrected logic for js:click and other event listeners
            const cleanSelector = selector.replace(/['"]/g, ""); // Remove quotes for clean selector
            generatedJs = `document.querySelector('${cleanSelector}').${jsCode}\n  ${content}\n})`;
          }
          return `<script>${generatedJs}</script>`;
        }
        const simpleSyntaxMatch = line.match(/^(js:\w+)\(([^)]*)\)\s*;?$/);
        if (simpleSyntaxMatch) {
          const params = this.safeSplitAttributes(simpleSyntaxMatch[2]);
          if (command === "js:get" || command === "js:getAll") {
            return `<script>${jsCode}('${params[0]}');</script>`;
          } else if (
            command === "js:toggle" ||
            command === "js:addClass" ||
            command === "js:removeClass"
          ) {
            if (params.length >= 2) {
              return `<script>document.querySelector('${params[0]}').${jsCode}('${params[1]}');</script>`;
            }
          }
        }
      }
    }

    // Updated script src regex to accept both quote types
    const scriptSrcMatch = line.match(
      /^script\s*\(src\s*[=:]\s*(["'])([^"']+)\1\)\s*$/
    );
    if (scriptSrcMatch) {
      return `<script src="${scriptSrcMatch[2]}"></script>`;
    }

    if (line.match(/^script\s*\{.*\}\s*$/)) {
      const scriptContent = line.match(/script\s*\{([\s\S]*)\}$/);
      if (scriptContent && scriptContent[1]) {
        return `<script>${scriptContent[1].trim()}</script>`;
      }
      return "<script></script>";
    }
    if (line.startsWith("script:"))
      return "<script>" + line.replace(/^script:\s*/, "") + "</script>";

    if (line.startsWith("}")) {
      if (line !== "}") {
        throw new Error(
          `Syntax Error: Unexpected characters found after closing brace '}'. Full line: "${line}"`
        );
      }
      const closingTag = this.openBlocks.pop();
      if (!closingTag) {
        throw new Error("Syntax Error: Unmatched closing brace '}'.");
      }
      return `</${closingTag}>`;
    }

    const specificVoidTagMatch = line.match(/<(img|input)>(.+?)<\/\1>/);
    if (specificVoidTagMatch) {
      const tag = specificVoidTagMatch[1];
      const content = specificVoidTagMatch[2];
      return `<${tag}${this.parseVoidTagAttributes(content)}>`;
    }

    // Updated page match regex to accept both quote types
    const pageMatch = line.match(
      /^page\s*\[(["'])([^"']+)\1,\s*(["'])([^"']+)\3\]\s*\{/
    );
    if (pageMatch) {
      const title = pageMatch[2];
      const url = pageMatch[4];
      this.openBlocks.push("div");
      return `<div data-page="${title}" data-url="${url}">`;
    }

    // Updated inline link regex to accept both quote types
    const inlineLinkMatch = line.match(
      /^([a-zA-Z0-9]+)((?:\.[\w-]+)+)?\s*(["'])([^"']+)\3\s*->\s*(["'])([^"']+)\5;?$/
    );
    if (inlineLinkMatch) {
      const tag = inlineLinkMatch[1];
      const classes = inlineLinkMatch[2]
        ? inlineLinkMatch[2].substring(1).replace(/\./g, " ")
        : "";
      const text = inlineLinkMatch[4];
      const href = inlineLinkMatch[6];
      return `<${tag}${
        classes ? ` class="${classes}"` : ""
      } href="${href}">${text}</${tag}>`;
    }

    // This new helper function will be used by the following regex blocks
    const parseModifiers = (modifiers, tag) => {
      let id = "";
      const classes = [];
      if (modifiers) {
        const parts = modifiers.split(/(?=[.#])/);
        parts.forEach((part) => {
          if (part.startsWith("#")) {
            if (id)
              throw new Error(
                `Syntax Error: Multiple IDs are not allowed on tag '${tag}'.`
              );
            id = part.substring(1);
          } else if (part.startsWith(".")) {
            classes.push(part.substring(1));
          }
        });
      }
      return { id, classes };
    };

    // UPDATED REGEX: Now accepts both single and double quotes for content
    const flexibleTagMatch = line.match(
      /^([a-zA-Z0-9]+)((?:[.#][\w-]+)*)?(?:\s*\((.*?)\))?(?:\s*(["'])(.*?)\4)?(\s*\{)?/
    );

    if (flexibleTagMatch) {
      const tag = flexibleTagMatch[1];
      const modifiers = flexibleTagMatch[2] || "";
      const attrContent = flexibleTagMatch[3] || "";
      const rawContent = flexibleTagMatch[5] || ""; // flexibleTagMatch[4] is the quote
      const isBlock = !!flexibleTagMatch[6];

      const { id, classes } = parseModifiers(modifiers, tag);

      // The new parseAttributes method is called here.
      let attrString = this.parseAttributes(attrContent);

      // Combine modifiers (id, class) with parsed attributes
      let finalClasses = classes.join(" ");
      const classAttrMatch = attrString.match(/class="([^"]*)"/);
      if (classAttrMatch) {
        finalClasses = `${finalClasses} ${classAttrMatch[1]}`.trim();
        attrString = attrString.replace(classAttrMatch[0], "");
      }

      let finalAttrs = "";
      if (id) finalAttrs += ` id="${id}"`;
      if (finalClasses) finalAttrs += ` class="${finalClasses}"`;
      finalAttrs += attrString;

      // Interpolate variables on the raw content *before* creating the tag.
      const interpolatedContent = this.interpolateVariables(rawContent);

      if (this.voidTags.includes(tag.toLowerCase())) {
        return `<${tag}${finalAttrs}>`;
      }

      if (isBlock) {
        this.openBlocks.push(tag);
        return `<${tag}${finalAttrs}>`;
      }

      return interpolatedContent
        ? `<${tag}${finalAttrs}>${interpolatedContent}</${tag}>`
        : `<${tag}${finalAttrs}></${tag}>`;
    }

    return line;
  }
  parseVoidTagAttributes(content) {
    // Split by commas but respect quoted values
    const attrs = this.safeSplitAttributes(content);
    let attrString = "";

    attrs.forEach((attr) => {
      if (!attr) return;

      // Handle both equals and colon syntax for attributes
      if (attr.includes("=") || attr.includes(":")) {
        let key, value, valueParts;

        if (attr.includes("=")) {
          [key, ...valueParts] = attr.split("=");
          value = valueParts.join("=").trim();
        } else if (attr.includes(":")) {
          [key, ...valueParts] = attr.split(":");
          value = valueParts.join(":").trim();
        }

        // Remove surrounding quotes if present (both single and double)
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Convert shorthand attribute names
        let attrKey = key.trim();
        if (attrKey === "w") attrKey = "width";
        if (attrKey === "h") attrKey = "height";
        if (attrKey === "cls") attrKey = "class"; // common shorthand
        if (attrKey === "srcset") value = value.replace(/\s+/g, " "); // clean srcset spacing

        attrString += ` ${attrKey}="${value}"`;
      } else {
        // Boolean attributes like "disabled", "checked", etc.
        const key = attr.trim();
        if (key) {
          attrString += ` ${key}`;
        }
      }
    });

    return attrString;
  }

  safeSplitAttributes(content) {
    const parts = [];
    let current = "";
    let insideQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : null;

      // Handle quote detection (only if not escaped)
      if ((char === '"' || char === "'") && prevChar !== "\\") {
        if (!insideQuotes) {
          // Start new quoted section
          insideQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          // Close current quoted section
          insideQuotes = false;
          quoteChar = null;
        }
      }

      if (char === "," && !insideQuotes) {
        // Split only when outside quotes
        parts.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current.trim());
    }

    return parts;
  }

  parseAttributes(attrString) {
    if (!attrString.trim()) return "";
    const attrs = this.safeSplitAttributes(attrString);
    let finalAttrString = "";
    const booleanAttributes = [
      "disabled",
      "checked",
      "selected",
      "required",
      "readonly",
      "multiple",
      "autofocus",
      "novalidate",
      "formnovalidate",
      "hidden",
    ];

    attrs.forEach((attr) => {
      let key, value;
      const eqIndex = attr.indexOf("=");
      if (eqIndex > -1) {
        key = attr.substring(0, eqIndex).trim();
        value = attr.substring(eqIndex + 1).trim();
      } else {
        key = attr.trim();
        value = null;
      }

      // --- NEW: @show directive handling ---
      if (key === "@show") {
        const expression = value.replace(/^\{|\}$/g, "").trim();
        if (expression) {
          // Evaluate initial visibility on the server
          const shouldShow = this.evaluateExpression(expression);
          if (!shouldShow) {
            finalAttrString += " hidden";
          }

          // Add data-attributes for client-side reactivity
          const dependencies = this.getDependencies(expression);
          if (dependencies.length > 0) {
            finalAttrString += ` data-anix-show-expression="${expression.replace(
              /"/g,
              "&quot;"
            )}"`;
            finalAttrString += ` data-anix-show-deps="${dependencies.join(
              ","
            )}"`;
          }
        }
        return; // Go to the next attribute
      }
      // --- End of @show handling ---

      let attrKey = key;
      if (attrKey.startsWith("@")) attrKey = "on" + attrKey.substring(1);
      if (attrKey === "w") attrKey = "width";
      if (attrKey === "h") attrKey = "height";

      if (value === null) {
        if (booleanAttributes.includes(attrKey))
          finalAttrString += ` ${attrKey}`;
        return;
      }

      const rawValue = value.replace(/^["']|["']$/g, "");

      // Check if the entire attribute is a single expression like `disabled="{{...}}"`
      const singleExpressionMatch = rawValue.match(/^\{\{(.*)\}\}$/);

      if (singleExpressionMatch) {
        const expression = singleExpressionMatch[1].trim();
        const evaluatedValue = this.evaluateExpression(expression);

        // Correctly handle boolean attributes based on the expression's result.
        if (booleanAttributes.includes(attrKey)) {
          // If the expression evaluates to a truthy value, add the attribute name.
          // Otherwise, omit the attribute entirely.
          if (evaluatedValue) {
            finalAttrString += ` ${attrKey}`;
          }
        } else {
          // For non-boolean attributes, render the key="value".
          finalAttrString += ` ${attrKey}="${String(evaluatedValue).replace(
            /"/g,
            "&quot;"
          )}"`;
        }
      } else {
        // For attributes with mixed content (e.g., class="base {{...}}"),
        // interpolate the expressions within the string.
        const interpolatedValue = rawValue.replace(
          /\{\{\s*(.*?)\s*\}\}/g,
          (match, expression) => {
            const val = this.evaluateExpression(expression);
            return val !== undefined ? String(val) : match;
          }
        );
        finalAttrString += ` ${attrKey}="${interpolatedValue.replace(
          /"/g,
          "&quot;"
        )}"`;
      }
    });
    return finalAttrString;
  }
}
class AnixParserWithState extends AnixParser {
  constructor(viewsPath) {
    super(viewsPath);

    // Reactive state management
    this.state = {}; // Reactive state store
    this.stateSubscribers = {}; // Element subscribers for each state key
    this.stateId = 0; // Unique ID generator for state elements

    // Add new regex patterns for state commands
    this.stateRegex = /^state\s+(\w+)\s*=\s*(.*)$/;
    this.bindRegex = /^bind\s+(\w+)\s+to\s+(.+)$/;
    this.watchRegex = /^watch\s+(\w+)\s*\{$/;
    this.computedRegex = /^computed\s+(\w+)\s*=\s*(.*)$/;
    // MODIFICATION: Changed to 'foreach'
    this.foreachRegex = /^foreach\s+(\w+)\s+in\s+([\w.]+)\s*\{/;
  }
  // Add this new method inside the AnixParserWithState class

  // 1. REACTIVE STATE - Like useState but auto-updates DOM
  parseReactiveState(line) {
    const stateMatch = line.match(this.stateRegex);
    if (!stateMatch) return null;

    const [, stateName, initialValue] = stateMatch;

    // Parse initial value (reuse existing logic)
    let parsedValue = this.parseStateValue(initialValue.trim());

    // Create reactive state
    this.createReactiveState(stateName, parsedValue);

    return ""; // No immediate HTML output
  }

  parseStateValue(value) {
    // Reuse your existing value parsing logic
    if (value.match(/^["'].*["']$/)) {
      return value.slice(1, -1);
    } else if (value.match(/^\d+$/)) {
      return parseInt(value);
    } else if (value.match(/^\d*\.\d+$/)) {
      return parseFloat(value);
    } else if (value === "true") {
      return true;
    } else if (value === "false") {
      return false;
    } else if (value.startsWith("[") || value.startsWith("{")) {
      try {
        return eval(`(${value})`);
      } catch (e) {
        throw new Error(`Invalid state value: ${value}`);
      }
    }
    return this.resolveVariable(value) || value;
  }

  createReactiveState(stateName, initialValue) {
    this.state[stateName] = initialValue;
    this.stateSubscribers[stateName] = new Set();

    // Also add to regular variables for backward compatibility
    this.variables[stateName] = initialValue;
  }

  // Update state and trigger re-renders
  updateState(stateName, newValue) {
    if (!(stateName in this.state)) return;
    const oldValue = this.state[stateName];
    this.state[stateName] = newValue;
    this.variables[stateName] = newValue;
    // Trigger a full re-render of the page/template here!
    this.render();

    // Trigger updates for subscribed elements
    this.notifyStateSubscribers(stateName, newValue, oldValue);
  }

  notifyStateSubscribers(stateName, newValue, oldValue) {
    const subscribers = this.stateSubscribers[stateName];
    if (!subscribers) return;

    // Generate update script
    let updateScript = `
    <script>
    (function() {
      const stateValue = ${JSON.stringify(newValue)};
      const stateName = '${stateName}';
      
      // Update all elements bound to this state
      document.querySelectorAll('[data-state-bind="' + stateName + '"]').forEach(el => {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.type === 'checkbox') {
            el.checked = !!stateValue;
          } else {
            el.value = stateValue;
          }
        } else {
          el.textContent = stateValue;
        }
      });
      
      // Update computed states that depend on this
      window.anixUpdateComputed && window.anixUpdateComputed('${stateName}');
    })();
    </script>`;

    return updateScript;
  }

  // 2. TWO-WAY DATA BINDING
  parseBinding(line) {
    const bindMatch = line.match(this.bindRegex);
    if (!bindMatch) return null;

    const [, stateName, elementSelector] = bindMatch;

    if (!(stateName in this.state)) {
      throw new Error(`Cannot bind to undefined state: ${stateName}`);
    }

    return `
    <script>
    (function() {
      const element = document.querySelector('${elementSelector}');
      const stateName = '${stateName}';
      
      if (element) {
        // Set initial value
        const initialValue = ${JSON.stringify(this.state[stateName])};
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          if (element.type === 'checkbox') {
            element.checked = !!initialValue;
          } else {
            element.value = initialValue;
          }
        } else {
          element.textContent = initialValue;
        }
        
        // Add state binding attribute
        element.setAttribute('data-state-bind', stateName);
        
        // Add event listeners for two-way binding
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.addEventListener('input', function() {
            let newValue = this.value;
            
            // Type conversion
            if (this.type === 'number') {
              newValue = parseFloat(newValue) || 0;
            } else if (this.type === 'checkbox') {
              newValue = this.checked;
            }
            
            // Update state (you'd need to implement state update mechanism)
            window.anixUpdateState && window.anixUpdateState(stateName, newValue);
          });
        }
      }
    })();
    </script>`;
  }

  // 3. COMPUTED PROPERTIES
  parseComputed(line) {
    const computedMatch = line.match(this.computedRegex);
    if (!computedMatch) return null;

    const [, computedName, expression] = computedMatch;

    // Store computed expression
    this.computed = this.computed || {};
    this.computed[computedName] = expression.trim();

    // Calculate initial value
    const initialValue = this.evaluateComputed(expression.trim());
    this.createReactiveState(computedName, initialValue);

    return `
    <script>
    // Register computed property
    window.anixComputed = window.anixComputed || {};
    window.anixComputed['${computedName}'] = function() {
      ${this.convertExpressionToJS(expression.trim())}
    };
    
    // Update computed when dependencies change
   window.anixComputedDeps = window.anixComputedDeps || {};
    window.anixComputedDeps['${computedName}'] = ${JSON.stringify(
      this.getDependencies(expression.trim())
    )};

    // The global update function will now handle this
    window.anixUpdateComputed = window.anixUpdateComputed || function(changedState) {
      for (const [computedName, deps] of Object.entries(window.anixComputedDeps)) {
        if (deps.includes(changedState)) {
          const newValue = window.anixComputed[computedName]();
          window.anixUpdateState(computedName, newValue, true); // Update state and UI
        }
      }
    };
    </script>`;
  }

  evaluateComputed(expression) {
    // Create a list of all variable names and values from the current state
    // to create a safe "sandbox" for the evaluation.
    const scopeVarNames = Object.keys(this.state);
    const scopeVarValues = Object.values(this.state);

    try {
      // The Function constructor creates a new function in the global scope,
      // which is safer than using eval(). We pass our state variables
      // as arguments to this new function, giving the expression a clean context to run in.
      const evaluator = new Function(
        ...scopeVarNames,
        `'use strict'; return ${expression};`
      );

      // Execute the function, passing the state values as arguments.
      return evaluator(...scopeVarValues);
    } catch (e) {
      // If the expression is invalid, throw a detailed, formatted error.
      this.throwError(
        `Could not evaluate computed expression: "${expression}". Reason: ${e.message}`,
        expression
      );
      return undefined; // Return a consistent 'nothing' value on failure.
    }
  }

  convertExpressionToJS(expression) {
    // Convert Anix expression to JavaScript
    let jsExpression = expression;
    for (const stateName of Object.keys(this.state)) {
      const regex = new RegExp(`\\b${stateName}\\b`, "g");
      jsExpression = jsExpression.replace(
        regex,
        `window.anixState.${stateName}`
      );
    }
    return `return ${jsExpression};`;
  }
  getDependencies(expression) {
    const dependencies = new Set();
    for (const stateName of Object.keys(this.state)) {
      const regex = new RegExp(`\\b${stateName}\\b`, "g");
      if (expression.match(regex)) {
        dependencies.add(stateName);
      }
    }
    return Array.from(dependencies);
  }
  // 4. WATCHERS - React to state changes
  parseWatcher(line, lines, currentIndex) {
    const watchMatch = line.match(this.watchRegex);
    if (!watchMatch) return null;

    const [, stateName] = watchMatch;

    // Find watcher body
    let braceDepth = 1;
    let endIndex = currentIndex + 1;
    const watcherBody = [];

    while (endIndex < lines.length && braceDepth > 0) {
      const currentLine = lines[endIndex]; // Don't trim here, preserve indentation
      braceDepth += (currentLine.match(/\{/g) || []).length;
      braceDepth -= (currentLine.match(/\}/g) || []).length;

      if (braceDepth > 0) {
        watcherBody.push(currentLine);
      } else {
        const closingBraceIndex = currentLine.lastIndexOf("}");
        if (closingBraceIndex > 0) {
          watcherBody.push(currentLine.substring(0, closingBraceIndex));
        }
      }
      endIndex++;
    }

    // Convert Anix state references to window.anixState for use in the browser
    const watcherCode = watcherBody
      .join("\n")
      .replace(/\b(\w+)\b/g, (match, varName) => {
        if (this.state[varName] !== undefined) {
          return `window.anixState.${varName}`;
        }
        return match;
      });

    // --- THIS IS THE FIX ---
    // Instead of overwriting the watcher, we add it to an array of watchers.
    return {
      html: `
      <script>
      (function() {
        window.anixWatchers = window.anixWatchers || {};
        if (!window.anixWatchers['${stateName}']) {
            window.anixWatchers['${stateName}'] = [];
        }
        if (!Array.isArray(window.anixWatchers['${stateName}'])) {
            window.anixWatchers['${stateName}'] = [window.anixWatchers['${stateName}']];
        }

        const newWatcher = function(newValue, oldValue) {
          ${watcherCode}
        };

        window.anixWatchers['${stateName}'].push(newWatcher);
      })();
      </script>`,
      skipToIndex: endIndex - 1,
    };
  }

  // Ensure this is your parseForeach method.
  parseForeach(line, lines, currentIndex) {
    const foreachMatch = line.match(this.foreachRegex);
    if (!foreachMatch) return null;

    const [, itemVar, arrayVar] = foreachMatch;

    if (this.state[arrayVar] === undefined) {
      this.throwError(
        `The array "${arrayVar}" used in foreach must be a reactive state variable.`,
        line
      );
    }

    let braceDepth = 1;
    let endIndex = currentIndex + 1;
    const loopBodyLines = [];
    while (endIndex < lines.length) {
      const currentLine = lines[endIndex];
      braceDepth += (currentLine.match(/\{/g) || []).length;
      braceDepth -= (currentLine.match(/\}/g) || []).length;

      if (braceDepth > 0) {
        loopBodyLines.push(currentLine);
      } else {
        const lastBraceIndex = currentLine.lastIndexOf("}");
        const contentBeforeBrace = currentLine.substring(0, lastBraceIndex);
        if (contentBeforeBrace.trim()) {
          loopBodyLines.push(contentBeforeBrace);
        }
        break;
      }
      endIndex++;
    }

    if (braceDepth > 0) {
      this.throwError(`Unclosed foreach block.`, line);
    }

    const rawAnixTemplate = JSON.stringify(loopBodyLines.join("\n").trim());

    const loopId = `anix-loop-${Math.random().toString(36).substr(2, 9)}`;
    const containerId = `anix-container-${loopId}`;

    let html = `<div id="${containerId}" data-anix-loop-source="${arrayVar}"></div>`;

    html += `
<script>
(function() {
    const container = document.getElementById('${containerId}');
    const arrayName = '${arrayVar}';
    const itemName = '${itemVar}';
    const anixTemplate = ${rawAnixTemplate};

    // This is a minimal client-side Anix parser. It's simple but effective for foreach blocks.
    const parseAnixBlock = (anixBlock) => {
        const lines = anixBlock.split("\\n");
        let html = '';
        const openTags = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed === '}') {
                if (openTags.length > 0) html += \`</\${openTags.pop()}>\`;
                continue;
            }

            const match = trimmed.match(/^([a-zA-Z0-9]+)((?:[.#][\\w-]+)*)?(?:\\(([^)]*)\\))?\\s*(?:"([^"]*)"|'([^']*)')?\\s*(\\{)?$/);

            if (match) {
                const [, tag, modifiers, attrs, doubleQuotedContent, singleQuotedContent, isBlock] = match;
                const content = doubleQuotedContent || singleQuotedContent || '';

                let tagHtml = '<' + tag;
                if (modifiers) {
                    const ids = (modifiers.match(/#([\\w-]+)/g) || []).map(m => m.substring(1));
                    const classes = (modifiers.match(/\\.([\\w-]+)/g) || []).map(m => m.substring(1));
                    if (ids.length > 0) tagHtml += ' id="' + ids[0] + '"';
                    if (classes.length > 0) tagHtml += ' class="' + classes.join(' ') + '"';
                }
                if (attrs) {
                    const attrParts = attrs.split(',').map(a => a.trim());
                    for (const part of attrParts) {
                        const [key, ...val] = part.split('=');
                        if (key) {
                           tagHtml += \` \${key}="\${val.join('=').replace(/^["']|["']$/g, '')}"\`;
                        }
                    }
                }
                tagHtml += '>';

                if (content) tagHtml += content;

                if (isBlock) {
                    openTags.push(tag);
                } else {
                    tagHtml += \`</\${tag}>\`;
                }
                html += tagHtml;
            }
        }
        while(openTags.length > 0) html += \`</\${openTags.pop()}>\`;
        return html;
    };

    const renderLoop = () => {
        if (!container) return;
        const dataArray = window.anixState[arrayName] || [];
        let finalHtml = '';

        dataArray.forEach((item, index) => {
            // =================================================================
            // START OF FIX: This logic now evaluates expressions.
            // =================================================================
            
            // Create a temporary scope for evaluation.
            // It includes all global states, plus the current loop item (e.g., 'todo').
            const localScope = { ...window.anixState };
            localScope[itemName] = item;
            localScope[itemName + '_index'] = index; // Also add helper variables
            
            // Use a regex to find all {{...}} expressions in the template.
            let renderedTemplate = anixTemplate.replace(/\\{\\{\\s*(.*?)\\s*\\}\\}/g, (match, expression) => {
                // Evaluate the found expression within the local scope.
                const value = window.anixEvaluateExpression(expression, localScope);
                // Return the evaluated value, defaulting to an empty string.
                return value !== undefined ? value : '';
            });
            
            // =================================================================
            // END OF FIX
            // =================================================================

            finalHtml += parseAnixBlock(renderedTemplate);
        });
        container.innerHTML = finalHtml;
    };

    // Register the renderLoop as a watcher for the array
    if (!window.anixWatchers) window.anixWatchers = {};
    if (!window.anixWatchers[arrayName]) window.anixWatchers[arrayName] = [];
    if (!Array.isArray(window.anixWatchers[arrayName])) {
        window.anixWatchers[arrayName] = [window.anixWatchers[arrayName]];
    }
    window.anixWatchers[arrayName].push(renderLoop);

    // Initial render on page load
    document.addEventListener('DOMContentLoaded', renderLoop);
})();
</script>
`;
    return { html, skipToIndex: endIndex };
  }
  // This method now correctly handles reactive text interpolation.
  interpolateVariables(text) {
    // MODIFIED: Use a more general regex to capture any expression.
    const regex = /\{\{\s*(.*?)\s*\}\}/g;

    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) {
      return text; // No interpolations, return as is.
    }

    // MODIFIED: Smarter dependency checking.
    const availableStateKeys = Object.keys(this.state);
    const allDependencies = new Set();

    matches.forEach((match) => {
      const expression = match[1]; // e.g., "isValid ? 'Yes' : 'No'"
      availableStateKeys.forEach((stateKey) => {
        // Use a regex to find the state key as a whole word to avoid partial matches.
        const keyRegex = new RegExp(`\\b${stateKey}\\b`);
        if (expression.match(keyRegex)) {
          allDependencies.add(stateKey);
        }
      });
    });

    // Use the powerful `evaluateExpression` from the base class for initial rendering.
    const initialText = super.interpolateVariables(text);

    // If no reactive state is involved, just return the statically rendered text.
    if (allDependencies.size === 0) {
      return initialText;
    }

    // Get all unique state variables this text depends on.
    const stateDependencies = [...allDependencies];

    // Return a single span that wraps the content for client-side reactivity.
    return `<span class="anix-text-binding" data-states="${stateDependencies.join(
      ","
    )}" data-template="${text.replace(/"/g, "&quot;")}">${initialText}</span>`;
  }

  // Override the main parseLine to include state management
  parseLine(line) {
    // Check for state management commands first
    const stateResult = this.parseReactiveState(line);
    if (stateResult !== null) return stateResult;

    const bindResult = this.parseBinding(line);
    if (bindResult !== null) return bindResult;

    const computedResult = this.parseComputed(line);
    if (computedResult !== null) return computedResult;

    // Call parent parseLine, which will now use our corrected parsing order.
    return super.parseLine(line);
  }

  processLine(lines, i) {
    let line = lines[i].trim();

    // Handle state commands FIRST
    const stateResult = this.parseReactiveState(line);
    if (stateResult !== null) {
      return { html: stateResult, newIndex: i };
    }

    const bindResult = this.parseBinding(line);
    if (bindResult !== null) {
      return { html: bindResult, newIndex: i };
    }

    const computedResult = this.parseComputed(line);
    if (computedResult !== null) {
      return { html: computedResult, newIndex: i };
    }

    // Handle NEW foreach directive
    const foreachResult = this.parseForeach(line, lines, i);
    if (foreachResult) {
      return { html: foreachResult.html, newIndex: foreachResult.skipToIndex };
    }

    // Handle watch block
    const watchResult = this.parseWatcher(line, lines, i);
    if (watchResult) {
      return watchResult;
    }

    // Then call super for all other syntax (if, for, tags, etc.)
    return super.processLine(lines, i);
  }

  parseFile(filename) {
    const html = super.parseFile(filename);
    return html + this.generateStateManager();
  }

  // Add support for state management in control structures
  parseIfStatement(line, lines, currentIndex) {
    const initialIfMatch = line.match(/^(?:if|@if)\s+(.+?)\s*\{$/);
    if (!initialIfMatch) return null;

    const blocks = [];
    let chainEndIndex = currentIndex;

    // --- 1. Process the initial `if` block ---
    const ifCondition = initialIfMatch[1];

    // THIS IS THE CORRECTED LINE:
    // Pass 'currentIndex' instead of trying to use 'ifEndIdx' before it exists.
    const { body: ifBody, endIdx: ifEndIdx } = this.findBlock(
      lines,
      currentIndex
    );

    blocks.push({ condition: ifCondition, body: ifBody, isElse: false });
    chainEndIndex = ifEndIdx;

    // --- 2. Process else if and else blocks ---
    let currentPosition = chainEndIndex;
    while (currentPosition < lines.length) {
      const blockEndingLine = lines[currentPosition];
      const nextLine = lines[currentPosition + 1];

      let elseIfMatch, elseMatch;
      let isSameLine = false;
      let consumedNextLine = false;

      // Check for same-line else/elseif
      if (blockEndingLine) {
        const trimmed = blockEndingLine.trim();
        elseIfMatch = trimmed.match(
          /^}\s*(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        elseMatch = trimmed.match(/^}\s*(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) isSameLine = true;
      }

      // Check for next-line else/elseif
      if (!isSameLine && blockEndingLine?.trim() === "}" && nextLine) {
        const trimmed = nextLine.trim();
        elseIfMatch = trimmed.match(
          /^(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        elseMatch = trimmed.match(/^(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) consumedNextLine = true;
      }

      if (elseIfMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const { body, endIdx } = this.findBlock(lines, startOfBlock);
        blocks.push({ condition: elseIfMatch[1], body, isElse: false });
        currentPosition = endIdx;
        chainEndIndex = endIdx;
      } else if (elseMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const { body, endIdx } = this.findBlock(lines, startOfBlock);
        blocks.push({ condition: null, body, isElse: true });
        currentPosition = endIdx;
        chainEndIndex = endIdx;
        break;
      } else {
        break;
      }
    }

    // Check for reactive dependencies
    const allDependencies = new Set();
    let hasReactive = false;

    for (const block of blocks) {
      if (block.condition) {
        const deps = this.getDependencies(block.condition);
        for (const dep of deps) {
          if (this.state[dep] !== undefined) {
            hasReactive = true;
            allDependencies.add(dep);
          }
        }
      }
    }

    if (hasReactive) {
      // Parse all block bodies to HTML
      const blockHTMLs = blocks.map((block) => this.parseBody(block.body));

      // Find initial visible block
      let visibleIndex = -1;
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.isElse) {
          if (visibleIndex === -1) visibleIndex = i;
        } else {
          if (visibleIndex === -1 && this.evaluateCondition(block.condition)) {
            visibleIndex = i;
          }
        }
      }

      // Generate reactive container
      const chainId = `anix-chain-${Math.random().toString(36).slice(2, 11)}`;
      let html = `<div class="anix-conditional-chain" data-chain-id="${chainId}" data-deps="${Array.from(
        allDependencies
      ).join(",")}">\n`;

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const display = i === visibleIndex ? "block" : "none";
        let attrs = `data-block-index="${i}" `;

        if (block.isElse) {
          attrs += 'data-else="true"';
        } else {
          attrs += `data-condition="${block.condition.replace(
            /"/g,
            "&quot;"
          )}"`;
        }

        html += `<div class="anix-conditional-block" ${attrs} style="display:${display}">\n${blockHTMLs[i]}\n</div>\n`;
      }

      html += `</div>`;
      return { html, skipToIndex: chainEndIndex };
    } else {
      // Non-reactive version (original behavior)
      let html = "";
      let conditionMet = false;

      for (const block of blocks) {
        if (block.isElse) {
          if (!conditionMet) {
            html += this.parseBody(block.body);
          }
        } else if (!conditionMet && this.evaluateCondition(block.condition)) {
          html += this.parseBody(block.body);
          conditionMet = true;
        }
      }

      return { html, skipToIndex: chainEndIndex };
    }
  }

  // Helper to find block boundaries
  findBlock(lines, startIdx) {
    let depth = 1;
    const body = [];
    let endIdx = startIdx + 1; // FIX: Start searching from the line AFTER the opening brace.

    while (endIdx < lines.length) {
      // FIX: Loop until the end of the file.
      const currentLine = lines[endIdx];
      depth += (currentLine.match(/\{/g) || []).length;
      depth -= (currentLine.match(/\}/g) || []).length;

      if (depth > 0) {
        body.push(currentLine);
      } else {
        // This is the line with the final closing brace.
        const lastBraceIndex = currentLine.lastIndexOf("}");
        const contentBeforeBrace = currentLine.substring(0, lastBraceIndex);
        if (contentBeforeBrace.trim()) {
          body.push(contentBeforeBrace);
        }
        // Return the body and the index of the line containing the closing brace.
        return { body, endIdx };
      }
      endIdx++;
    }

    // If the loop finishes, the block was never closed.
    this.throwError("Unclosed block.", lines[startIdx]);
  }

  // Global state update function
  generateStateManager() {
    return `
<script>
// Global Anix State Manager
window.anixState = ${JSON.stringify(this.state)};
window.anixWatchers = window.anixWatchers || {};
window.anixComputed = window.anixComputed || {};
window.anixComputedDeps = window.anixComputedDeps || {};
window.anixTextBindings = window.anixTextBindings || new Map();

/**
 * Client-side expression evaluator
 */
window.anixEvaluateExpression = function(expression, state) {
  try {
    const evaluator = new Function(...Object.keys(state), 
      // FIX: Use string concatenation instead of nested template literals
      "'use strict'; try { return (" + expression + ") } catch(e) { return '' }"
    );
    return evaluator(...Object.values(state));
  } catch (e) {
    // FIX: Use string concatenation
    console.error('Anix Error: Could not evaluate "' + expression + '": ' + e.message);
    return "";
  }
};

/**
 * Update all text bindings
 */
function updateTextBindings(changedState) {
  window.anixTextBindings.forEach((binding, element) => {
    if (binding.dependencies.includes(changedState)) {
      const newText = binding.template.replace(/\\{\\{\\s*(.*?)\\s*\\}\\}/g, 
        (match, expr) => window.anixEvaluateExpression(expr, window.anixState));
      element.textContent = newText;
    }
  });
}

/**
 * Update conditional chains
 */
function updateConditionalChains(changedState) {
  document.querySelectorAll('.anix-conditional-chain').forEach(chain => {
    const deps = chain.dataset.deps.split(',');
    if (deps.includes(changedState)) {
      let visibleBlock = null;
      
      chain.querySelectorAll('.anix-conditional-block').forEach(block => {
        if (block.dataset.else === 'true') {
          if (!visibleBlock) visibleBlock = block;
          block.style.display = 'none';
        } else {
          const condition = block.dataset.condition;
          const isTrue = window.anixEvaluateExpression(condition, window.anixState);
          if (isTrue && !visibleBlock) {
            block.style.display = 'block';
            visibleBlock = block;
          } else {
            block.style.display = 'none';
          }
        }
      });
      
      if (visibleBlock) {
        visibleBlock.style.display = 'block';
      }
    }
  });
}

/**
 * Update @show attribute directives
 */
function updateShowDirectives(changedState) {
  document.querySelectorAll('[data-anix-show-deps]').forEach(el => {
    const deps = el.dataset.anixShowDeps.split(',');
    if (deps.includes(changedState)) {
      const expression = el.dataset.anixShowExpression;
      const shouldShow = window.anixEvaluateExpression(expression, window.anixState);
      el.hidden = !shouldShow;
    }
  });
}

/**
 * Update computed properties
 */
window.anixUpdateComputed = function(changedState) {
  for (const [computedName, deps] of Object.entries(window.anixComputedDeps)) {
    if (deps.includes(changedState)) {
      try {
        const newValue = window.anixComputed[computedName]();
        window.anixUpdateState(computedName, newValue, true);
      } catch (e) {
        // FIX: Use string concatenation
        console.error('Error updating computed property ' + computedName + ':', e);
      }
    }
  }
};

/**
 * Main state update function
 */
window.anixUpdateState = function(stateName, newValue, isComputedUpdate = false) {
  const oldValue = window.anixState[stateName];
  
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
  
  window.anixState[stateName] = newValue;
  
  // FIX: Use string concatenation for the selector
  document.querySelectorAll('[data-state-bind="' + stateName + '"]').forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      if (el.type === 'checkbox') {
        el.checked = !!newValue;
      } else if (el.type === 'radio') {
        el.checked = (el.value === newValue);
      } else {
        el.value = newValue;
      }
    } else {
      el.textContent = newValue;
    }
  });
  
  updateTextBindings(stateName);
  updateConditionalChains(stateName);
  updateShowDirectives(stateName);
  
  const watchers = window.anixWatchers[stateName];
  if (watchers) {
    try {
      if (Array.isArray(watchers)) {
        watchers.forEach(watcher => watcher(newValue, oldValue));
      } else {
        watchers(newValue, oldValue);
      }
    } catch (e) {
      // FIX: Use string concatenation
      console.error('Error in watcher for ' + stateName + ':', e);
    }
  }
  
  if (!isComputedUpdate) {
    window.anixUpdateComputed(stateName);
  }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.anix-text-binding').forEach(el => {
    const template = el.dataset.template;
    const dependencies = el.dataset.states.split(',');
    window.anixTextBindings.set(el, { template, dependencies });
    
    const initialText = template.replace(/\\{\\{\\s*(.*?)\\s*\\}\\}/g, 
      (match, expr) => window.anixEvaluateExpression(expr, window.anixState));
    el.textContent = initialText;
  });
  
  document.querySelectorAll('[data-state-bind]').forEach(el => {
    const stateName = el.dataset.stateBind;
    
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      el.addEventListener('input', function() {
        let value;
        if (this.type === 'checkbox') {
          value = this.checked;
        } else if (this.type === 'number') {
          value = parseFloat(this.value) || 0;
        } else {
          value = this.value;
        }
        window.anixUpdateState(stateName, value);
      });
    }
  });
  
  document.querySelectorAll('.anix-conditional-chain').forEach(chain => {
    const deps = chain.dataset.deps.split(',');
    deps.forEach(dep => updateConditionalChains(dep));
  });
  
  document.querySelectorAll('[data-anix-show-deps]').forEach(el => {
    const deps = el.dataset.anixShowDeps.split(',');
    deps.forEach(dep => updateShowDirectives(dep));
  });
  
  for (const computedName in window.anixComputed) {
    try {
      const initialValue = window.anixComputed[computedName]();
      window.anixState[computedName] = initialValue;
      window.anixUpdateState(computedName, initialValue, true);
    } catch (e) {
      // FIX: Use string concatenation
      console.error('Error initializing computed property ' + computedName + ':', e);
    }
  }
});

// Event delegation for dynamic elements
document.addEventListener('click', function(e) {
  const target = e.target;
  if (target.matches('[data-state-bind]')) {
    const stateName = target.dataset.stateBind;
    if (target.dataset.toggle) {
      window.anixUpdateState(stateName, !window.anixState[stateName]);
    }
  }
});
</script>
`;
  }
}

module.exports = AnixParserWithState;
