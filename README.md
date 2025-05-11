# Anix Framework

Anix is a modern, lightweight UI framework and templating engine designed for rapid web application development. It features a simple, readable syntax for building dynamic pages, supports custom JavaScript commands, and integrates easily with backend logic for full-stack projects.

---

## Table of Contents

- [Philosophy](#philosophy)
- [Features](#features)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Templating Syntax](#templating-syntax)
- [Components & Includes](#components--includes)
- [Custom JavaScript Commands](#custom-javascript-commands)
- [Routing](#routing)
- [Backend Integration](#backend-integration)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [License](#license)

---

## Philosophy

Anix is designed for developers who want to build web applications quickly, with a focus on readable UI code, rapid prototyping, and seamless backend integration. Its syntax is inspired by modern frontend frameworks but remains simple and approachable. Basically, it's built for rapid development and working with the tools you already Know. If you know how to use HTML and CSS and JS as additional, you can use Anix.

---

## Features

- Intuitive `.anix` file syntax for UI layouts
- Built-in support for includes and reusable components
- Custom JavaScript event commands (e.g., `js:click`, `js:ajax`)
- File-based routing and easy integration with Node.js
- Rapid prototyping and visual design focus
- Lightweight, minimal dependencies
- Easy to extend and customize

---

## Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url> <your-project-name>
   cd anix-project
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start the development server:**
   ```bash
   npm run dev
   ```
4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000) (or your configured port).

---

## Project Structure

```
├── views/            # UI templates (.anix files)
├── src/
│   ├── parser.js     # Anix parser and renderer
│   ├── compiler.js   # Compilation logic
│   └── dev-server.js # Development server
├── backend/           # Astpoint powered backend
├── package.json      # Project metadata and dependencies
└── README.md         # Project documentation
```

---

## Configuration

- **Parser Configuration:**
  - Located in `parser.config.json` (if present)
  - Controls parsing options, custom commands, and extensions
- **Environment Variables:**
  - Set `PORT` to change the dev server port
  - Use `.env` for custom environment variables

---

## Templating Syntax

Anix uses a concise, block-based syntax for defining UI layouts:

```anix
page ["Home", "/"] {
  include "navbar.anix";
  div.container {
    h1 "Welcome to Anix!"
    p "This is a sample page."
    button.btn "Click Me"
  }
}
```

- **Elements:** Use tag names (`div`, `h1`, etc.) followed by classes/IDs as needed.
- **Text Content:** Place text in quotes after the tag.
- **Attributes:** Use `attr:value` inside the element block.
- **Nesting:** Indent or use braces `{}` for child elements.

### Example: Form with Events

```anix
form#login-form {
  input[type="text" name="username"]
  input[type="password" name="password"]
  button.btn[type="submit"] "Login"
}
js:submit("#login-form") {
  // Custom JS logic here
  alert('Form submitted!');
}
```

---

## Components & Includes

- **Includes:**
  - Use `include "filename.anix";` to insert reusable UI blocks.
- **Components:**
  - Create files in `views/components/` and include them as needed.
  - Pass data via custom attributes or context (see advanced usage).

### Example: Navbar Component

`views/components/navbar.anix`:

```anix
div.navbar {
  a "About" -> "/about"
   **or**
  a(href="./about") "About"
  nav.links {
    a "About" -> "/about"
    a "Docs" -> "/docs"
  }
}
```

Usage in a page:

```anix
include "components/navbar.anix";
```

---

## Custom JavaScript Commands

- **Event Binding:**
  - Use `js:click(".selector") { ... }` to bind JS to UI events.
- **AJAX Example:**
  ```anix
  js:click("#load-btn") {
    fetch('/api/data').then(r => r.json()).then(data => {
      console.log(data);
    });
  }
  ```
- **Multiple Events:**
  - You can define multiple `js:` blocks per page/component.

---

## Routing

- **File-based Routing:**
  - Each `.anix` file in `views/` defines a route.
  - The page declaration: `page ["Title", "/route"] { ... }`
- **Dynamic Routes:**
  - Use parameters in the route string (e.g., `/user/:id`)

---

## Backend Integration

- **Node.js Integration:**
  - Use Anix as a view layer in your Node.js app.
  - Render `.anix` files server-side or serve static HTML.
- **API Calls:**
  - Use `fetch` or AJAX in `js:` blocks to communicate with backend APIs.

---

## Advanced Usage

- **Custom Commands:**
  - Extend the parser with your own commands in `parser.config.json`.
- **Theming:**
  - Use CSS in `views/assets/` or inline `<style>` blocks.
- **State Management:**
  - Pass data from backend to templates via context variables.

---

## Best Practices

- Organize components in `views/components/`
- Use includes for repeated UI blocks
- Keep JS logic in `js:` blocks minimal; delegate complex logic to external scripts
- Use semantic HTML tags for accessibility
- Document custom commands in your project

---

## Troubleshooting

- **Server not starting:**
  - Check Node.js version (>=14 recommended)
  - Ensure dependencies are installed (`npm install`)
- **Page not rendering:**
  - Check for syntax errors in `.anix` files
  - Review console output for error messages
- **Custom JS not working:**
  - Ensure selectors match rendered HTML
  - Check browser console for JS errors

---

## FAQ

**Q: Can I use Anix with Express or other Node.js frameworks?**
A: Yes! Use Anix as a view engine or static site generator.

**Q: How do I add global CSS or JS?**
A: Place files in `views/assets/` and reference them in your templates or HTML head.

**Q: How do I pass data from backend to templates?**
A: Use context variables when rendering pages (see backend integration section).

**Q: Can I use TypeScript?**
A: Yes, but you may need to adjust build scripts and parser config manually, but honestly we would not recommend it now in this release.

---

## License

MIT

## Use how ever the fuck you like.

## Help us make this better. We beleive in open source.
