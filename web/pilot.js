fetch("/pilot/view", { method: "POST", keepalive: true }).catch(() => {});

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
