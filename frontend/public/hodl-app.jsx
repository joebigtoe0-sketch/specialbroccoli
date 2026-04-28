/* global React, ReactDOM */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

function normalizeApiUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

const DEFAULT_HOLDERS = JSON.parse(document.getElementById('mock-holders-json').textContent);
const API_URL = normalizeApiUrl(localStorage.getItem('HODL_API_URL') || window.HODL_API_URL || '');
const HAS_API_URL = !!String(API_URL).trim();
const INITIAL_HOLDERS = HAS_API_URL ? [] : DEFAULT_HOLDERS;
const DEFAULT_STATS = {
  totalDistributedSol: 0,
  avgHoldDays: 0,
  activeHolders: INITIAL_HOLDERS.length,
  nextDistributionUnix: Math.ceil(Math.floor(Date.now() / 1000) / 1800) * 1800,
  cyclePending: 0,
};
function buildBuyUrl(tokenMint) {
  if (!tokenMint) return 'https://app.printr.money/trade/';
  return `https://app.printr.money/trade/${tokenMint}`;
}

/* ---------- formatting helpers ---------- */
function shortenAddr(a) { return a.slice(0, 4) + '…' + a.slice(-4); }
function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}
function formatHoldTime(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}
function formatSol(n) { return n.toFixed(4); }

/* ---------- toast ---------- */
function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m) => {
    setMsg(m);
    clearTimeout(show._t);
    show._t = setTimeout(() => setMsg(null), 1600);
  };
  const node = msg ? <div className="copy-toast">{msg}</div> : null;
  return [show, node];
}

/* ---------- tiny syntax highlighter (TS-ish) ---------- */
function highlightTS(src) {
  // very small token pass — good enough for the four blocks
  const KW = /\b(import|from|export|async|await|const|let|return|new|function|type|interface|filter|for|of|in|if|else)\b/g;
  const TYPES = /\b(Connection|Keypair|PublicKey|Transaction|SystemProgram|LAMPORTS_PER_SOL|TOKEN_PROGRAM_ID|DLMM|Holder|WeightedHolder|Promise|BigInt|Number|Math|Date|number|string|boolean)\b/g;
  // protect strings + comments first by tokenising
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    // line comment
    if (ch === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i); if (j < 0) j = src.length;
      tokens.push({ t: 'c', v: src.slice(i, j) });
      i = j;
      continue;
    }
    // string single
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== q) {
        if (src[j] === '\\') j++;
        j++;
      }
      tokens.push({ t: 's', v: src.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    // number (incl bigint suffix n)
    if (/[0-9]/.test(ch) && (i === 0 || /[^A-Za-z_]/.test(src[i - 1]))) {
      let j = i;
      while (j < src.length && /[0-9_]/.test(src[j])) j++;
      if (src[j] === 'n') j++;
      tokens.push({ t: 'n', v: src.slice(i, j) });
      i = j;
      continue;
    }
    // identifier
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    tokens.push({ t: 'p', v: ch });
    i++;
  }
  // render
  return tokens.map((tk, idx) => {
    if (tk.t === 'c') return <span key={idx} className="tok-c">{tk.v}</span>;
    if (tk.t === 's') return <span key={idx} className="tok-s">{tk.v}</span>;
    if (tk.t === 'n') return <span key={idx} className="tok-n">{tk.v}</span>;
    if (tk.t === 'id') {
      if (KW.test(tk.v)) { KW.lastIndex = 0; return <span key={idx} className="tok-k">{tk.v}</span>; }
      KW.lastIndex = 0;
      if (TYPES.test(tk.v)) { TYPES.lastIndex = 0; return <span key={idx} className="tok-t">{tk.v}</span>; }
      TYPES.lastIndex = 0;
      // function call?
      const next = tokens[idx + 1];
      if (next && next.v === '(') return <span key={idx} className="tok-f">{tk.v}</span>;
      return <span key={idx}>{tk.v}</span>;
    }
    return <span key={idx}>{tk.v}</span>;
  });
}

