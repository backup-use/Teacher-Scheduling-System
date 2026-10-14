document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("logout-btn");
  if (!btn) return;   // no logout button on this page — nothing to do

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("[logout] API call failed:", e);
    }
    window.location.href = "/auth/logout.html";
  });
});