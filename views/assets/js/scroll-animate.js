// Scroll-triggered animation logic for .scroll-animate elements
(function () {
  function onEntry(entries, observer) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const anim = el.getAttribute("data-animate");
        if (anim) {
          el.classList.add("animate-" + anim);
          observer.unobserve(el);
        }
      }
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    const elements = document.querySelectorAll(".scroll-animate[data-animate]");
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(onEntry, {
        threshold: 1,
      });
      elements.forEach((el) => observer.observe(el));
    } else {
      // Fallback for browsers without IntersectionObserver
      elements.forEach((el) => {
        const anim = el.getAttribute("data-animate");
        if (anim) {
          el.classList.add("animate-" + anim);
        }
      });
    }
  });
})();
