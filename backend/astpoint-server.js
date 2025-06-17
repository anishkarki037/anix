// server.js - Backend server for user signup
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Import routers from templates
import signupRouter from "./templates/signup.js";
import loginRouter from "./templates/login.js";
import contactRouter from "./templates/contact.js";
import searchRouter from "./templates/search.js";

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3030;

// Initialize Astpoint database
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Use routers from templates
app.use(signupRouter);
app.use(loginRouter);
app.use(contactRouter);
app.use(searchRouter);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
