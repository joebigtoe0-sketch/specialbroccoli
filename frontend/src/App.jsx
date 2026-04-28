import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function shortenAddr(a) {
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

function App() {
  const isAdmin = window.location.pathname === "/admin";
  if (isAdmin) return <AdminBoard />;
  return <LandingPage />;
}

function LandingPage() {
  const [holders, setHolders] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [holdersRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/api/holders`),
        fetch(`${API_URL}/api/status`),
      ]);
      const holdersData = await holdersRes.json();
      const statusData = await statusRes.json();
      setHolders(holdersData.items || []);
      setStatus(statusData);
    };
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const top = useMemo(() => holders.slice(0, 50), [holders]);

  return (
    <div>
      <nav className="nav">
        <div className="container nav-inner">
          <div className="brand">
            <img src="/hodllogo.jpg" alt="HODL logo" />
            <span>$HODL</span>
          </div>
          <a className="btn" href="/admin">
            Admin Board
          </a>
        </div>
      </nav>

      <section className="hero container">
        <div>
          <h1>
            DIAMOND HANDS
            <br />
            GET PAID.
          </h1>
          <p>Mockup v1 with live Solana holder fetching via API worker.</p>
          <div className="pills">
            <span className="pill">Source: {status?.source || "-"}</span>
            <span className="pill">Holders: {status?.holdersCount || 0}</span>
            <span className="pill">Poll: {status?.pollRunning ? "running" : "stopped"}</span>
          </div>
        </div>
        <img className="hero-logo" src="/diamond-fist.jpg" alt="Diamond fist" />
      </section>

      <section className="container board">
        <h2>Leaderboard</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Wallet</th>
              <th>Held</th>
              <th>Weight ppm</th>
              <th>Earned SOL</th>
            </tr>
          </thead>
          <tbody>
            {top.map((h) => (
              <tr key={h.address}>
                <td>{h.rank}</td>
                <td>{shortenAddr(h.address)}</td>
                <td>{h.heldTokens.toLocaleString()}</td>
                <td>{h.weightPpm.toLocaleString()}</td>
                <td>{h.earnedSol.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AdminBoard() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [mint, setMint] = useState("");
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_URL}/api/admin/status`, { headers });
    const data = await res.json();
    if (res.ok) {
      setStatus(data);
      setMint(data.tokenMint || "");
    }
  }, [token]);

  const login = async () => {
    const res = await fetch(`${API_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "Login failed");
    setToken(data.token);
    setMsg("Logged in");
  };

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token, refresh]);

  const postAdmin = async (path, body = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error || "Request failed");
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
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>
      )}
      {msg ? <p>{msg}</p> : null}
    </section>
  );
}

export default App;
