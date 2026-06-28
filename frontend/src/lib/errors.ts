// Three error categories handled by the app (Level 2 requirement).
export type AppErrorKind = "WalletNotConnected" | "UserRejected" | "ContractError";

export interface AppError {
  kind: AppErrorKind;
  message: string;
}

// Map raw contract error codes (from #[contracterror]) to friendly text.
const CONTRACT_ERRORS: Record<number, string> = {
  1: "Event is not initialized yet.",
  2: "Event is already initialized.",
  3: "Sold out — no tickets left.",
  4: "This wallet already has a ticket.",
};

export function classifyError(err: unknown): AppError {
  const raw = stringifyError(err);

  // 1) Wallet not connected / not found
  if (
    /not connected|no wallet|wallet not|connect.*wallet|address.*not/i.test(raw)
  ) {
    return { kind: "WalletNotConnected", message: "Please connect a wallet first." };
  }

  // 2) User rejected the signature in their wallet
  if (/reject|denied|declined|cancel|user.*close/i.test(raw)) {
    return { kind: "UserRejected", message: "Transaction cancelled in wallet." };
  }

  // 3) Contract error — try to extract the Soroban error code: Error(Contract, #N)
  const codeMatch = raw.match(/Error\(Contract,\s*#(\d+)\)/) || raw.match(/#(\d+)/);
  if (codeMatch) {
    const code = Number(codeMatch[1]);
    if (CONTRACT_ERRORS[code]) {
      return { kind: "ContractError", message: CONTRACT_ERRORS[code] };
    }
  }

  return { kind: "ContractError", message: trimMessage(raw) };
}

function stringifyError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return `${err.message} ${err.stack ?? ""}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function trimMessage(raw: string): string {
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.length > 160 ? firstLine.slice(0, 157) + "…" : firstLine;
}
