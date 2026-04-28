import { useCallback, useEffect, useState } from "react";

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function normalizeApiUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

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
  const [blacklistText, setBlacklistText] = useState("");
  const [apiUrl, setApiUrl] = useState(() =>
    normalizeApiUrl(localStorage.getItem("HODL_API_URL") || DEFAULT_API_URL),
  );

  useEffect(() => {
    if (!apiUrl) return;
    localStorage.setItem("HODL_API_URL", normalizeApiUrl(apiUrl));
  }, [apiUrl]);

  const refresh = useCallback(async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const base = normalizeApiUrl(apiUrl);
    const res = await fetch(`${base}/api/admin/status`, { headers });
    const data = await res.json();
    if (res.ok) {
      setStatus(data);
      setMint(data.tokenMint || "");
      setBlacklistText((data.blacklistAddresses || []).join("\n"));
    } else {
      setMsg(data.error || data.message || "Could not fetch admin status");
    }
  }, [token, apiUrl]);

  const login = async () => {
    const base = normalizeApiUrl(apiUrl);
    const res = await fetch(`${base}/api/admin/login`, {
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
    const base = normalizeApiUrl(apiUrl);
    const res = await fetch(`${base}${path}`, {
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
      <a href="/" className="back">
        Back to site
      </a>
      <h1>HODL Admin Board</h1>
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
          <label style={{ display: "block", marginTop: 16 }}>Blacklist addresses (one per line)</label>
          <textarea
            value={blacklistText}
            onChange={(e) => setBlacklistText(e.target.value)}
            rows={7}
            style={{
              width: "100%",
              marginTop: 8,
              marginBottom: 10,
              background: "#000",
              border: "1px solid #2a2a38",
              color: "#ddefff",
              borderRadius: 8,
              padding: 10,
            }}
          />
          <button
            className="btn"
            onClick={() =>
              postAdmin("/api/admin/blacklist", {
                addresses: blacklistText
                  .split(/\r?\n|,/)
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          >
            Save Blacklist
          </button>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>
      )}
      {msg ? <p>{msg}</p> : null}
    </section>
  );
}

export default App;
