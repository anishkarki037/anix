const fs = require("fs");
const path = require("path");

class AnixParser {
  constructor(viewsPath) {
    this.viewsPath = viewsPath;
    this.includeRegex = /include\s+"(.+?)";/g;
    this.commentRegex = /^\s*(\/\/|#|###)/;
    this.openBlocks = []; // stack to track open tags
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
    this.insideMultilineScript = false;
    this.scriptContent = "";

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

  parseFile(filename) {
    const filePath = path.join(this.viewsPath, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filename}`);
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
      const command = jsCommandName;
      const selector = jsSelector;
      const content = jsContent.trim();
      const jsCode = this.jsCommands[command];

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

      html += `<script>${generatedJs}</script>\n`;
    }

    // Close any remaining open blocks
    while (this.openBlocks.length > 0) {
      const lastTag = this.openBlocks.pop();
      html += `</${lastTag}>\n`;
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
    return content.replace(this.includeRegex, (match, includeFile) => {
      const includePath = path.join(this.viewsPath, includeFile);
      if (fs.existsSync(includePath)) {
        const includedContent = fs.readFileSync(includePath, "utf-8");
        return this.resolveIncludes(includedContent);
      } else {
        console.warn(`⚠️ Include not found: ${includeFile}`);
        return "";
      }
    });
  }

  parseLine(line) {
    // Detect pre tag for raw text rendering
    const preTagMatch = line.match(
      /^(pre(?:[.#][\w-]+)*)(?:\s*\{)?\s*(["'])([\s\S]*?)\2\s*$/
    );
    if (preTagMatch) {
      // e.g. pre.m-0 "some code here"
      const tag = preTagMatch[1];
      const rawContent = preTagMatch[3];
      // Convert tag to HTML class/id attributes
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

      // Convert escaped \n to actual newlines
      const cleanContent = rawContent.replace(/\\n/g, "\n");
      // Escape HTML special characters to preserve raw content
      const escapedContent = cleanContent
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      // Render raw content as-is without parsing
      return `<pre${attrs}>${escapedContent}</pre>`;
    }
    if (!line || this.commentRegex.test(line)) return "";

    // Custom importjs directive for invoking JS module functions
    const importJsMatch = line.match(
      /^importjs\s+([\w.\/\\-]+)\s*:\s*([\w$]+)\(([^)]*)\);?$/
    );
    if (importJsMatch) {
      const jsPath = importJsMatch[1];
      const funcName = importJsMatch[2];
      const rawArgs = importJsMatch[3];
      let args = [];
      if (rawArgs.trim()) {
        // Split arguments by comma, respecting quotes
        args = this.safeSplitAttributes(rawArgs);
      }
      // Resolve absolute path relative to project root or views/assets/js
      let absPath = jsPath;
      if (!path.isAbsolute(jsPath)) {
        absPath = path.join(process.cwd(), "views", "assets", "js", jsPath);
        if (!fs.existsSync(absPath)) {
          absPath = path.join(process.cwd(), jsPath);
        }
      }
      if (!fs.existsSync(absPath)) {
        return `<!-- importjs: JS file not found: ${jsPath} -->`;
      }
      try {
        const mod = require(absPath);
        if (typeof mod[funcName] === "function") {
          const result = mod[funcName](...args);
          return result;
        } else {
          return `<!-- importjs: Function '${funcName}' not found in ${jsPath} -->`;
        }
      } catch (err) {
        return `<!-- importjs error: ${err.message} -->`;
      }
    }

    // Handle {{functionName}} template directive for server-side rendering
    const templateDirectiveMatch = line.match(/^\{\{\s*([\w$]+)\s*\}\}$/);
    if (templateDirectiveMatch) {
      const funcName = templateDirectiveMatch[1];
      // Try to load from views/assets/js/templates.js
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
          const mod = require(absPath);
          if (typeof mod[funcName] === "function") {
            return mod[funcName]();
          } else {
            return `<!-- template: Function '${funcName}' not found in templates.js -->`;
          }
        } catch (err) {
          return `<!-- template error: ${err.message} -->`;
        }
      } else {
        return `<!-- template: templates.js not found -->`;
      }
    }
    // Check for custom JavaScript commands
    for (const [command, jsCode] of Object.entries(this.jsCommands)) {
      if (line.startsWith(command)) {
        // Format: js:command(selector) { ... }
        const jsMatch = line.match(/^(js:\w+)\(([^)]*)\)\s*\{(.*)\}\s*;?$/);
        if (jsMatch) {
          const selector = jsMatch[2].trim();
          const content = jsMatch[3].trim();

          // Generate appropriate JavaScript based on the command
          let generatedJs = "";

          if (command === "js:ajax") {
            // Special handling for ajax command
            // Format: js:ajax(url) { options }
            generatedJs = `fetch('${selector}', ${content || "{}"})`;
          } else if (command === "js:get" || command === "js:getAll") {
            // Special handling for DOM selection
            generatedJs = `${jsCode}('${selector}')`;
            if (content) {
              generatedJs += `.${content}`;
            }
          } else if (
            command === "js:toggle" ||
            command === "js:addClass" ||
            command === "js:removeClass"
          ) {
            // Special handling for class manipulation
            generatedJs = `document.querySelector('${selector}').${jsCode}('${content}')`;
          } else if (command === "js:wait") {
            // Special handling for wait/timeout
            const timeMatch = selector.match(/(\d+)(ms|s)?/);
            let time = 0;
            if (timeMatch) {
              time = parseInt(timeMatch[1]);
              if (timeMatch[2] === "s") time *= 1000; // Convert seconds to milliseconds
            }
            generatedJs = `${jsCode}\n  ${content}\n}, ${time})`;
          } else {
            // Standard event listener
            generatedJs = `document.querySelector('${selector}').${jsCode}\n  ${content}\n})`;
          }

          return `<script>${generatedJs}</script>`;
        }

        // Simpler format: js:command(selector, param)
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

    // Handle script tag with src attribute
    const scriptSrcMatch = line.match(
      /^script\s*\(src\s*[=:]\s*"([^"]+)"\)\s*$/
    );
    if (scriptSrcMatch) {
      return `<script src="${scriptSrcMatch[1]}"></script>`;
    }

    // Handle single-line script block
    if (line.match(/^script\s*\{.*\}\s*$/)) {
      const scriptContent = line.match(/script\s*\{([\s\S]*)\}$/);
      if (scriptContent && scriptContent[1]) {
        return `<script>${scriptContent[1].trim()}</script>`;
      }
      return "<script></script>";
    }

    if (line.startsWith("script:"))
      return "<script>" + line.replace(/^script:\s*/, "") + "</script>";

    if (line === "}") {
      const closingTag = this.openBlocks.pop() || "div";
      return `</${closingTag}>`;
    }

    // Special case for specific input and img syntax with brackets
    const specificVoidTagMatch = line.match(/<(img|input)>(.+?)<\/\1>/);
    if (specificVoidTagMatch) {
      const tag = specificVoidTagMatch[1];
      const content = specificVoidTagMatch[2];
      return `<${tag}${this.parseVoidTagAttributes(content)}>`;
    }

    const pageMatch = line.match(/^page\s*\["([^"]+)",\s*"([^"]+)"\]\s*\{/);
    if (pageMatch) {
      const title = pageMatch[1];
      const url = pageMatch[2];
      this.openBlocks.push("div");
      return `<div data-page="${title}" data-url="${url}">`;
    }

    // Fixed inlineLinkMatch to handle multiple classes properly
    const inlineLinkMatch = line.match(
      /^([a-zA-Z0-9]+)((?:\.[\w-]+)+)?\s*"([^"]+)"\s*->\s*"([^"]+)";?$/
    );
    if (inlineLinkMatch) {
      const tag = inlineLinkMatch[1];
      const classes = inlineLinkMatch[2]
        ? inlineLinkMatch[2].substring(1).replace(/\./g, " ")
        : "";
      const text = inlineLinkMatch[3];
      const href = inlineLinkMatch[4];
      return `<${tag}${
        classes ? ` class="${classes}"` : ""
      } href="${href}">${text}</${tag}>`;
    }

    // Handle parenthesis syntax for void tags: input(type="text", name="name")
    const voidTagParenMatch = line.match(
      /^([a-zA-Z0-9]+)(#[\w-]+)?((?:\.[\w-]+)*)?(\((?:[^()"]+|"[^"]*")*\))(?:\s*"([^"]*)")?;?$/
    );

    if (
      voidTagParenMatch &&
      this.voidTags.includes(voidTagParenMatch[1].toLowerCase())
    ) {
      const tag = voidTagParenMatch[1];
      const id = voidTagParenMatch[2] ? voidTagParenMatch[2].substring(1) : "";
      const classes = voidTagParenMatch[3]
        ? voidTagParenMatch[3]
            .substring(1) // Remove the first dot
            .split(".")
            .filter((c) => c)
            .join(" ")
        : "";

      const rawAttrs = voidTagParenMatch[4]
        ? voidTagParenMatch[4].slice(1, -1)
        : "";

      let attrString = "";
      if (id) attrString += ` id="${id}"`;
      if (classes) attrString += ` class="${classes}"`;

      // Parse attributes properly
      attrString += this.parseAttributes(rawAttrs);

      return `<${tag}${attrString}>`;
    }

    // Handle nested tag syntax for non-void tags
    const nestedMatch = line.match(
      /^([a-zA-Z0-9]+)((?:\.[\w-]+)*)\s*\((.+)\);?$/
    );
    if (nestedMatch) {
      const outerTag = nestedMatch[1];
      // Fix class handling
      const outerClasses = nestedMatch[2]
        ? nestedMatch[2].substring(1).split(".").filter(Boolean).join(" ")
        : "";
      const rawAttrs = nestedMatch[3];
      let attrString = "";
      if (outerClasses) attrString += ` class=\"${outerClasses}\"`;
      // Parse attributes properly
      attrString += this.parseAttributes(rawAttrs);
      return `<${outerTag}${attrString}></${outerTag}>`;
    }

    // Handle inline void tag syntax: tag>attr="value", attr2="value2"<
    const inlineVoidTagMatch = line.match(
      /^([a-zA-Z0-9]+)(#[\w-]+)?((?:\.[\w-]+)*)?>(.+)<$/
    );
    if (inlineVoidTagMatch) {
      const tag = inlineVoidTagMatch[1];
      const id = inlineVoidTagMatch[2]
        ? inlineVoidTagMatch[2].substring(1)
        : "";
      const classes = inlineVoidTagMatch[3]
        ? inlineVoidTagMatch[3]
            .substring(1) // Remove the first dot
            .split(".")
            .filter((c) => c)
            .join(" ")
        : "";
      const attrContent = inlineVoidTagMatch[4];

      let attrString = "";
      if (id) attrString += ` id="${id}"`;
      if (classes) attrString += ` class="${classes}"`;

      const additionalAttrs = this.parseVoidTagAttributes(attrContent);

      // For void tags, don't add closing tag
      if (this.voidTags.includes(tag.toLowerCase())) {
        return `<${tag}${attrString}${additionalAttrs}>`;
      } else {
        return `<${tag}${attrString}${additionalAttrs}></${tag}>`;
      }
    }

    // Generic tag matching with attributes - fixed regex to handle multiple classes
    const cleanMatch = line.match(
      /^([a-zA-Z0-9]+)(#[\w-]+)?((?:\.[\w-]+)*)?(\((?:[^()"]+|"[^"]*")*\))?(?:\s*"([^"]*)")?(\s*\{)?;?$/
    );
    if (cleanMatch) {
      const tag = cleanMatch[1];
      const id = cleanMatch[2] ? cleanMatch[2].substring(1) : "";
      const classes = cleanMatch[3]
        ? cleanMatch[3]
            .substring(1) // Remove the first dot
            .split(".")
            .filter((c) => c)
            .join(" ")
        : "";
      const rawAttrs = cleanMatch[4] ? cleanMatch[4].slice(1, -1) : "";
      const rawContent = cleanMatch[5] || "";
      const isBlock = !!cleanMatch[6];

      let attrString = "";
      if (id) attrString += ` id="${id}"`;
      if (classes) attrString += ` class="${classes}"`;

      // Parse attributes properly
      attrString += this.parseAttributes(rawAttrs);

      // Handle void tags correctly
      if (this.voidTags.includes(tag.toLowerCase())) {
        return `<${tag}${attrString}>`;
      }

      if (isBlock) {
        this.openBlocks.push(tag);
        return `<${tag}${attrString}>`;
      }

      // Handle normal tags with optional rawContent
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

        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
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

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '"' && content[i - 1] !== "\\") {
        insideQuotes = !insideQuotes;
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
      // Handle both equals and colon syntax for attributes
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

      // Convert shorthand attribute names
      let attrKey = key.trim();
      if (attrKey.startsWith("@")) attrKey = "on" + attrKey.substring(1);
      if (attrKey === "w") attrKey = "width";
      if (attrKey === "h") attrKey = "height";

      // Special handling for style attribute to preserve semicolons
      if (attrKey === "style" && value) {
        // Remove outer quotes if present
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
