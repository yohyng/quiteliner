import { useEffect, useState } from "react";
import { supabase, isSupabaseEnabled } from "./lib/supabase";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    );
  }

  if (!isSupabaseEnabled || session) {
    return children;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-title">Quietliner</div>
          <div className="auth-subtitle">サインインして続ける</div>
        </div>
        <form onSubmit={handleLogin} className="auth-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            autoFocus
            autoComplete="email"
            className="auth-input"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            required
            autoComplete="current-password"
            className="auth-input"
          />
          {error && (
            <div className="auth-error">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
          >
            {loading ? "ログイン中…" : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
