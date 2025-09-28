const LoginButton = document.getElementById("login-btn");
const error = document.getElementById("error");
async function whoAmI() {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (!r.ok) return null;
    const { user } = await r.json().catch(() => ({ user: null }));
    return user || null;
}

function isLoginPossible() {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    if (!username || !password) {
        error.textContent = "아이디와 비밀번호를 입력하세요.";
        return false;
    }
    error.textContent = "";
    return true;
}

async function LoginRequest(username, password) {
    const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "로그인 실패");
    return data;
}

// 버튼 클릭으로 로그인 (폼 submit 써도 됨 — 너 구조대로 둠)
LoginButton.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!isLoginPossible()) return;

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
        await LoginRequest(username, password);
        const user = await whoAmI();
        if (!user) throw new Error("세션 확인 실패");
        window.location.assign(new URL("/src/html/main.html", window.location.href));
    } catch (err) {
        error.textContent = err.message || "로그인 실패";
    }
});
