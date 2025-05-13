/**
 * Anime.js Integration for Anix
 * This file provides integration between Anix and Anime.js animation library
 * It allows for shorthand animation syntax in Anix templates
 */

// Import Anime.js from CDN if not already available
if (typeof anime === "undefined") {
  const animeScript = document.createElement("script");
  animeScript.src =
    "https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js";
  animeScript.async = true;
  document.head.appendChild(animeScript);

  // Wait for script to load before initializing
  animeScript.onload = initAnimeIntegration;
} else {
  // If anime is already defined, initialize immediately
  document.addEventListener("DOMContentLoaded", initAnimeIntegration);
}

/**
 * Initialize Anime.js integration with Anix
 */
function initAnimeIntegration() {
  console.log("Anime.js integration initialized");
  setupAnimeDirectives();
  processAnimeTargets();
}

/**
 * Process elements with anime-target class
 */
function processAnimeTargets() {
  const targets = document.querySelectorAll(".anime-target");

  targets.forEach((target) => {
    // Extract animation attributes
    const animationType = target.getAttribute("data-animation") || "";
    const duration = parseInt(target.getAttribute("data-duration")) || 1000;
    const delay = parseInt(target.getAttribute("data-delay")) || 0;
    const easing = target.getAttribute("data-easing") || "easeOutElastic";
    const loop = target.getAttribute("data-loop") === "true";

    // Apply animation based on type
    applyAnimation(target, animationType, {
      duration,
      delay,
      easing,
      loop,
    });
  });
}

/**
 * Apply animation to target element
 * @param {HTMLElement} target - Element to animate
 * @param {string} type - Animation type
 * @param {Object} options - Animation options
 */
function applyAnimation(target, type, options) {
  let animation = {};

  // Define animation properties based on type
  switch (type) {
    case "fade-in":
      animation = {
        targets: target,
        opacity: [0, 1],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "fade-out":
      animation = {
        targets: target,
        opacity: [1, 0],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "slide-left":
      animation = {
        targets: target,
        translateX: ["100%", 0],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "slide-right":
      animation = {
        targets: target,
        translateX: ["-100%", 0],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "slide-up":
      animation = {
        targets: target,
        translateY: ["100%", 0],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "slide-down":
      animation = {
        targets: target,
        translateY: ["-100%", 0],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "zoom-in":
      animation = {
        targets: target,
        scale: [0, 1],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "zoom-out":
      animation = {
        targets: target,
        scale: [1, 0],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "rotate":
      animation = {
        targets: target,
        rotate: ["0deg", "360deg"],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    case "pulse":
      animation = {
        targets: target,
        scale: [1, 1.1, 1],
        duration: options.duration,
        delay: options.delay,
        easing: options.easing,
        loop: options.loop,
      };
      break;
    default:
      // If no specific animation type, check for CSS animation classes
      if (target.classList.contains("animate-fade-in")) {
        // CSS animations are already applied via classes
        return;
      }
      break;
  }

  // Run animation if defined
  if (Object.keys(animation).length > 0) {
    anime(animation);
  }
}

/**
 * Setup Anix directives for animations
 */
function setupAnimeDirectives() {
  // Add mutation observer to detect new anime-target elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList.contains("anime-target")) {
            // Process newly added anime targets
            processAnimeTargets();
          }
        });
      }
    });
  });

  // Start observing the document
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Add global animation methods to window for Anix integration
  window.anixAnimate = {
    /**
     * Animate an element with Anime.js
     * @param {string|HTMLElement} selector - CSS selector or DOM element
     * @param {Object} properties - Animation properties
     * @param {Object} options - Animation options
     */
    animate: (selector, properties, options = {}) => {
      const config = {
        targets:
          typeof selector === "string"
            ? document.querySelectorAll(selector)
            : selector,
        ...properties,
        duration: options.duration || 1000,
        delay: options.delay || 0,
        easing: options.easing || "easeOutElastic",
        loop: options.loop || false,
      };

      return anime(config);
    },

    /**
     * Create a timeline animation
     * @param {Object} options - Timeline options
     */
    timeline: (options = {}) => {
      return anime.timeline(options);
    },
  };
}