/* ---------- icons (inline SVGs, no lucide) ---------- */
const I = {
  Zap: (p) => <svg viewBox="0 0 24 24" width={p.size||20} height={p.size||20} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Coins: (p) => <svg viewBox="0 0 24 24" width={p.size||20} height={p.size||20} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/></svg>,
  Search: (p) => <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  Copy: (p) => <svg viewBox="0 0 24 24" width={p.size||14} height={p.size||14} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Arrow: (p) => <svg viewBox="0 0 24 24" width={p.size||14} height={p.size||14} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
  ChevronUp: (p) => <svg viewBox="0 0 24 24" width={p.size||12} height={p.size||12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>,
  ChevronDown: (p) => <svg viewBox="0 0 24 24" width={p.size||12} height={p.size||12} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  Sparkles: (p) => <svg viewBox="0 0 24 24" width={p.size||14} height={p.size||14} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>,
};

/* ---------- diamond fist mark ---------- */
function DiamondMark({ size = 32 }) {
  return (
    <span style={{
      display:'inline-block', width:size, height:size,
      borderRadius:'50%',
      background:'radial-gradient(circle at 50% 45%, rgba(168,212,255,0.5), transparent 70%)',
      position:'relative',
    }}>
      <img src="public/diamond-fist.jpg" alt="" width={size} height={size}
        style={{ width:size, height:size, borderRadius:'50%', display:'block', objectFit:'cover' }}
      />
    </span>
  );
}

/* ---------- nav ---------- */
function NavBracket({ label, href, onClick }) {
  return (
    <a href={href} className="nav-bracket mono" onClick={onClick}>
      <span className="br">[</span>{label}<span className="br">]</span>
    </a>
  );
}

function Nav({ onNav, buyUrl }) {
  return (
    <nav style={{
      position:'sticky', top:0, zIndex:50,
      background:'rgba(0,0,0,0.65)',
      backdropFilter:'blur(10px)',
      WebkitBackdropFilter:'blur(10px)',
      borderBottom:'1px solid var(--ink-700)',
    }}>
      <div className="container" style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        height:64,
      }}>
        <a href="#top" onClick={(e)=>{e.preventDefault(); onNav('top');}} style={{
          display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'inherit',
        }}>
          <DiamondMark size={28} />
          <span className="mono" style={{ fontSize:15, letterSpacing:'0.02em', fontWeight:600, color:'#fff' }}>$HODL</span>
        </a>
        <div className="hide-md" style={{ display:'flex', alignItems:'center', gap:4 }}>
          <NavBracket label="HOW"        href="#how"        onClick={(e)=>{e.preventDefault(); onNav('how');}} />
          <NavBracket label="MECHANIC"   href="#mechanic"   onClick={(e)=>{e.preventDefault(); onNav('mechanic');}} />
          <NavBracket label="LEADERBOARD"href="#leaderboard"onClick={(e)=>{e.preventDefault(); onNav('leaderboard');}} />
          <NavBracket label="BUY"        href={buyUrl} />
        </div>
        <a href={buyUrl} target="_blank" rel="noopener" className="btn btn-prism">
          BUY ON PRINTR <I.Arrow size={12}/>
        </a>
      </div>
    </nav>
  );
}

