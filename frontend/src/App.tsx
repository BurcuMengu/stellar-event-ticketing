import { useCallback, useEffect, useState } from "react";
import { connectWallet } from "./lib/wallet";
import { buyTicket, getInfo, hasTicket, type EventInfo } from "./lib/contract";
import { classifyError } from "./lib/errors";
import "./App.css";

type TxStatus = "idle" | "pending" | "success" | "fail";

interface Toast {
  kind: "error" | "success";
  text: string;
}

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [owns, setOwns] = useState(false);
  const [status, setStatus] = useState<TxStatus>("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [recent, setRecent] = useState<{ addr: string; num: number }[]>([]);

  const refresh = useCallback(async (addr: string | null) => {
    const i = await getInfo();
    setInfo(i);
    if (addr) setOwns(await hasTicket(addr));
  }, []);

  // Initial load (read-only, no wallet needed).
  useEffect(() => {
    refresh(null).catch((e) => setToast({ kind: "error", text: classifyError(e).message }));
  }, [refresh]);

  async function handleConnect() {
    try {
      const addr = await connectWallet();
      setAddress(addr);
      await refresh(addr);
    } catch (e) {
      const err = classifyError(e);
      if (err.kind !== "UserRejected") setToast({ kind: "error", text: err.message });
    }
  }

  async function handleBuy() {
    if (!address) {
      setToast({ kind: "error", text: "Please connect a wallet first." });
      return;
    }
    setStatus("pending");
    setToast(null);
    try {
      const res = await buyTicket(address);
      setStatus("success");
      setToast({ kind: "success", text: `Ticket #${res.ticketNumber} confirmed!` });
      // Real-time (Option A): re-read on-chain state + append buyer.
      setRecent((r) => [{ addr: address, num: res.ticketNumber }, ...r].slice(0, 8));
      await refresh(address);
    } catch (e) {
      setStatus("fail");
      setToast({ kind: "error", text: classifyError(e).message });
    }
  }

  const remaining = info?.remaining ?? 0;
  const total = info?.total ?? 0;
  const sold = info?.sold ?? 0;
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  const soldOut = total > 0 && remaining <= 0;
  const busy = status === "pending";

  return (
    <main className="app">
      <header className="topbar">
        <span className="brand">🎟️ Event Tickets</span>
        {address ? (
          <span className="wallet connected">{short(address)}</span>
        ) : (
          <button className="wallet" onClick={handleConnect}>
            Connect Wallet
          </button>
        )}
      </header>

      <section className="card">
        <h1>{info?.name ?? "Loading…"}</h1>

        <div className="capacity">
          <div className="bar">
            <div className={`fill ${soldOut ? "full" : ""}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="counts">
            <strong>{remaining}</strong> left
            <span className="muted">
              {" "}
              · {sold}/{total} sold
            </span>
          </div>
        </div>

        <button
          className="buy"
          disabled={!address || busy || soldOut || owns}
          onClick={handleBuy}
        >
          {busy
            ? "Processing…"
            : soldOut
            ? "Sold Out"
            : owns
            ? "You already have a ticket"
            : "Buy Ticket"}
        </button>

        <div className={`status status-${status}`}>
          {status === "idle" && "Ready"}
          {status === "pending" && "⏳ Pending — signing & submitting…"}
          {status === "success" && "✅ Success"}
          {status === "fail" && "❌ Failed"}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2>Recent buyers</h2>
          <ul className="recent">
            {recent.map((r, i) => (
              <li key={i}>
                <span className="num">#{r.num}</span> {short(r.addr)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </main>
  );
}
