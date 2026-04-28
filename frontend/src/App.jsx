import { useCallback, useEffect, useState } from "react";

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function App() {
  const isAdmin = window.location.pathname === "/admin";
  if (isAdmin) return <AdminBoard />;
  return <iframe title="HODL Landing" src="/HODL.html" style={{ border: 0, width: "100vw", height: "100vh", display: "block" }} />;
}

function AdminBoard() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [mint, setMint] = useState("");
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("HODL_API_URL") || DEFAULT_API_URL);

  const refresh = useCallback(async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${apiUrl}/api/admin/status`, { headers });
    const data = await res.json();
    if (res.ok) {
      setStatus(data);
      setMint(data.tokenMint || "");
    } else {
      setMsg(data.error || data.message || "Could not fetch admin status");
    }
  }, [token, apiUrl]);

  const login = async () => {
    const res = await fetch(`${apiUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || data.message || "Login failed");
    setToken(data.token);
    setMsg("Logged in");
  };

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token, refresh]);

  const postAdmin = async (path, body = {}) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error || data.message || "Request failed");
    else setMsg("Success");
    await refresh();
  };

  return (
    <section className="container admin">
      <a href="/HODL.html" className="back">
        Back to site
      </a>
      <h1>HODL Admin Board</h1>
      <div className="card">
        <label>API URL</label>
        <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
        <button
          className="btn"
          onClick={() => {
            localStorage.setItem("HODL_API_URL", apiUrl.trim());
            setMsg("API URL saved");
          }}
        >
          Save API URL
        </button>
      </div>
      {!token ? (
        <div className="card">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" />
          <button className="btn" onClick={login}>
            Login
          </button>
        </div>
      ) : (
        <div className="card">
          <label>Token mint / contract address</label>
          <input value={mint} onChange={(e) => setMint(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={() => postAdmin("/api/admin/config", { tokenMint: mint })}>
              Save Mint
            </button>
            <button className="btn" onClick={() => postAdmin("/api/admin/system/start")}>
              Start Fetching
            </button>
            <button className="btn danger" onClick={() => postAdmin("/api/admin/system/stop")}>
              Stop Fetching
            </button>
          </div>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>
      )}
      {msg ? <p>{msg}</p> : null}
    </section>
  );
}

export default App;
