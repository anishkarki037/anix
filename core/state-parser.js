// state-parser.js
const AnixParser = require("./core-parser.js");
const stateManagerScript = require("./client-state-manager.js");

// All code from 'class AnixParserWithState extends AnixParser {' to the end of the class
// should be pasted here.

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
    const value = initialValue.trim();

    // Leverage the existing assignment completion check
    if (this.isCompleteAssignment(value)) {
      // If it's a complete, single-line assignment, process it.
      const parsedValue = this.parseStateValue(value);
      this.createReactiveState(stateName, parsedValue);
      return ""; // No HTML output
    } else {
      // Otherwise, start the multiline assignment process.
      // We'll hijack the existing multiline logic from the base parser.
      this.insideMultilineAssignment = true;
      this.multilineVarName = stateName;
      this.multilineContent = value;
      // We need to tell the multiline handler to treat this as a state variable
      // once it's finished. A simple flag will do.
      this.isMultilineState = true;

      this.multilineBraceDepth =
        (value.match(/\{/g) || []).length - (value.match(/\}/g) || []).length;
      this.multilineBracketDepth =
        (value.match(/\[/g) || []).length - (value.match(/\]/g) || []).length;

      return ""; // No HTML output yet
    }
  }
  processMultilineState(stateName, content) {
    const parsedValue = this.parseStateValue(content);
    this.createReactiveState(stateName, parsedValue);

    // Reset the flag
    this.isMultilineState = false;
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
    // We override parseFile to ensure the state manager is added at the end.
    // The call to super.parseFile() will execute the entire core parsing logic.
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
    const initialState = JSON.stringify(this.state);
    return stateManagerScript.replace("__ANIX_INITIAL_STATE__", initialState);
  }
}

module.exports = AnixParserWithState;
