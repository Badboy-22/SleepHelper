async function whoAmI() {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (!r.ok) return null;
    const { user } = await r.json().catch(() => ({ user: null }));
    return user || null;
}

document.addEventListener("DOMContentLoaded", async () => {
  const me = await whoAmI();
  if (!me) {
    // session is gone (e.g., server restarted) -> go to login
    location.href = "/index.html";
    return;
  }
  // ...render the main page with `me`...
});