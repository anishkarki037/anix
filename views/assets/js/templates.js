// Alternative solution: Convert templates.js to CommonJS format
// templates.js

/**
 * Signup Card Template
 * @returns {string} HTML for signup card
 */
function signupCardTemplate() {
  return `
      <div class="card w-half my-3 signup-card">
        <h2 class="h1 txt-center">Sign Up</h2>
        <form id="signupForm">
         <div class="form-group"> 
              <input class="input mb-2" type="text" name="fullName" placeholder="Full Name" />
          </div>
          <div class="form-group"> 
            <input class="input mb-2" type="text" name="username" placeholder="Username" required />
          </div>
          <div class="form-group"> 
              <input class="input mb-2" type="number" name="age" placeholder="Age" />
          </div>
          <div class="form-group"> 
              <input class="input mb-2" type="email" name="email" placeholder="Email" required />
          </div>
          <div class="form-group"> 
              <input class="input mb-2" type="password" name="password" placeholder="Password" required />
          </div>
          <div class="form-group my-1"> 
             <label><input class="checkbox" type="checkbox" name="terms" required /> Accept Terms</label>
          </div>
          <button class="btn btn-secondary bg-grad-dark hover-jello" type="submit">Sign Up</button>
        </form>
        <div class="signup-message"></div>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            var form = document.getElementById('signupForm');
            if(form) {
              form.onsubmit = async function(e) {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(form));
                const msgDiv = document.querySelector('.signup-message');
                msgDiv.textContent = '';
                try {
                  const res = await fetch('http://localhost:3030/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                  });
                  const result = await res.json();
                  msgDiv.textContent = result.message || (res.ok ? 'Signup successful!' : 'Signup failed.');
                  msgDiv.style.color = res.ok ? 'green' : 'red';
                } catch (err) {
                  msgDiv.textContent = 'Network error.';
                  msgDiv.style.color = 'red';
                }
              };
            }
          });
        </script>
      </div>
    `;
}

/**
 * Login Card Template
 * @returns {string} HTML for login card
 */
function loginCardTemplate() {
  return `
      <div class="card card w-half my-3 login-card">
        <h2 class="h1 txt-center">Login</h2>
        <form id="loginForm">
          <input class="input mb-2" type="text" name="username" placeholder="Username or Email" required />
          <input class="input mb-2" type="password" name="password" placeholder="Password" required />
          <button class="btn btn-secondary bg-grad-dark hover-jello" type="submit">Login</button>
        </form>
        <div class="login-message"></div>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            var form = document.getElementById('loginForm');
            if(form) {
              form.onsubmit = async function(e) {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(form));
                const msgDiv = document.querySelector('.login-message');
                msgDiv.textContent = '';
                try {
                  const res = await fetch('http://localhost:3030/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                  });
                  const result = await res.json();
                  msgDiv.textContent = result.message || (res.ok ? 'Login successful!' : 'Login failed.');
                  msgDiv.style.color = res.ok ? 'green' : 'red';
                } catch (err) {
                  msgDiv.textContent = 'Network error.';
                  msgDiv.style.color = 'red';
                }
              };
            }
          });
        </script>
      </div>
    `;
}

/**
 * Contact Card Template
 * @returns {string} HTML for contact card
 */
function contactCardTemplate() {
  return `
      <div class="card w-half my-3 contact-card">
        <h2 class="h1 txt-center">Contact Us</h2>
        <form id="contactForm">
          <input class="input mb-2" type="text" name="name" placeholder="Your Name" required />
          <input class="input mb-2" type="email" name="email" placeholder="Your Email" required />
          <textarea class="input mb-2 resize-none" name="message" placeholder="Your Message" required></textarea>
          <button class="btn btn-secondary bg-grad-dark hover-jello" type="submit">Send</button>
        </form>
        <div class="contact-message"></div>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            var form = document.getElementById('contactForm');
            if(form) {
              form.onsubmit = async function(e) {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(form));
                const msgDiv = document.querySelector('.contact-message');
                msgDiv.textContent = '';
                try {
                  const res = await fetch('http://localhost:3030/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                  });
                  const result = await res.json();
                  msgDiv.textContent = result.message || (res.ok ? 'Message sent!' : 'Failed to send.');
                  msgDiv.style.color = res.ok ? 'green' : 'red';
                } catch (err) {
                  msgDiv.textContent = 'Network error.';
                  msgDiv.style.color = 'red';
                }
              };
            }
          });
        </script>
      </div>
    `;
}

/**
 * Search Card Template
 * @returns {string} HTML for search card
 */
function searchCardTemplate() {
  return `
      <div class="card my-3 w-half search-card">
        <h2 class="h1 txt-center">Search</h2>
        <form class="d-flex gap-2" id="searchForm">
          <input class="input mb-2" type="text" name="query" placeholder="Search..." required />
          <button class="btn btn-secondary bg-grad-dark hover-jello py-1" type="submit">Search</button>
        </form>
        <div class="search-results"></div>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            var form = document.getElementById('searchForm');
            if(form) {
              form.onsubmit = async function(e) {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(form));
                const resultsDiv = document.querySelector('.search-results');
                resultsDiv.textContent = '';
                try {
                  const res = await fetch('http://localhost:3030/api/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                  });
                  const result = await res.json();
                  if(Array.isArray(result.results)) {
                    resultsDiv.innerHTML = result.results.map(r => '<div>' + r + '</div>').join('');
                  } else {
                    resultsDiv.textContent = result.message || (res.ok ? 'Search complete.' : 'Search failed.');
                  }
                } catch (err) {
                  resultsDiv.textContent = 'Network error.';
                  resultsDiv.style.color = 'red';
                }
              };
            }
          });
        </script>
      </div>
    `;
}

// Export all functions using CommonJS format
module.exports = {
  signupCardTemplate,
  loginCardTemplate,
  contactCardTemplate,
  searchCardTemplate,
};
