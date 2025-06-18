// parser.js
const fs = require("fs");
const path = require("path");

class AnixParser {
  constructor(viewsPath) {
    this.viewsPath = viewsPath;
    this.components = {}; // Cache for loaded components

    // Regex patterns
    this.includeRegex = /include\s+(["'])(.+?)\1;/g;
    this.importRegex = /^import\s+(['"])(.+?)\1;/;
    this.commentRegex = /^\s*(\/\/|#|###)/;

    // State for parsing
    this.openBlocks = []; // stack to track open tags
    this.insideMultilineScript = false;
    this.scriptContent = "";
    this.pageName = null;

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
      "js:click": "addEventListener('click', function() {",
      "js:hover": "addEventListener('mouseover', function() {",
      "js:leave": "addEventListener('mouseout', function() {",
      "js:submit":
        "addEventListener('submit', function(event) { event.preventDefault(); ",
      "js:change": "addEventListener('change', function() {",
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

  // --- NEW: Method to load and parse a component file ---
  loadComponentsFromFile(componentPath) {
    const fullPath = path.join(this.viewsPath, componentPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Component file not found: ${componentPath}`);
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    let inComponent = false;
    let currentComponent = null;
    let bodyLines = [];
    let braceDepth = 0;

    for (const line of lines) {
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
    this.pageName = null;
    this.components = {}; // Reset components for each new file parse
    const filePath = path.join(this.viewsPath, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Entry file not found: ${filename}`);
    }

    let content = fs.readFileSync(filePath, "utf-8");
    content = this.resolveIncludes(content);

    const lines = content.split("\n");
    let html = "";
    let insideJsCommand = false;
    let jsCommandName = "";
    let jsSelector = "";
    let jsContent = "";
    let jsBlockDepth = 0; // Track nested brackets inside JS blocks

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Extract page name from page declaration - Updated regex
      if (!this.pageName) {
        const pageMatch = line.match(/^page\s*\[\s*(["'])([^"']+)\1/);
        if (pageMatch) {
          this.pageName = pageMatch[2];
        }
      }
      // --- NEW: Handle component imports ---
      const importMatch = line.match(this.importRegex);
      if (importMatch) {
        this.loadComponentsFromFile(importMatch[2]);
        continue; // Don't output any HTML for the import line
      }

      // --- NEW: Handle component usage ---
      const componentUsageMatch = line.match(/^<([\w-]+)\s*([^>]*?)\s*\/>/);
      if (componentUsageMatch) {
        const [, componentName, attrString] = componentUsageMatch;
        if (this.components[componentName]) {
          const component = this.components[componentName];
          const props = this.parseComponentAttributes(attrString);
          let expandedBody = component.body;

          // Replace placeholders like {{prop}} with provided values
          for (const propName of component.props) {
            const value = props[propName] || "";
            const regex = new RegExp(`{{\\s*${propName}\\s*}}`, "g");
            expandedBody = expandedBody.replace(regex, value);
          }

          // Recursively parse the expanded Anix code
          const expandedHtml = expandedBody
            .split("\n")
            .map((l) => this.parseLine(l.trim()))
            .filter(Boolean)
            .join("\n");
          html += expandedHtml + "\n";
          continue; // Move to the next line
        }
      }

      // Detect pre block with opening brace
      if (line.startsWith("pre") && line.endsWith("{")) {
        const preTagMatch = line.match(/^pre((?:[.#][\w-]+)*)\s*\{$/);
        if (preTagMatch) {
          const tagMods = preTagMatch[1];
          let classList = [];
          let idAttr = "";

          tagMods.split(/(?=[.#])/).forEach((part) => {
            if (part.startsWith(".")) classList.push(part.slice(1));
            else if (part.startsWith("#")) idAttr = part.slice(1);
          });

          let attrs = "";
          if (classList.length) attrs += ` class="${classList.join(" ")}"`;
          if (idAttr) attrs += ` id="${idAttr}"`;

          let preContent = "";
          i++; // move to next line

          // Collect lines until closing brace
          while (i < lines.length && lines[i].trim() !== "}") {
            preContent += lines[i].replace(/\\n/g, "\n") + "\n";
            i++;
          }

          // Escape HTML entities
          const escaped = preContent
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

          html += `<pre${attrs}>${escaped.trim()}</pre>\n`;
          continue;
        }
      }
      // Handle generic multiline script block
      if (line.startsWith("script {")) {
        let scriptBlock = "";
        let openBraces = 1;
        i++;

        while (i < lines.length && openBraces > 0) {
          const l = lines[i];
          openBraces += (l.match(/{/g) || []).length;
          openBraces -= (l.match(/}/g) || []).length;

          if (openBraces > 0) scriptBlock += l + "\n";
          i++;
        }

        html += `<script>\n${scriptBlock.trim()}\n</script>\n`;
        i--; // backtrack since loop will increment again
        continue;
      }

      // Handle multiline JS commands
      if (insideJsCommand) {
        // Count opening and closing braces to handle nested structures
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        jsBlockDepth += openBraces - closeBraces;

        if (jsBlockDepth <= 0) {
          // End of JS command found
          const closingBraceIndex = line.lastIndexOf("}");
          jsContent += line.substring(0, closingBraceIndex);

          // Generate appropriate JavaScript based on the command
          let generatedJs = "";
          const command = jsCommandName;
          const selector = jsSelector;
          const content = jsContent.trim();
          const jsCode = this.jsCommands[command];

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
              if (timeMatch[2] === "s") time *= 1000; // Convert seconds to milliseconds
            }
            generatedJs = `${jsCode}\n  ${content}\n}, ${time})`;
          } else {
            generatedJs = `document.querySelector('${selector}').${jsCode}\n  ${content}\n})`;
          }

          html += `<script>${generatedJs}</script>\n`;

          // Process any content after the closing brace
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
          // Still inside JS command
          jsContent += line + "\n";
        }
        continue;
      }

      // Check for start of multiline JS command
      let jsCommandMatch = null;
      for (const command of Object.keys(this.jsCommands)) {
        const regex = new RegExp(`^(${command})\\(([^)]*)\\)\\s*\\{`);
        jsCommandMatch = line.match(regex);

        if (jsCommandMatch) {
          const fullCommand = line;
          const closingBracePos = this.findMatchingClosingBrace(fullCommand);

          // Check if this is a single-line JS command
          if (closingBracePos > -1) {
            // Single line JS command
            const commandName = jsCommandMatch[1];
            const selector = jsCommandMatch[2].trim();
            const contentStart = line.indexOf("{") + 1;
            const content = line
              .substring(contentStart, closingBracePos)
              .trim();

            // Generate JS code
            let generatedJs = "";
            const jsCode = this.jsCommands[commandName];

            if (commandName === "js:ajax") {
              generatedJs = `fetch('${selector}', ${content || "{}"})`;
            } else if (
              commandName === "js:get" ||
              commandName === "js:getAll"
            ) {
              generatedJs = `${jsCode}('${selector}')`;
              if (content) {
                generatedJs += `.${content}`;
              }
            } else if (
              commandName === "js:toggle" ||
              commandName === "js:addClass" ||
              commandName === "js:removeClass"
            ) {
              generatedJs = `document.querySelector('${selector}').${jsCode}('${content}')`;
            } else if (commandName === "js:wait") {
              const timeMatch = selector.match(/(\d+)(ms|s)?/);
              let time = 0;
              if (timeMatch) {
                time = parseInt(timeMatch[1]);
                if (timeMatch[2] === "s") time *= 1000;
              }
              generatedJs = `${jsCode}\n  ${content}\n}, ${time})`;
            } else {
              generatedJs = `document.querySelector('${selector}').${jsCode}\n  ${content}\n})`;
            }

            html += `<script>${generatedJs}</script>\n`;

            // Process any remaining content after the JS command
            const remainingContent = line.substring(closingBracePos + 1).trim();
            if (remainingContent) {
              const parsed = this.parseLine(remainingContent);
              if (parsed) html += parsed + "\n";
            }
          } else {
            // Start of a multi-line JS command
            insideJsCommand = true;
            jsCommandName = jsCommandMatch[1];
            jsSelector = jsCommandMatch[2].trim();
            jsContent = line.substring(line.indexOf("{") + 1) + "\n";
            jsBlockDepth = 1; // We've found one opening brace
          }
          break;
        }
      }

      if (insideJsCommand) continue;

      // Handle multiline script blocks
      if (this.insideMultilineScript) {
        if (line.includes("}")) {
          // End of script block found
          const endBraceIndex = line.indexOf("}");
          this.scriptContent += line.substring(0, endBraceIndex);
          html += `<script>${this.scriptContent.trim()}</script>\n`;

          // Process any content after the closing brace
          const remainingContent = line.substring(endBraceIndex + 1).trim();
          if (remainingContent) {
            const parsed = this.parseLine(remainingContent);
            if (parsed) html += parsed + "\n";
          }

          this.insideMultilineScript = false;
          this.scriptContent = "";
        } else {
          // Still inside script block
          this.scriptContent += line + "\n";
        }
        continue;
      }

      // Check for start of multiline script block
      if (line.startsWith("script {") && !line.includes("}")) {
        this.insideMultilineScript = true;
        this.scriptContent = line.substring("script {".length) + "\n";
        continue;
      }

      const parsed = this.parseLine(line);
      if (parsed) html += parsed + "\n";
    }

    // Handle any unclosed script blocks at EOF
    if (this.insideMultilineScript) {
      html += `<script>${this.scriptContent.trim()}</script>\n`;
      this.insideMultilineScript = false;
      this.scriptContent = "";
    }

    // Handle any unclosed JS command blocks at EOF
    if (insideJsCommand) {
      throw new Error(
        `Unclosed JS command block starting with: ${jsCommandName}('${jsSelector}') {`
      );
    }

    // Close any remaining open blocks
    if (this.openBlocks.length > 0) {
      const openTag = this.openBlocks[this.openBlocks.length - 1];
      throw new Error(
        `Syntax Error: Unclosed block for tag '${openTag}'. A closing '}' is missing.`
      );
    }

    return html;
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

  resolveIncludes(content) {
    const lines = content.split("\n");
    const processedLines = [];
    let insidePreBlock = false;
    let preBlockDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if we're entering a pre block
      if (trimmedLine.startsWith("pre") && trimmedLine.endsWith("{")) {
        insidePreBlock = true;
        preBlockDepth = 1;
        processedLines.push(line);
        continue;
      }

      // If we're inside a pre block, track braces but don't process includes
      if (insidePreBlock) {
        preBlockDepth += (line.match(/\{/g) || []).length;
        preBlockDepth -= (line.match(/\}/g) || []).length;

        if (preBlockDepth <= 0) {
          insidePreBlock = false;
          preBlockDepth = 0;
        }

        processedLines.push(line);
        continue;
      }

      // Only process includes if we're not inside a pre block
      const processedLine = line.replace(
        this.includeRegex,
        (match, quote, includeFile) => {
          const includePath = path.join(this.viewsPath, includeFile);
          if (fs.existsSync(includePath)) {
            const includedContent = fs.readFileSync(includePath, "utf-8");
            return this.resolveIncludes(includedContent);
          } else {
            throw new Error(`Include file not found: ${includeFile}`);
          }
        }
      );

      processedLines.push(processedLine);
    }

    return processedLines.join("\n");
  }

  parseLine(line) {
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
      if (classList.length) attrs += ` class=\"${classList.join(" ")}\"`;
      if (idAttr) attrs += ` id=\"${idAttr}\"`;
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
            generatedJs = `document.querySelector('${selector}').${jsCode}\n  ${content}\n})`;
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
      /^([a-zA-Z0-9]+)((?:[.#][\w-]+)*)?(>.*<|\((?:[^()"']+|["'][^"']*["'])*\))?(?:\s*(["'])([^"']*)\4)?(\s*\{)?;?$/
    );

    if (flexibleTagMatch) {
      const tag = flexibleTagMatch[1];
      const modifiers = flexibleTagMatch[2] || "";
      let attrContent = flexibleTagMatch[3] || "";
      const rawContent = flexibleTagMatch[5] || "";
      const isBlock = !!flexibleTagMatch[6];

      const { id, classes } = parseModifiers(modifiers, tag);

      let attrString = "";
      if (id) attrString += ` id="${id}"`;
      if (classes.length > 0) attrString += ` class="${classes.join(" ")}"`;

      // Handle attributes from different syntax styles
      if (attrContent.startsWith(">")) {
        attrString += this.parseVoidTagAttributes(attrContent.slice(1, -1));
      } else if (attrContent.startsWith("(")) {
        attrString += this.parseAttributes(attrContent.slice(1, -1));
      }

      if (this.voidTags.includes(tag.toLowerCase())) {
        return `<${tag}${attrString}>`;
      }

      if (isBlock) {
        this.openBlocks.push(tag);
        return `<${tag}${attrString}>`;
      }

      return rawContent
        ? `<${tag}${attrString}>${rawContent}</${tag}>`
        : `<${tag}${attrString}></${tag}>`;
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

      // Handle quote detection for both single and double quotes
      if ((char === '"' || char === "'") && content[i - 1] !== "\\") {
        if (!insideQuotes) {
          insideQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          insideQuotes = false;
          quoteChar = null;
        }
      }

      if (char === "," && !insideQuotes) {
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
    let attrString2 = "";
    attrs.forEach((attr) => {
      let key, value, rest;
      if (attr.includes("=")) {
        [key, ...rest] = attr.split("=");
        value = rest.join("=").trim();
      } else if (attr.includes(":")) {
        [key, ...rest] = attr.split(":");
        value = rest.join(":").trim();
      } else {
        key = attr.trim();
        value = "";
      }
      let attrKey = key.trim();
      if (attrKey.startsWith("@")) attrKey = "on" + attrKey.substring(1);
      if (attrKey === "w") attrKey = "width";
      if (attrKey === "h") attrKey = "height";
      if (attrKey === "style" && value) {
        const cleanValue = value.replace(/^["']|["']$/g, "");
        attrString2 += ` ${attrKey}="${cleanValue}"`;
      } else if (value) {
        attrString2 += ` ${attrKey}="${value.replace(/^["']|["']$/g, "")}"`;
      } else {
        attrString2 += ` ${attrKey}`;
      }
    });
    return attrString2;
  }
}

module.exports = AnixParser;
