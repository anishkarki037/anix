// core-parser.js
const fs = require("fs");
const path = require("path");
const AnixError = require("./error.js");

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
    this.openBlocks = [];
    this.insideMultilineScript = false;
    this.scriptContent = "";
    this.pageName = null;

    this.insideMultilineScript = false;
    this.scriptContent = "";
    this.scriptBlockDepth = 0;

    this.insideMultilineAssignment = false;
    this.multilineVarName = "";
    this.multilineContent = "";
    this.multilineBraceDepth = 0;
    this.multilineBracketDepth = 0;

    this.insidePreBlock = false;
    this.preBlockDepth = 0;
    this.preContent = [];
    this.preAttrs = "";
    this.seoData = {};
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

  loadComponentsFromFile(componentPath) {
    const fullPath = path.join(this.viewsPath, componentPath);
    if (!fs.existsSync(fullPath)) {
      this.throwError(`Component file not found: ${componentPath}`);
    }

    const previousFile = this.currentFile;
    const previousLineNumber = this.currentLineNumber;
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
    this.currentFile = previousFile;
    this.currentLineNumber = previousLineNumber;
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

        // recursive part
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
    const initialIfMatch = line.match(/^(?:if|@if)\s+(.+?)\s*\{$/);
    if (!initialIfMatch) {
      return null;
    }

    let html = "";
    let conditionMet = false;
    let currentPosition = currentIndex;

    const findBlock = (startIdx, originalLine) => {
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
      this.throwError("Unclosed 'if' block.", originalLine);
    };

    const ifCondition = initialIfMatch[1];
    const { body: ifBody, endIdx: ifEndIdx } = findBlock(currentPosition, line);
    if (this.evaluateCondition(ifCondition, line)) {
      conditionMet = true;
      html += this.parseBody(ifBody);
    }
    currentPosition = ifEndIdx;

    // Loop to find and process `else if` and `else` blocks ---
    while (currentPosition < lines.length) {
      const blockEndingLine = lines[currentPosition];
      const nextLine = lines[currentPosition + 1];

      let elseIfMatch, elseMatch;
      let isSameLine = false;
      let consumedNextLine = false;

      if (blockEndingLine) {
        const trimmed = blockEndingLine.trim();
        elseIfMatch = trimmed.match(
          /^}\s*(?:else\s+if|elseif|@elseif|@else\s+if)\s+(.+?)\s*\{$/
        );
        elseMatch = trimmed.match(/^}\s*(?:else|@else)\s*\{$/);
        if (elseIfMatch || elseMatch) isSameLine = true;
      }

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
        const lineForError = isSameLine ? blockEndingLine : nextLine;
        const { body, endIdx } = findBlock(startOfBlock, lineForError);
        if (!conditionMet) {
          const condition = elseIfMatch[1];
          if (this.evaluateCondition(condition, lineForError)) {
            // Pass line for context
            conditionMet = true;
            html += this.parseBody(body);
          }
        }
        currentPosition = endIdx;
      } else if (elseMatch) {
        const startOfBlock = consumedNextLine
          ? currentPosition + 1
          : currentPosition;
        const lineForError = isSameLine ? blockEndingLine : nextLine;
        const { body, endIdx } = findBlock(startOfBlock, lineForError);
        if (!conditionMet) {
          html += this.parseBody(body);
        }
        currentPosition = endIdx;
        break;
      } else {
        break;
      }
    }

    return { html, skipToIndex: currentPosition };
  }

  // Evaluate conditions for if statements
  evaluateCondition(condition, lineContent) {
    try {
      const scopeVarNames = Object.keys(this.variables);
      const scopeVarValues = Object.values(this.variables);
      const evaluator = new Function(
        ...scopeVarNames,
        `'use strict'; return ( ${condition} );`
      );
      return !!evaluator(...scopeVarValues);
    } catch (e) {
      // Now we can throw a detailed error with the exact line.
      this.throwError(
        `Invalid condition expression: "${condition}".\nReason: ${e.message}`,
        lineContent
      );
    }
  }

  parseVariableAssignment(line) {
    const setMatch = line.match(/^set\s+(\w+)\s*=\s*(.*)$/);
    if (!setMatch) return null;

    const [, varName, value] = setMatch;
    let parsedValue = value.trim();

    if (this.isCompleteAssignment(parsedValue)) {
      // Pass the full line for context in case of error.
      return this.processSingleLineAssignment(varName, parsedValue, line);
    } else {
      this.insideMultilineAssignment = true;
      this.multilineVarName = varName;
      this.multilineContent = parsedValue;
      this.multilineBraceDepth =
        (parsedValue.match(/\{/g) || []).length -
        (parsedValue.match(/\}/g) || []).length;
      this.multilineBracketDepth =
        (parsedValue.match(/\[/g) || []).length -
        (parsedValue.match(/\]/g) || []).length;
      return "";
    }
  }

  isCompleteAssignment(value) {
    const braceCount =
      (value.match(/\{/g) || []).length - (value.match(/\}/g) || []).length;
    const bracketCount =
      (value.match(/\[/g) || []).length - (value.match(/\]/g) || []).length;
    return braceCount === 0 && bracketCount === 0;
  }

  // Helper method to process single-line assignments
  processSingleLineAssignment(varName, value, lineContent) {
    let parsedValue;
    try {
      // Use a Function constructor for safer evaluation against the current scope
      const scopeVarNames = Object.keys(this.variables);
      const scopeVarValues = Object.values(this.variables);
      const evaluator = new Function(
        ...scopeVarNames,
        `'use strict'; return (${value});`
      );
      parsedValue = evaluator(...scopeVarValues);
    } catch (e) {
      // If the safe evaluation fails, it's a syntax error.
      this.throwError(
        `Invalid value or expression for variable '${varName}'.\nReason: ${e.message}`,
        lineContent
      );
    }

    this.variables[varName] = parsedValue;
    return "";
  }

  handleMultilineAssignment(line) {
    this.multilineContent += "\n" + line;

    this.multilineBraceDepth +=
      (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    this.multilineBracketDepth +=
      (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length;

    if (this.multilineBraceDepth <= 0 && this.multilineBracketDepth <= 0) {
      const fullContent = this.multilineContent.trim();
      try {
        if (this.isMultilineState) {
          this.processMultilineState(this.multilineVarName, fullContent);
        } else {
          // Provide context for the assignment start for better errors
          const contextLine = `set ${this.multilineVarName} = ${
            fullContent.split("\n")[0]
          }...`;
          this.processSingleLineAssignment(
            this.multilineVarName,
            fullContent,
            contextLine
          );
        }

        this.insideMultilineAssignment = false;
        this.multilineVarName = "";
        this.multilineContent = "";
        this.multilineBraceDepth = 0;
        this.multilineBracketDepth = 0;
        this.isMultilineState = false;
        return "";
      } catch (error) {
        this.insideMultilineAssignment = false;
        this.multilineVarName = "";
        this.multilineContent = "";
        this.multilineBraceDepth = 0;
        this.multilineBracketDepth = 0;
        this.isMultilineState = false;
        // Re-throw the detailed error from processSingleLineAssignment
        throw error;
      }
    }
    return "";
  }

  // Enhanced variable interpolation

  interpolateVariables(text) {
    return text.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, expression) => {
      // Call the new evaluator to get the result
      const value = this.evaluateExpression(expression);
      return value !== undefined ? String(value) : match;
    });
  }

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
  parseComponentAttributes(attrString) {
    const props = {};
    const attrRegex = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? true;
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

    return html;
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
      endIndex--;
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

        const tempParser = new this.constructor(this.viewsPath);
        tempParser.variables = this.variables; // Share variables
        tempParser.components = this.components; // Share components
        tempParser.state = this.state;
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

    const ifCondition = initialIfMatch[1];
    const { body: ifBody, endIdx: ifEndIdx } = findBlock(currentPosition);
    if (this.evaluateCondition(ifCondition)) {
      conditionMet = true;
      html += this.parseBody(ifBody);
    }
    currentPosition = ifEndIdx;

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
        break;
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
        throw new AnixError(
          `Include file not found: ${includeFile}`,
          parentFilePath
        );
      }
    });
  }

  parseLine(line) {
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
      return this.interpolateVariables(line);
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

    const pageMatch = line.match(
      /^page\s*\[(["'])([^"']+)\1,\s*(["'])([^"']+)\3\]\s*\{/
    );
    if (pageMatch) {
      const title = pageMatch[2];
      const url = pageMatch[4];
      this.openBlocks.push("div");
      return `<div data-page="${title}" data-url="${url}">`;
    }

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

    const flexibleTagMatch = line.match(
      /^([a-zA-Z0-9]+)((?:[.#][\w-]+)*)?(?:\s*\((.*)\))?(?:\s*(["'])(.*?)\4)?(\s*\{)?\s*;?$/
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

      const reactiveClassAttrMatch = attrString.match(
        /data-anix-attr-class="([^"]*)"/
      );
      if (reactiveClassAttrMatch) {
        const reactiveTemplate = reactiveClassAttrMatch[1];
        const staticModifierClasses = classes.join(" ");
        const fullTemplate =
          `${staticModifierClasses} ${reactiveTemplate}`.trim();

        // Remove the old data attribute and replace it with the new, complete one.
        attrString = attrString.replace(reactiveClassAttrMatch[0], "");
        finalAttrs += ` data-anix-attr-class="${fullTemplate.replace(
          /"/g,
          "&quot;"
        )}"`;
      }
      finalAttrs += attrString;

      // Interpolate variables on the raw content before creating the tag.
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

      if (key === "@show") {
        // @show directive logic remains the same
        const expression = value.replace(/^\{|\}$/g, "").trim();
        if (expression) {
          const shouldShow = this.evaluateExpression(expression);
          if (!shouldShow) {
            finalAttrString += " hidden";
          }
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
        return;
      }

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
      const expressions = [...rawValue.matchAll(/\{\{(.*?)\}\}/g)];

      // If there are no expressions, handle as a normal static attribute
      if (expressions.length === 0) {
        finalAttrString += ` ${attrKey}="${rawValue.replace(/"/g, "&quot;")}"`;
        return;
      }

      // NEW REACTIVE ATTRIBUTE LOGIC

      // Get the initial value by evaluating all expressions
      const initialValue = rawValue.replace(/\{\{(.*?)\}\}/g, (match, expr) => {
        const val = this.evaluateExpression(expr);
        return val !== undefined ? String(val) : "";
      });
      finalAttrString += ` ${attrKey}="${initialValue.replace(
        /"/g,
        "&quot;"
      )}"`;

      // Find all state dependencies for this attribute
      const dependencies = new Set();
      const allStateKeys = Object.keys(this.state);
      expressions.forEach((match) => {
        const expression = match[1];
        allStateKeys.forEach((stateKey) => {
          if (new RegExp(`\\b${stateKey}\\b`).test(expression)) {
            dependencies.add(stateKey);
          }
        });
      });

      // If dependencies are found, add the data-attributes for client-side reactivity
      if (dependencies.size > 0) {
        // Use the original template in the data-attribute
        finalAttrString += ` data-anix-attr-${attrKey}="${rawValue.replace(
          /"/g,
          "&quot;"
        )}"`;
        finalAttrString += ` data-anix-deps="${Array.from(dependencies).join(
          ","
        )}"`;
      }
    });

    return finalAttrString;
  }
}

module.exports = AnixParser;
