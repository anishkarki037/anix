// frontend-integration.js - Client-side code to connect with backend API
// This script should be included in your Anix frontend or modified as needed

// Base API URL - adjust to match your server settings
const API_BASE_URL = "http://localhost:3030/api";

/**
 * Submit the signup form data to the backend
 * @param {FormData} formData - The form data to submit
 * @returns {Promise} - A promise that resolves with the API response
 */
function submitSignup(formData) {
  // Convert FormData to a plain object
  const userData = {};
  for (const [key, value] of formData.entries()) {
    userData[key] = value;
  }

  return fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) {
        throw new Error(data.message || "Failed to create account");
      }
      return data;
    });
}

/**
 * Check if a username already exists
 * @param {string} username - The username to check
 * @returns {Promise<boolean>} - Whether the username already exists
 */
function checkUsernameExists(username) {
  return fetch(`${API_BASE_URL}/users/check-username/${username}`)
    .then((response) => response.json())
    .then((data) => data.exists);
}

/**
 * Fetch all users from the database
 * @returns {Promise<Array>} - Array of users
 */
function fetchUsers() {
  return fetch(`${API_BASE_URL}/users`)
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) {
        throw new Error(data.message || "Failed to fetch users");
      }
      return data.users;
    });
}