/* ---------- hero ---------- */
function Hero({ onNav, buyUrl, cyclePending }) {
  return (
    <section style={{ position:'relative', paddingTop:48, paddingBottom:64 }}>
      <div className="hero-glow" />
      <div className="container" style={{
        display:'grid',
        gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',
        gap:32,
        alignItems:'center',
      }}>
        <div className="fade-up in" style={{ position:'relative', zIndex:2 }}>
          <div className="section-eyebrow" style={{ marginBottom:22 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--win)', boxShadow:'0 0 12px var(--win)' }} />
            <span className="mono">$HODL — PROOF OF PATIENCE</span>
          </div>
          <h1 className="hero-h1">
            DIAMOND<br/>HANDS GET<br/><span className="text-ice">PAID.</span>
          </h1>
          <p style={{
            color:'rgba(221,239,255,0.65)',
            fontSize:17, lineHeight:1.55,
            maxWidth:'46ch',
            marginTop:24, marginBottom:32,
          }}>
            90% of supply staked. 100% of fees flow to everyone who holds. Longer you hold, more you get in every cycle. No claiming, no gas, no cope.
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
            <a href={buyUrl} target="_blank" rel="noopener" className="btn btn-primary">BUY ON PRINTR <I.Arrow size={12}/></a>
            <a href="#leaderboard" onClick={(e)=>{e.preventDefault(); onNav('leaderboard');}} className="btn btn-outline">VIEW LEADERBOARD</a>
          </div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap', marginTop:36 }}>
            <span className="pill"><span style={{color:'var(--win)'}}>●</span> CONTRACT VERIFIED</span>
            <span className="pill"><span style={{color:'var(--ice-300)'}}>◆</span> POOL LIVE</span>
            <span className="pill"><span style={{color:'var(--prism-yellow)'}}>★</span> CYCLE {cyclePending} PENDING</span>
          </div>
        </div>

        <HeroFist />
      </div>
    </section>
  );
}

function HeroFist() {
  return (
    <div style={{ position:'relative', display:'flex', justifyContent:'center', alignItems:'center', minHeight:340 }}>
      <div style={{ position:'relative', width:300, height:300 }}>
        <div className="fist-prism-ring" />
        <div className="fist-halo" />
        <div className="fist-wrap" style={{
          position:'absolute', inset:'8%',
          borderRadius:'50%',
          overflow:'hidden',
          boxShadow:'inset 0 0 60px rgba(255,255,255,0.08), 0 0 60px -10px rgba(107,180,255,0.4)',
          zIndex:2,
        }}>
          <img src="public/diamond-fist.jpg" alt="$HODL diamond fist" style={{
            width:'100%', height:'100%', objectFit:'cover', display:'block',
          }}/>
        </div>
      </div>
    </div>
  );
}

/* ---------- stats bar ---------- */
function useCountdown(targetUnix) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, targetUnix - now);
  const h = Math.floor(remain / 3600);
  const m = Math.floor((remain % 3600) / 60);
  const s = remain % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function StatsBar({ stats }) {
  const cd = useCountdown(stats.nextDistributionUnix);
  const tiles = [
    { label:'TOTAL DISTRIBUTED', value: stats.totalDistributedSol.toFixed(2) + ' SOL', accent:'var(--ice-300)' },
    { label:'ACTIVE HOLDERS',    value: stats.activeHolders.toLocaleString(),          accent:'var(--ice-100)' },
    { label:'AVG HOLD TIME',     value: stats.avgHoldDays.toFixed(1) + ' DAYS',        accent:'var(--ice-100)' },
    { label:'NEXT DISTRIBUTION', value: cd,                                          accent:'var(--prism-yellow)', mono:true },
  ];
  return (
    <div className="container" style={{
      display:'grid',
      gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))',
      gap:14,
      marginTop:8,
    }}>
      {tiles.map((t, i) => (
        <div key={t.label} className="card" style={{ padding:'18px 20px' }}>
          <div className="mono" style={{ fontSize:11, letterSpacing:'0.08em', color:'var(--ink-500)', textTransform:'uppercase' }}>{t.label}</div>
          <div className="mono tnum" style={{ fontSize:24, marginTop:6, color: t.accent, letterSpacing:'-0.01em' }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 3-step ---------- */
function ThreeSteps() {
  const ref = useRef(null);
  const seen = true;
  const steps = [
    {
      num:'01', title:'BUY $HODL', icon: <I.Zap size={48} />,
      copy:'Grab some on PRINTR. Takes 30 seconds, any Solana wallet.',
      iconColor:'var(--ice-300)',
    },
    {
      num:'02', title:'HOLD IT', iconImg:true,
      copy:'The longer you hold, the heavier your weight in every distribution.',
      iconColor:null,
    },
    {
      num:'03', title:'GET PAID', icon: <I.Coins size={48} />,
      copy:'SOL fees auto-stream to your wallet. No claiming, no gas, no tabs to check.',
      iconColor:'var(--win)',
      payoff:true,
    },
  ];
  return (
    <section id="how" ref={ref} style={{ padding:'72px 0 48px', position:'relative' }}>
      <div className="container">
        <div className="section-eyebrow">
          <span className="br" style={{color:'var(--ink-500)'}}>[</span>HOW<span className="br" style={{color:'var(--ink-500)'}}>]</span>
        </div>
        <h2 className="section-title">Three steps. That's the whole game.</h2>
        <p className="section-sub">No staking screen. No claim button. Just a wallet that gets heavier when you don't touch it.</p>

        <div style={{
          marginTop:40,
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',
          gap:18,
          position:'relative',
        }}>
          <div className="dotted-connector hide-md" style={{
            transform: seen ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'transform 1s ease 0.6s',
          }}/>
          {steps.map((s, i) => (
            <div key={s.num} className="card" style={{
              padding:32,
              position:'relative',
              ...(s.payoff ? {
                background: 'linear-gradient(135deg, rgba(245,251,255,0.06), rgba(107,180,255,0.025) 60%, transparent), var(--ink-800)',
              } : {}),
            }}>
              {s.payoff && (
                <div style={{
                  position:'absolute', top:0, left:14, right:14, height:1,
                  background:'linear-gradient(90deg,#FF4DA6,#FFA64D,#FFE14D,#4DFFA6,#4DA6FF,#A64DFF)',
                  opacity:0.7, borderRadius:1,
                }}/>
              )}
              <div className="mono text-prism" style={{ fontSize:64, fontWeight:700, lineHeight:1, letterSpacing:'-0.04em' }}>{s.num}</div>
              <div style={{ marginTop:24, height:48, display:'flex', alignItems:'center', color: s.iconColor || 'var(--ice-300)' }}>
                {s.iconImg ? (
                  <img src="public/diamond-fist.jpg" alt="" width="48" height="48" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', boxShadow:'0 0 20px -4px rgba(107,180,255,0.4)' }}/>
                ) : s.icon}
              </div>
              <div className="mono" style={{ fontSize:22, marginTop:18, color:'#fff', fontWeight:600, letterSpacing:'-0.01em' }}>{s.title}</div>
              <div style={{ marginTop:8, color:'rgba(221,239,255,0.7)', fontSize:14, lineHeight:1.55 }}>{s.copy}</div>
            </div>
          ))}
        </div>
        <div className="mono" style={{ textAlign:'center', marginTop:28, fontSize:12, color:'var(--ink-500)', letterSpacing:'0.04em' }}>
          // powered by printr fees → meteora pool → you
        </div>
      </div>
    </section>
  );
}

/* ---------- code block ---------- */
function CodeBlock({ filename, code }) {
  const [show, toast] = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      show('COPIED');
    } catch (e) { /* noop */ }
  };
  return (
    <div className="code-block">
      <div className="code-head mono">
        <span>{filename}</span>
        <button onClick={copy} style={{
          display:'inline-flex', alignItems:'center', gap:6,
          background:'transparent', border:'1px solid var(--ink-600)', color:'var(--ice-300)',
          padding:'4px 10px', borderRadius:6, cursor:'pointer',
          fontFamily:'inherit', fontSize:11, letterSpacing:'0.04em',
        }}>
          <I.Copy size={11}/> COPY
        </button>
      </div>
      <div className="code-body">
        <pre>{highlightTS(code)}</pre>
      </div>
      {toast}
    </div>
  );
}

/* ---------- mechanic ---------- */
const STEP_CODE = [
  {
    num:'01',
    title:'CLAIM FEES FROM THE POOL',
    blurb:'Every cycle, the dev script claims accumulated swap fees from the active liquidity pool position.',
    file:'claim.ts',
    code:`import DLMM from '@meteora-ag/dlmm';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const HODL_POOL = new PublicKey('5xQ...HoDL');

export async function claimMeteoraFees(connection: Connection, dev: Keypair) {
  const dlmm = await DLMM.create(connection, HODL_POOL);
  const positions = await dlmm.getPositionsByUserAndLbPair(dev.publicKey);

  const claimTx = await dlmm.claimAllSwapFee({
    owner: dev.publicKey,
    positions: positions.userPositions,
  });

  const sig = await connection.sendTransaction(claimTx, [dev]);
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}`,
  },
  {
    num:'02',
    title:'SNAPSHOT EVERY $HODL HOLDER',
    blurb:"We pull every token account holding $HODL and reconstruct each wallet's first-acquisition timestamp from on-chain history.",
    file:'snapshot.ts',
    code:`import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const HODL_MINT = new PublicKey('HoDL...111');
const MIN_HOLD = 1_000n; // dust filter

export async function snapshotHolders(connection: Connection): Promise<Holder[]> {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: HODL_MINT.toBase58() } },
    ],
  });

  const holders = await Promise.all(
    accounts.map(async ({ account, pubkey }) => {
      const owner = new PublicKey(account.data.slice(32, 64));
      const amount = account.data.readBigUInt64LE(64);
      const firstSeen = await getFirstTransferIn(connection, pubkey);
      return { owner, amount, firstSeen };
    }),
  );

  return holders.filter(h => h.amount >= MIN_HOLD);
}`,
  },
  {
    num:'03',
    title:'WEIGHT BY TOKENS × TIME',
    blurb:'Your share of every distribution is (tokens × seconds_held) / Σ(tokens × seconds_held) across all holders. Bigger bag, longer hold, larger slice.',
    file:'weight.ts',
    code:`export function weightHolders(holders: Holder[]): WeightedHolder[] {
  const now = Math.floor(Date.now() / 1000);

  const weighted = holders.map(h => {
    const heldFor = BigInt(now - h.firstSeen);
    const rawWeight = h.amount * heldFor; // tokens × seconds
    return { ...h, heldFor, rawWeight };
  });

  const total = weighted.reduce((s, h) => s + h.rawWeight, 0n);

  return weighted.map(h => ({
    ...h,
    sharePpm: Number((h.rawWeight * 1_000_000n) / total), // parts per million
  }));
}`,
  },
  {
    num:'04',
    title:'DISTRIBUTE SOL PROPORTIONALLY',
    blurb:'Claimed SOL is split by share and pushed out in batched transfers. Same wallets that held longest receive the biggest checks. No claiming, no gas — it just shows up.',
    file:'distribute.ts',
    code:`import { SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const BATCH_SIZE = 18;

export async function distribute(
  connection: Connection,
  dev: Keypair,
  totalSol: number,
  holders: WeightedHolder[],
) {
  const totalLamports = Math.floor(totalSol * LAMPORTS_PER_SOL);

  const transfers = holders.map(h => ({
    to: h.owner,
    lamports: Math.floor((totalLamports * h.sharePpm) / 1_000_000),
  })).filter(t => t.lamports > 0);

  for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
    const tx = new Transaction();
    for (const t of transfers.slice(i, i + BATCH_SIZE)) {
      tx.add(SystemProgram.transfer({
        fromPubkey: dev.publicKey,
        toPubkey: t.to,
        lamports: t.lamports,
      }));
    }
    await connection.sendTransaction(tx, [dev]);
  }
}`,
  },
];

function Mechanic() {
  return (
    <section id="mechanic" style={{ padding:'48px 0 72px' }}>
      <div className="container">
        <div className="section-eyebrow">
          <span className="br" style={{color:'var(--ink-500)'}}>[</span>MECHANIC<span className="br" style={{color:'var(--ink-500)'}}>]</span>
        </div>
        <h2 className="section-title">Four steps, every cycle.</h2>
        <p className="section-sub">The off-chain script the dev runs each cycle — verbatim. Read it, fork it, audit it.</p>
        <div style={{
          marginTop:32,
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))',
          gap:18,
        }}>
          {STEP_CODE.map(s => (
            <div key={s.num} className="card" style={{ padding:24 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:14 }}>
                <span className="mono text-prism" style={{ fontSize:36, fontWeight:700, letterSpacing:'-0.03em', lineHeight:1 }}>{s.num}</span>
                <div className="mono" style={{ color:'#fff', fontSize:15, fontWeight:600, letterSpacing:'0.01em' }}>{s.title}</div>
              </div>
              <p style={{ color:'rgba(221,239,255,0.65)', margin:'12px 0 18px', fontSize:14, lineHeight:1.55 }}>{s.blurb}</p>
              <CodeBlock filename={s.file} code={s.code} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- leaderboard ---------- */
const PAGE_SIZE = 25;

function Leaderboard({ holders, nextDistributionUnix }) {
  const [sort, setSort] = useState({ key: 'weightPpm', dir: 'desc' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [show, toast] = useToast();
  const NOW = Math.floor(Date.now() / 1000);

  const enriched = useMemo(() => holders.map(h => ({
    ...h,
    heldFor: NOW - h.heldSinceUnix,
  })), [holders, NOW]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return enriched;
    return enriched.filter(h => h.address.toLowerCase().includes(ql));
  }, [q, enriched]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const k = sort.key;
    arr.sort((a, b) => {
      const av = a[k], bv = b[k];
      if (av === bv) return 0;
      return sort.dir === 'desc' ? (av < bv ? 1 : -1) : (av < bv ? -1 : 1);
    });
    return arr;
  }, [filtered, sort]);

  const maxPpm = sorted[0]?.weightPpm || 1;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const onSort = (k) => {
    setSort(s => s.key === k ? { key:k, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key:k, dir:'desc' });
    setPage(0);
  };

  const copyAddr = async (a) => {
    try { await navigator.clipboard.writeText(a); show('ADDRESS COPIED'); } catch {}
  };

  const sortIndicator = (k) => sort.key === k
    ? (sort.dir === 'desc' ? <I.ChevronDown/> : <I.ChevronUp/>)
    : null;

  const nextCycleText = useMemo(() => {
    const secs = Math.max(0, nextDistributionUnix - NOW);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `CYCLE IN ${h}h ${m}m`;
  }, [nextDistributionUnix, NOW]);

  return (
    <section id="leaderboard" style={{ padding:'48px 0 96px' }}>
      <div className="container">
        <div className="section-eyebrow">
          <span className="br" style={{color:'var(--ink-500)'}}>[</span>LEADERBOARD<span className="br" style={{color:'var(--ink-500)'}}>]</span>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <h2 className="section-title">Top diamond hands, ranked by weight.</h2>
            <p className="section-sub">Click any column to sort. Click a wallet to copy.</p>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span className="pill">{holders.length.toLocaleString()} HOLDERS</span>
            <span className="pill"><span style={{color:'var(--win)'}}>●</span> {nextCycleText}</span>
          </div>
        </div>

        <div style={{ marginTop:24, display:'grid', gridTemplateColumns:'1fr', gap:16 }}>
          <div style={{ position:'relative' }}>
            <I.Search size={16} />
            <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--ink-500)' }}>
              <I.Search size={14}/>
            </span>
            <input
              className="search-input"
              placeholder="search wallet…"
              value={q}
              onChange={(e)=>{ setQ(e.target.value); setPage(0); }}
            />
          </div>

          {/* desktop table */}
          <div className="card hide-md" style={{ padding:0, overflow:'hidden' }}>
            <table className="lb">
              <thead>
                <tr>
                  <th className="rank-cell">#</th>
                  <th>Wallet</th>
                  <th onClick={()=>onSort('heldTokens')} className={sort.key==='heldTokens' ? 'sorted' : ''}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:4}}>$HODL HELD {sortIndicator('heldTokens')}</span>
                  </th>
                  <th onClick={()=>onSort('heldSinceUnix')} className={sort.key==='heldSinceUnix' ? 'sorted' : ''}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:4}}>HOLD TIME {sort.key==='heldSinceUnix' && (sort.dir==='desc'?<I.ChevronUp/>:<I.ChevronDown/>)}</span>
                  </th>
                  <th onClick={()=>onSort('weightPpm')} className={sort.key==='weightPpm' ? 'sorted' : ''}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:4}}>WEIGHT {sortIndicator('weightPpm')}</span>
                  </th>
                  <th onClick={()=>onSort('earnedSol')} className={sort.key==='earnedSol' ? 'sorted' : ''} style={{textAlign:'right'}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:4}}>EARNED (SOL) {sortIndicator('earnedSol')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.map(h => {
                  const isTop3 = h.rank <= 3;
                  const pct = (h.weightPpm / 10_000).toFixed(4);
                  const barW = Math.max(4, Math.round((h.weightPpm / maxPpm) * 90));
                  return (
                    <tr key={h.address} className={isTop3 ? 'top3' : ''}>
                      <td>
                        <span className={'rank-num ' + (isTop3 ? 'rank-top' : '')}>
                          {h.rank === 1 && <img src="public/diamond-fist.jpg" alt="" width="16" height="16" style={{ width:16, height:16, borderRadius:'50%', verticalAlign:'-3px', marginRight:6 }}/>}
                          {String(h.rank).padStart(2,'0')}
                        </span>
                      </td>
                      <td>
                        <button onClick={()=>copyAddr(h.address)} title={h.address} style={{
                          background:'transparent', border:0, padding:0, cursor:'pointer',
                          color:'var(--ice-100)', fontFamily:'inherit', fontSize:13,
                          display:'inline-flex', alignItems:'center', gap:6,
                        }}>
                          {shortenAddr(h.address)}
                          <span style={{color:'var(--ink-500)'}}><I.Copy size={11}/></span>
                        </button>
                      </td>
                      <td className="tnum">{formatTokens(h.heldTokens)}</td>
                      <td className="tnum" style={{ color:'var(--ice-300)' }}>{formatHoldTime(h.heldFor)}</td>
                      <td className="tnum">
                        <span style={{ color:'var(--ice-100)' }}>{pct}%</span>
                        <span className="weight-bar" style={{ width: barW }} />
                      </td>
                      <td className="tnum" style={{ textAlign:'right', color:'var(--win)' }}>+{formatSol(h.earnedSol)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* mobile card list */}
          <div style={{ display:'none' }} className="lb-mobile">
            {slice.map(h => {
              const isTop3 = h.rank <= 3;
              const pct = (h.weightPpm / 10_000).toFixed(4);
              return (
                <div key={h.address} className="lb-mobile-card" style={{
                  position:'relative', overflow:'hidden',
                }}>
                  {isTop3 && <div style={{position:'absolute',left:0,top:8,bottom:8,width:2,background:'linear-gradient(180deg,#FF4DA6,#FFA64D,#FFE14D,#4DFFA6,#4DA6FF,#A64DFF)',borderRadius:2}}/>}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                    <span className="mono rank-num">#{String(h.rank).padStart(2,'0')}</span>
                    <button onClick={()=>copyAddr(h.address)} className="mono" style={{
                      background:'transparent',border:0,color:'var(--ice-100)',cursor:'pointer',fontSize:13,
                    }}>{shortenAddr(h.address)}</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10, fontSize:12 }}>
                    <div><div style={{color:'var(--ink-500)'}} className="mono">HELD</div><div className="mono tnum">{formatTokens(h.heldTokens)}</div></div>
                    <div><div style={{color:'var(--ink-500)'}} className="mono">TIME</div><div className="mono tnum" style={{color:'var(--ice-300)'}}>{formatHoldTime(h.heldFor)}</div></div>
                    <div><div style={{color:'var(--ink-500)'}} className="mono">WEIGHT</div><div className="mono tnum">{pct}%</div></div>
                    <div><div style={{color:'var(--ink-500)'}} className="mono">EARNED</div><div className="mono tnum" style={{color:'var(--win)'}}>+{formatSol(h.earnedSol)}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:18 }}>
          <div className="mono" style={{ fontSize:12, color:'var(--ink-500)', letterSpacing:'0.04em' }}>
            SHOWING {safePage*PAGE_SIZE+1}–{Math.min(sorted.length, (safePage+1)*PAGE_SIZE)} OF {sorted.length}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline" disabled={safePage === 0} onClick={()=>setPage(p=>Math.max(0,p-1))} style={{ opacity: safePage === 0 ? 0.4 : 1 }}>
              ← PREV
            </button>
            <button className="btn btn-outline" disabled={safePage >= totalPages-1} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} style={{ opacity: safePage >= totalPages-1 ? 0.4 : 1 }}>
              NEXT →
            </button>
          </div>
        </div>
        {toast}
      </div>
      <style>{`
        @media (max-width: 860px) {
          .lb-mobile { display: block !important; }
        }
      `}</style>
    </section>
  );
}

/* ---------- footer ---------- */
function Footer({ buyUrl }) {
  return (
    <footer style={{ borderTop:'1px solid var(--ink-700)', padding:'48px 0 36px', marginTop:24 }}>
      <div className="container" style={{
        display:'grid',
        gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',
        gap:24,
      }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <DiamondMark size={28}/>
            <span className="mono" style={{ fontSize:15, color:'#fff', fontWeight:600 }}>$HODL</span>
          </div>
          <p style={{ color:'rgba(221,239,255,0.55)', fontSize:13, marginTop:14, maxWidth:'40ch' }}>
            Proof of patience. A meme token that pays its diamond hands in SOL — every cycle, no claiming.
          </p>
        </div>
        <div>
          <div className="mono" style={{ fontSize:11, letterSpacing:'0.08em', color:'var(--ink-500)', textTransform:'uppercase', marginBottom:12 }}>LINKS</div>
          {[
            ['Twitter / X', 'https://x.com/Hodlonprintr'],
            ['PRINTR token page', buyUrl],
          ].map(([l,h]) => (
            <a key={l} href={h} className="mono" style={{
              display:'block', color:'var(--ice-100)', fontSize:13, textDecoration:'none',
              padding:'4px 0', letterSpacing:'0.02em',
            }}>{l} ↗</a>
          ))}
        </div>
        <div>
          <div className="mono" style={{ fontSize:11, letterSpacing:'0.08em', color:'var(--ink-500)', textTransform:'uppercase', marginBottom:12 }}>MECHANIC</div>
          <div className="mono" style={{ fontSize:13, color:'rgba(221,239,255,0.7)', lineHeight:1.7 }}>
            <div>weight = tokens × seconds</div>
            <div>share = weight / Σ weights</div>
            <div>distribution = share × claimed_sol</div>
          </div>
        </div>
      </div>
      <div className="container mono" style={{
        marginTop:36, paddingTop:18, borderTop:'1px solid var(--ink-700)',
        color:'var(--ink-500)', fontSize:11, letterSpacing:'0.04em', textAlign:'center',
      }}>
        $HODL is a meme. Distributions are made on a best-effort basis by the team's off-chain script. Don't ape what you can't lose.
      </div>
    </footer>
  );
}

/* ---------- app ---------- */
function App() {
  const [holders, setHolders] = useState(INITIAL_HOLDERS);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [tokenMint, setTokenMint] = useState(() => (localStorage.getItem('HODL_TOKEN_MINT') || '').trim());
  useEffect(() => {
    if (!API_URL) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/holders`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.items)) setHolders(data.items);
        if (typeof data.tokenMint === 'string') {
          const mint = data.tokenMint.trim();
          setTokenMint(mint);
          if (mint) localStorage.setItem('HODL_TOKEN_MINT', mint);
        } else {
          const statusRes = await fetch(`${API_URL}/api/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (typeof statusData.tokenMint === 'string') {
              const mint = statusData.tokenMint.trim();
              setTokenMint(mint);
              if (mint) localStorage.setItem('HODL_TOKEN_MINT', mint);
            }
          }
        }
        if (data.stats) setStats({
          totalDistributedSol: Number(data.stats.totalDistributedSol || 0),
          avgHoldDays: Number(data.stats.avgHoldDays || 0),
          activeHolders: Number(data.stats.activeHolders || data.items?.length || 0),
          nextDistributionUnix: Number(data.stats.nextDistributionUnix || DEFAULT_STATS.nextDistributionUnix),
          cyclePending: Number(data.stats.cyclePending || 0),
        });
      } catch (e) {
        // Keep the bundled mock set on network/API failure.
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const onNav = (id) => {
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior:'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 56;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };
  const buyUrl = buildBuyUrl(tokenMint);
  return (
    <div id="top" style={{ position:'relative', zIndex:1 }}>
      <Nav onNav={onNav} buyUrl={buyUrl} />
      <Hero onNav={onNav} buyUrl={buyUrl} cyclePending={stats.cyclePending} />
      <StatsBar stats={stats} />
      <ThreeSteps />
      <hr className="divider" />
      <Mechanic />
      <hr className="divider" />
      <Leaderboard holders={holders} nextDistributionUnix={stats.nextDistributionUnix} />
      <Footer buyUrl={buyUrl} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
