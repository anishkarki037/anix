# Anix Framework

Anix is a modern, lightweight UI framework and templating engine designed for rapid web application development. It combines a simple, readable templating syntax with powerful features like reusable components, built-in state management, and seamless JavaScript integration, allowing you to build everything from static sites to dynamic, reactive single-page applications.

---

## Table of Contents

- [Philosophy](#philosophy)
- [Features](#features)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Templating Syntax](#templating-syntax)
  - [Basic Elements](#basic-elements)
  - [Attributes](#attributes)
  - [Nesting](#nesting)
  - [Comments](#comments)
  - [Special Tags](#special-tags)
- [Variables & Data](#variables--data)
  - [Variable Assignment (set)](#variable-assignment-set)
  - [Variable Interpolation](#variable-interpolation)
- [Control Flow](#control-flow)
  - [Conditional Statements (if/else)](#conditional-statements-ifelse)
  - [Loops (for)](#loops-for)
- [Reactivity & State Management](#reactivity--state-management)
  - [State Declaration (state)](#state-declaration-state)
  - [Computed Properties (computed)](#computed-properties-computed)
  - [Watchers (watch)](#watchers-watch)
  - [Reactive Loops (foreach)](#reactive-loops-foreach)
  - [Conditional Rendering (@show)](#conditional-rendering-show)
  - [Two-Way Data Binding](#two-way-data-binding)
- [Components & Includes](#components--includes)
  - [Includes](#includes)
  - [Components](#components)
- [JavaScript Integration](#javascript-integration)
  - [Client-Side Scripting](#client-side-scripting)
  - [Custom JavaScript Commands](#custom-javascript-commands)
  - [Server-Side Scripting (importjs)](#server-side-scripting-importjs)
- [Routing & Page Definition](#routing--page-definition)
- [Advanced Features](#advanced-features)
  - [SEO Blocks](#seo-blocks)
  - [Template Functions](#template-functions)
- [License](#license)

---

## Philosophy

Anix is designed for developers who want to build web applications quickly, with a focus on readable UI code, rapid prototyping, and seamless backend integration. Its syntax is inspired by modern frontend frameworks but remains simple and approachable. Basically, it's built for rapid development with the tools you already know. If you know HTML, CSS, and JavaScript, you can use Anix.

---

## Features

- Intuitive `.anix` file syntax for UI layouts.
- Powerful reactive state management built-in (`state`, `computed`, `watch`).
- Reusable components with props.
- Simple and powerful control flow (`if`, `for`, `foreach`).
- Custom JavaScript event commands (e.g., `js:click`, `js:submit`).
- Server-side function execution with `importjs`.
- File-based routing and easy integration with Node.js.
- SEO-friendly with dedicated `seo` blocks.
- Lightweight with minimal dependencies.

---

## Installation

1.  **Create an Anix app:**
    ```bash
    npx create-anix <your_app_name>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm start
    ```
4.  **Open your browser:**
    Navigate to `http://localhost:3000` (or your configured port).
5.  **Install Anix Extension:**
    Install the Anix extension for syntax highlighting and auto-completion. The `anix.vsix` file is included in your project's root directory.
6.  **Install Snippets:**
    Copy the contents of `anix.code-snippets` into your editor's user snippets file for helpful shortcuts.

---

## Project Structure

```
├── views/            # UI templates (.anix files)
│   ├── components/   # Reusable components
│   └── assets/       # CSS, JS, images
├── core/
│   ├── parser.js     # Anix parser and renderer
│   └── ...
├── backend/          # Backend logic (e.g., Astpoint)
├── package.json      # Project dependencies
└── README.md         # This file
```

---

## Templating Syntax

### Basic Elements

Create HTML elements using their tag name. Add CSS classes with `.` and an ID with `#`.

```anix
// A simple div
div

// A paragraph with a class and an ID
p.intro#first-paragraph

// An h1 tag with text content
h1 "Welcome to Anix!"
```

### Attributes

Provide attributes inside parentheses `()` using comma-separated key-value pairs. You can use shorthands like `w` for `width` and `h` for `height`.

```anix
// Standard attributes
img(src="/images/logo.png", alt="Anix Logo", w=200)

// Boolean attributes
input(type="checkbox", name="terms", checked)

// Shorthand attributes
div(w=100, h=100)
```

#### Event Handler Shorthand (@)
For client-side events, you can use the `@` prefix as a shorthand for `on...` attributes.

```anix
// This:
button(@click="alert('Clicked!')") "Click Me"

// Is equivalent to this standard HTML:
<button onclick="alert('Clicked!')">Click Me</button>
```

### Nesting

Nest elements using indentation with curly braces `{}`.

```anix
div.container {
  h1 "Page Title"
  p {
    span "This is a nested element."
  }
}
```

### Comments

Use `//`, `#`, or `###` for single-line comments. They are ignored by the parser.

```anix
// This is a comment.
# This is also a comment.
h1 "This will be rendered"
```

### Special Tags

-   **Links:** Use the `->` syntax for quick links, or standard `href` attributes.
    ```anix
    a "Go to About" -> "/about"
    // is equivalent to:
    a(href="/about") "Go to About"
    ```
-   **Preformatted Text:** Use the `pre` tag to preserve whitespace and line breaks.
    ```anix
    pre {
      const greet = () => {
        console.log("Hello, Anix!");
      };
    }
    // or for a single line
    pre 'This is preformatted text.'
    ```

---

## Variables & Data

### Variable Assignment (set)

Define variables directly in your template. Anix supports strings, numbers, booleans, arrays, and objects.

```anix
// Single-line assignment
set pageTitle = "My Awesome Site"
set userCount = 50
set isLoggedIn = true
set theme = { primary: 'blue', secondary: 'green' }

// Multi-line assignment for objects/arrays
set user = {
  name: "Alex",
  roles: [
    "admin",
    "editor"
  ]
}
```

### Variable Interpolation

Use `{{ }}` to display variable values in your text content and attributes. Anix can evaluate JavaScript expressions within the braces.

```anix
set user = { name: 'Bob', score: 42 }

h1 "Welcome, {{ user.name }}!"
p "Your score is {{ user.score * 2 }}."

div(class="status-{{ isLoggedIn ? 'active' : 'inactive' }}")
```

---

## Control Flow

### Conditional Statements (if/else)

Render content conditionally. You can use `if`, `else if` (or the alias `elseif`), and `else`. The `@` prefix (`@if`, `@elseif`, `@else`) is also supported.

```anix
set userRole = "admin"

if userRole == "admin" {
  button "Admin Panel"
} elseif userRole == "editor" {
  button "Edit Content"
} else {
  p "You are a viewer."
}
```

### Loops (for)

Iterate over arrays defined with `set`. Inside the loop, you get access to helper variables like `item_index`, `item_first`, and `item_last`.

```anix
set products = ["Laptop", "Mouse", "Keyboard"]

ul {
  for product in products {
    li "Product #{{ product_index }}: {{ product }}"
  }
}
```

---

## Reactivity & State Management

Anix includes a powerful reactivity system for building dynamic user interfaces.

### State Declaration (state)

Declare a reactive state variable. When its value changes, the UI will automatically update.

```anix
state counter = 0
```

### Computed Properties (computed)

Create a new state variable that is derived from other state variables. It will automatically re-evaluate when its dependencies change.

```anix
state price = 10
state quantity = 2
computed total = price * quantity // total is now 20 and reactive
```

### Watchers (watch)

Execute JavaScript code whenever a state variable changes.

```anix
state name = "Guest"

watch name {
  // 'newValue' and 'oldValue' are implicitly available
  console.log('Name changed from ' + oldValue + ' to ' + newValue);
}
```

### Reactive Loops (foreach)

Use `foreach` to create a list that automatically updates when the source array (which must be a `state` variable) is modified.

```anix
state todos = [ {text: 'Learn Anix'}, {text: 'Build something cool'} ]

ul {
  foreach todo in todos {
    li "{{ todo.text }}"
  }
}
```

### Conditional Rendering (@show)

Show or hide an element based on a reactive expression.

```anix
state showDetails = false

// The div will have the 'hidden' attribute until showDetails is true
div(@show={ showDetails }) {
  p "Here are the secret details!"
}
```

### Two-Way Data Binding

Anix creates a link between state and form inputs.

```anix
state username = "Alex"

// The input's value will update when 'username' changes,
// and 'username' will update when the user types in the input.
input(type="text", data-state-bind="username")

// Display the state
p "Hello, {{ username }}!"
```

---

## Components & Includes

### Includes

Use `include` to insert another `.anix` file. This is useful for static, reusable parts of the UI like headers and footers.

`views/components/footer.anix`:
```anix
footer "Copyright 2025"
```

Usage in a page:
```anix
div.page-wrapper {
  h1 "Main Content"
  include "components/footer.anix";
}
```

### Components

For more complex, reusable UI with logic, use components.

1.  **Import a component file:**
    `import "./components.anix";`

2.  **Define the component in `components.anix`:**
    ```anix
    // A component takes props (arguments)
    component user-card(name, email) {
      div.card {
        h3 "{{ name }}"
        p "Email: {{ email }}"
      }
    }
    ```

3.  **Use the component in your page:**
    ```anix
    // Pass props like HTML attributes
    <user-card name="Alice" email="alice@example.com" />
    ```

---

## JavaScript Integration

### Client-Side Scripting

Embed JavaScript directly into your pages.

```anix
// Simple one-liner
script: alert('Page loaded!')

// Multi-line block
script {
  console.log('This runs on the client.');
}

// Including an external script
script(src="/assets/js/main.js")
```

### Custom JavaScript Commands

Anix provides shortcuts for common DOM manipulations and events.

```anix
// Event Handlers (click, hover, submit, change, etc.)
js:click("#my-button") {
  console.log('Button was clicked!');
}

// DOM Querying
js:get("#my-element"); // equivalent to document.querySelector
js:getAll(".my-class"); // equivalent to document.querySelectorAll

// DOM Manipulation
js:addClass("#my-div", "active");
js:toggle(".modal", "is-visible");

// Timers
js:wait("500ms") {
  console.log('This appears after a delay.');
}

// AJAX
js:ajax("/api/data", { method: 'POST' });
```

### Server-Side Scripting (importjs)

Execute a Node.js function during the parsing process and inject its return value (e.g., HTML) directly into the page.

`backend/utils.js`:
```javascript
module.exports = {
  generateUserList: (users) => {
    return users.map(user => `<li>${user}</li>`).join('');
  }
};
```

Anix file:
```anix
ul {
  // Calls the function and injects the returned HTML
  importjs "./backend/utils.js": generateUserList(['Alice', 'Bob']);
}
```

---

## Routing & Page Definition

Define your page metadata and URL route at the top of your file. This is used by the Anix dev server for file-based routing.

```anix
page ["Page Title", "/url-slug"] {
  // Rest of your page content
  h1 "This is the Home Page"
}
```

---

## Advanced Features

### SEO Blocks

Define metadata for search engine optimization in a dedicated `seo` block.

```anix
seo {
  title: "My Awesome Anix Page";
  description: "Learn all about the Anix framework here.";
  "og:image": "[https://example.com/image.png](https://example.com/image.png)";
}

page ["Home", "/"] { ... }
```

### Template Functions

Create a `templates.js` file with functions that return HTML, and call them from your Anix files.

`views/assets/js/templates.js`:
```javascript
module.exports = {
  year: () => new Date().getFullYear(),
  copyright: () => `<footer>Copyright {{ year }}</footer>`
};
```

Anix file:
```anix
// This will execute the copyright() function and render its output.
{{ copyright }}
```

---

## License

MIT

Use how ever the f\*ck you like. Help us make this better. We believe in open source. Lets Make Coding Fun
