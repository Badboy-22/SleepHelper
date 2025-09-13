function isSignupPossible() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const error = document.getElementById("error");
    if (!username || !password) {
        error.textContent = "아이디와 비밀번호를 입력하세요.";
        return false;
    }
    if (!/^[a-z0-9._-]{3,32}$/i.test(username.trim())) {
        error.textContent = "아이디 형식이 올바르지 않습니다. (영문/숫자/._- , 3~32)";
        return false;
    }
    if (password.length < 6) {
        error.textContent = "비밀번호는 6자 이상이어야 합니다.";
        return false;
    }
    error.textContent = "";
    return true;
}

async function signupRequest(username, password) {
    const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "가입 실패");
    return data;
}

async function whoAmI() {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (!r.ok) return null;
    const { user } = await r.json().catch(() => ({ user: null }));
    return user || null;
}

const signupbtn = document.getElementById("signup-btn");
if (signupbtn) {
    signupbtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const error = document.getElementById("error");
        if (!isSignupPossible()) return;

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;

        try {
            await signupRequest(username, password);  // 서버가 세션 쿠키 설정
            const user = await whoAmI();
            if (!user) throw new Error("세션 확인 실패");
            alert("회원가입 완료!");
            window.location.assign(new URL("/index.html", window.location.href));
        } catch (err) {
            error.textContent = err.message || "가입 실패";
        }
    });
}