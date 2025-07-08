# Anix Language Documentation

![Anix Logo](https://via.placeholder.com/150?text=Anix)  
*A Reactive Templating Language for Modern Web Applications*

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Core Syntax](#core-syntax)
4. [Control Structures](#control-structures)
5. [Reactivity System](#reactivity-system)
6. [Components](#components)
7. [JavaScript Integration](#javascript-integration)
8. [Special Blocks](#special-blocks)
9. [Directives](#directives)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)
12. [Examples](#examples)
13. [Limitations](#limitations)
14. [Tooling Support](#tooling-support)

---

## Introduction <a name="introduction"></a>
Anix is a reactive templating language that compiles to HTML and JavaScript. It combines server-side rendering with client-side reactivity, featuring:

- **Concise syntax** for HTML generation
- **Reactive state management** (state, bindings, computed properties)
- **Component-based architecture**
- **Declarative UI patterns**
- **SEO optimization capabilities**

Key principles:
- Write less code for common UI patterns
- Seamless transition between server and client rendering
- Intuitive reactivity without complex frameworks
- Component-based architecture for reusable UI

---

## Getting Started <a name="getting-started"></a>

### Installation
```bash
npm install anix-parser
```

### Basic Usage
```javascript
const { AnixParserWithState } = require('anix-parser');
const parser = new AnixParserWithState('./views');
const html = parser.parseFile('home.anix');
```

### File Structure
```
project/
├── views/
│   ├── home.anix          # Main page
│   ├── components/
│   │   ├── Button.anix    # Reusable component
│   │   └── Card.anix
│   └── layouts/
│       └── main.anix      # Layout wrapper
└── public/                # Compiled output
```

---

## Core Syntax <a name="core-syntax"></a>

### Basic Tags
```anix
// Element with ID and classes
div#main.container "Hello World"

// Self-closing tag
img(src="logo.png", alt="Logo")

// Attributes
a(href="/", title="Home") "Click here"

// Nested elements
div {
  h1 "Title"
  p "Content"
}
```

### Variables & Interpolation
```anix
// Server-side variable
set username = "Alice"
p "Hello {{ username }}"

// Reactive state (client-side)
state counter = 0
button "+1" js:click { counter++ }
```

### Comments
```anix
// Single-line comment

/*
  Multi-line comment
*/
```

---

## Control Structures <a name="control-structures"></a>

### Conditionals
```anix
// Basic if/else
if user.isAdmin {
  button "Delete"
} else {
  p "Access denied"
}

// Else-if support
@if score > 90 {
  p "A"
} @else if score > 80 {
  p "B"
} @else {
  p "C"
}
```

### Loops
```anix
// Array iteration (server-side)
for product in products {
  div "{{ product.name }} - ${{ product.price }}"
}

// Reactive loop (client-side)
foreach item in cartItems {
  li "{{ item.name }} × {{ item.quantity }}"
}
```

---

## Reactivity System <a name="reactivity-system"></a>

### State Management
```anix
// Declare state
state cartItems = []

// Update state
button "Add to Cart" js:click {
  cartItems.push(newItem)
}

// Derived state
computed totalPrice = cartItems.reduce((sum, item) => sum + item.price, 0)
p "Total: ${{ totalPrice }}"
```

### Bindings
```anix
// Two-way binding to input
input(type="text", bind username)

// Binding to other elements
span(bind totalPrice)

// Checkbox binding
input(type="checkbox", bind isActive)
```

### Watchers
```anix
// Watch state changes
watch cartItems {
  if cartItems.length > 5 {
    showAlert("Cart is full!")
  }
}

// Complex watcher
watch searchQuery {
  if searchQuery.length > 2 {
    fetchResults(searchQuery)
  }
}
```

---

## Components <a name="components"></a>

### Component Definition
```anix
// Button.component.anix
component Button(text, color = "blue") {
  button(style="background: {{ color }}", class="btn") {
    "{{ text }}"
    // Slot content
    {{ children }}
  }
}
```

### Component Usage
```anix
// Using component
import "./components/Button"

<Button text="Submit" color="green">
  <i class="icon-check"></i>
</Button>

// With property binding
<Button text="{{ buttonText }}" bind:color="btnColor"/>
```

### Lifecycle Methods
```anix
component Timer(interval=1000) {
  state count = 0
  
  // Lifecycle hooks
  onMount {
    this.timer = setInterval(() => count++, interval)
  }
  
  onUnmount {
    clearInterval(this.timer)
  }
  
  p "Count: {{ count }}"
}
```

---

## JavaScript Integration <a name="javascript-integration"></a>

### Event Handlers
```anix
// Click event
button "Submit" js:click {
  validateForm()
  submitData()
}

// Form submission
form js:submit {
  // Prevent default is automatic
  processForm()
}

// AJAX requests
button "Load Data" js:click {
  js:ajax('/api/data') {
    method: 'GET'
  }
  .then(response => updateUI(response))
}
```

### External JS Integration
```anix
// Import and execute JS function
importjs '../utils.js' : formatDate(timestamp)

p "Created: {{ formatDate(post.timestamp) }}"

// Inline JavaScript
script {
  function calculateTotal(items) {
    return items.reduce((sum, item) => sum + item.price, 0);
  }
  
  computed total = calculateTotal(cartItems)
}
```

---

## Special Blocks <a name="special-blocks"></a>

### SEO Metadata
```anix
seo {
  title: "Home Page";
  description: "Welcome to our amazing website";
  keywords: "anix, framework, web development";
  og:image: "/images/og-home.jpg";
  twitter:card: "summary_large_image";
}
```

### Preformatted Content
```anix
// Code block with syntax highlighting
pre.lang-javascript {
  function hello() {
    console.log("Hello Anix!");
  }
}

// Raw HTML
raw {
  <custom-element>
    This will render as raw HTML
  </custom-element>
}
```

### Script Blocks
```anix
// Inline script
script {
  console.log("Page loaded at", new Date());
}

// External script
script(src="/js/main.js")
```

---

## Directives <a name="directives"></a>

### Conditional Rendering
```anix
// Show/hide element
div @show="isActive" {
  "Visible when active"
}

// Toggle classes
div @class:active="isSelected" "Item"

// Style binding
div @style:display="isVisible ? 'block' : 'none'" "Content"
```

### Dynamic Attributes
```anix
// Class binding
div(class="{{ isActive ? 'active' : '' }} {{ error ? 'error' : '' }}")

// Dynamic styles
div(style="color: {{ textColor }}; font-size: {{ fontSize }}px")

// Attribute interpolation
img(src="{{ user.avatar }}", alt="{{ user.name }}'s avatar")
```

---

## Error Handling <a name="error-handling"></a>

### Error Format
```bash
Anix Parser Error in ./views/home.anix on line 27:
  Variable 'userName' not defined

> p "Welcome back, {{ userName }}"
```

### Common Errors
1. **Undefined Variables**  
   `Variable 'xyz' not defined`

2. **Missing Closing Braces**  
   `Unclosed block for tag 'div'`

3. **Invalid State Operations**  
   `Cannot push to non-array state 'count'`

4. **Component Import Errors**  
   `Component file not found: Button.anix`

### Debugging Tips
```anix
// Debug directive
debug state cartItems

// Console logging
js:click('#debug-btn') {
  console.log("Current state:", state)
}
```

---

## Best Practices <a name="best-practices"></a>

### State Management
```anix
// 👍 Prefer computed properties
computed fullName = firstName + " " + lastName

// 👎 Avoid complex expressions in templates
p "{{ firstName + ' ' + lastName }}"
```

### Component Design
```anix
// 👍 Keep components focused
component UserAvatar(user) {
  img(src="{{ user.avatar }}", alt="{{ user.name }}")
}

// 👎 Avoid mega-components
component UserProfile(user) {
  // ...100 lines of code...
}
```

### Performance
```anix
// 👍 Keyed lists for efficient updates
foreach item in items (key=item.id) {
  // ...
}

// 👎 Avoid expensive operations in templates
p "Total: {{ calculateTotal(items) }}" // Computed is better
```

---

## Examples <a name="examples"></a>

### Todo App
```anix
state todos = []
state newTodo = ""

computed completedCount = todos.filter(t => t.done).length

form js:submit {
  todos.push({text: newTodo, done: false})
  newTodo = ""
}

foreach todo in todos {
  div.todo-item {
    input(type="checkbox", bind todo.done)
    span(class="{{ todo.done ? 'completed' : '' }}") "{{ todo.text }}"
    button js:click { todos = todos.filter(t => t !== todo) } "×"
  }
}

p "Completed: {{ completedCount }}/{{ todos.length }}"
```

### API Data Fetching
```anix
state posts = []
state isLoading = true

onMount {
  js:ajax('/api/posts') {
    method: 'GET'
  }
  .then(data => posts = data)
  .catch(error => showError(error))
  .finally(() => isLoading = false)
}

div @show="isLoading" "Loading..."

foreach post in posts {
  article {
    h2 "{{ post.title }}"
    p "{{ post.excerpt }}"
    a(href="/posts/{{ post.id }}") "Read more"
  }
}
```

---

## Limitations <a name="limitations"></a>
1. **No Built-in Router**  
   Requires integration with Express, Next.js, etc.

2. **Scoped CSS Not Included**  
   Use with CSS modules or separate styling solution

3. **Client Requirements**  
   Reactivity requires JavaScript enabled in browser

4. **Learning Curve**  
   New syntax patterns to learn

---

## Tooling Support <a name="tooling-support"></a>

### VS Code Extension
Install "Anix Language Support" from marketplace for:
- Syntax highlighting
- Autocomplete
- Error diagnostics
- Snippets

### CLI Commands
```bash
# Development server
anix serve

# Production build
anix build

# Lint files
anix lint
```

### Debugging
```bash
# Enable debug mode
DEBUG=anix:* node app.js

# Generate component diagram
anix analyze components
```

---

## Conclusion
Anix provides a powerful yet concise syntax for building modern web applications with built-in reactivity. By combining server-side rendering capabilities with client-side reactivity patterns, it offers a streamlined development experience.

### Resources
- [Official Documentation](https://anix.dev/docs)
- [GitHub Repository](https://github.com/anix-lang/core)
- [Community Forum](https://forum.anix.dev)
- [Starter Templates](https://github.com/anix-lang/starter-kits)

![Anix Workflow](https://via.placeholder.com/800x400?text=Anix+Workflow+Diagram)
