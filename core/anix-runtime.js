export default class Anix {
  /**
   * Creates a new Anix instance for a specific island.
   * @param {HTMLElement} rootElement - The root DOM element of the island.
   * @param {object} initialState - The initial state object for this island.
   */
  constructor(rootElement, initialState = {}) {
    this.root = rootElement;
    this.state = initialState;
    this.watchers = {};
    this.computed = {};
    this.computedDeps = {};
    this.textBindings = new Map();

    // Make state properties directly accessible on the instance (e.g., this.count)
    // for more convenient use in watchers and computed property functions.
    Object.keys(this.state).forEach((key) => {
      Object.defineProperty(this, key, {
        get: () => this.state[key],
        set: (value) => this.updateState(key, value),
      });
    });

    this.initDOM();
  }

  /**
   * Safely evaluates a JavaScript expression within the context of the island's state.
   * @param {string} expression - The JS expression to evaluate.
   * @param {object} scope - The state object to use as the scope.
   * @returns {*} The result of the expression.
   */
  evaluateExpression(expression, scope) {
    try {
      const evaluator = new Function(
        ...Object.keys(scope),
        `'use strict'; try { return (${expression}) } catch(e) { console.error('Expression Error:', e); return '' }`
      );
      return evaluator(...Object.values(scope));
    } catch (e) {
      console.error(
        `Anix Error: Could not evaluate "${expression}": ${e.message}`
      );
      return "";
    }
  }

  /**
   * The core reactive engine. Updates a state property and triggers all necessary UI changes.
   * @param {string} stateName - The name of the state property to update.
   * @param {*} newValue - The new value for the state property.
   * @param {boolean} [isComputedUpdate=false] - A flag to prevent infinite loops with computed properties.
   */
  updateState(stateName, newValue, isComputedUpdate = false) {
    const oldValue = this.state[stateName];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      return; // No change, no need to update
    }

    this.state[stateName] = newValue;

    // Trigger all UI updates, scoped to this island's root element.
    this.updateTextBindings(stateName);
    this.updateAttributeBindings(stateName);
    this.updateConditionalChains(stateName);
    this.updateShowDirectives(stateName);
    this.updateDataBoundElements(stateName);

    // Trigger any watchers for this state property.
    const watchersForState = this.watchers[stateName];
    if (watchersForState) {
      watchersForState.forEach((watcher) =>
        watcher.call(this, newValue, oldValue)
      );
    }

    // If this wasn't a computed property update, check if other computed properties depend on it.
    if (!isComputedUpdate) {
      this.updateComputed(stateName);
    }
  }

  // --- DOM Update Functions ---

  updateTextBindings(changedState) {
    this.textBindings.forEach((binding, element) => {
      if (binding.dependencies.includes(changedState)) {
        const newText = binding.template.replace(
          /\{\{\s*(.*?)\s*\}\}/g,
          (match, expr) => this.evaluateExpression(expr, this.state)
        );
        element.textContent = newText;
      }
    });
  }

  updateAttributeBindings(changedState) {
    this.root
      .querySelectorAll(`[data-anix-deps*="${changedState}"]`)
      .forEach((el) => {
        for (const attr of el.attributes) {
          if (attr.name.startsWith("data-anix-attr-")) {
            const targetAttrName = attr.name.substring(15); // "data-anix-attr-".length
            const template = attr.value;
            const newValue = template.replace(
              /\{\{(.*?)\}\}/g,
              (match, expr) => {
                return this.evaluateExpression(expr, this.state) || "";
              }
            );
            el.setAttribute(targetAttrName, newValue);
          }
        }
      });
  }

  updateConditionalChains(changedState) {
    this.root
      .querySelectorAll(`.anix-conditional-chain[data-deps*="${changedState}"]`)
      .forEach((chain) => {
        let visibleBlock = null;
        chain.querySelectorAll(".anix-conditional-block").forEach((block) => {
          if (block.dataset.else === "true") {
            if (!visibleBlock) visibleBlock = block;
          } else {
            const condition = block.dataset.condition;
            const isTrue = this.evaluateExpression(condition, this.state);
            if (isTrue && !visibleBlock) {
              block.style.display = "";
              visibleBlock = block;
            } else {
              block.style.display = "none";
            }
          }
        });
        // Hide all blocks first, then show the one that should be visible.
        chain
          .querySelectorAll(".anix-conditional-block")
          .forEach((b) => (b.style.display = "none"));
        if (visibleBlock) {
          visibleBlock.style.display = "";
        }
      });
  }

  updateShowDirectives(changedState) {
    this.root
      .querySelectorAll(`[data-anix-show-deps*="${changedState}"]`)
      .forEach((el) => {
        const expression = el.dataset.anixShowExpression;
        el.hidden = !this.evaluateExpression(expression, this.state);
      });
  }

  updateDataBoundElements(changedState) {
    this.root
      .querySelectorAll(`[data-state-bind="${changedState}"]`)
      .forEach((el) => {
        if (
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT"
        ) {
          if (el.type === "checkbox") {
            el.checked = !!this.state[changedState];
          } else if (el.type === "radio") {
            el.checked = el.value === this.state[changedState];
          } else {
            el.value = this.state[changedState];
          }
        }
      });
  }

  updateComputed(changedState) {
    for (const [computedName, deps] of Object.entries(this.computedDeps)) {
      if (deps.includes(changedState)) {
        try {
          const newValue = this.computed[computedName]();
          this.updateState(computedName, newValue, true); // Pass true to avoid recursion
        } catch (e) {
          console.error(`Error updating computed property ${computedName}:`, e);
        }
      }
    }
  }

  // --- Public Methods (called by compiled island scripts) ---

  addWatcher(stateName, callback) {
    if (!this.watchers[stateName]) {
      this.watchers[stateName] = [];
    }
    this.watchers[stateName].push(callback);
  }

  addComputed(computedName, expressionFunc, dependencies) {
    this.computed[computedName] = expressionFunc.bind(this);
    this.computedDeps[computedName] = dependencies;
    // Set initial value
    this.state[computedName] = this.computed[computedName]();
  }

  addBinding(stateName, selector) {
    const element = this.root.querySelector(selector);
    if (element) {
      element.setAttribute("data-state-bind", stateName);
      // Set initial value from state
      this.updateDataBoundElements(stateName);
    }
  }

  // --- Initializer ---

  initDOM() {
    // Setup two-way data binding for input elements within the island
    this.root.querySelectorAll("[data-state-bind]").forEach((el) => {
      const stateName = el.dataset.stateBind;
      el.addEventListener("input", (e) => {
        let value;
        switch (e.target.type) {
          case "checkbox":
            value = e.target.checked;
            break;
          case "number":
            value = parseFloat(e.target.value) || 0;
            break;
          default:
            value = e.target.value;
        }
        this.updateState(stateName, value);
      });
    });

    // Cache all text bindings for efficient updates
    this.root.querySelectorAll(".anix-text-binding").forEach((el) => {
      const template = el.dataset.template;
      const dependencies = el.dataset.states.split(",");
      this.textBindings.set(el, { template, dependencies });
    });

    // Use event delegation for click handlers on the island's root
    this.root.addEventListener("click", (e) => {
      const target = e.target.closest("[on-click]");
      if (target) {
        const expression = target.getAttribute("on-click");
        this.evaluateExpression(expression, this.state);
      }
    });

    // Trigger an initial "update" for all state properties to render
    // computed properties, conditionals, etc., with their initial values.
    Object.keys(this.state).forEach((key) => {
      this.updateState(key, this.state[key]);
    });
  }
}
