const stateManagerScript = `
<script>
// Global Anix State Manager
window.anixState = __ANIX_INITIAL_STATE__;
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


function updateAttributeBindings(changedState) {
  document.querySelectorAll("[data-anix-deps]").forEach(el => {
    const deps = el.dataset.anixDeps.split(',');
    if (deps.includes(changedState)) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-anix-attr-')) {
          const targetAttrName = attr.name.substring(15); // "data-anix-attr-".length
          const template = attr.value;
          const newValue = template.replace(/\{\{(.*?)\}\}/g, (match, expr) => {
            return window.anixEvaluateExpression(expr, window.anixState) || '';
          });
          el.setAttribute(targetAttrName, newValue);
        }
      }
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
  updateAttributeBindings(stateName);
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

module.exports = stateManagerScript;
