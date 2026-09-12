"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { login, register } from "@/client/api/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isRegister) await register({ username, password });
      else await login({ username, password });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <Link className="auth-home" href="/"><ArrowLeft size={17} />返回首页</Link>
      <div className="auth-page">
        <div className="auth-panel">
          <header className="auth-heading">
            <h1>智能猫娘</h1>
            <p>{isRegister ? "创建账号" : "登录账号"}</p>
          </header>
          <section className="auth-content" aria-label={isRegister ? "注册" : "登录"}>
            <form className="auth-form" onSubmit={submit}>
              <label>
                用户名
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
              </label>
              <label>
                密码
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={isRegister ? "new-password" : "current-password"} required />
              </label>
              {error ? <p className="auth-error" role="alert">{error}</p> : null}
              <button className="auth-submit" disabled={busy} type="submit">{busy ? "处理中..." : isRegister ? "注册" : "登录"}</button>
            </form>
            <p className="auth-switch">
              {isRegister ? "已有账号？" : "还没有账号？"}
              <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "登录" : "注册"}</Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
