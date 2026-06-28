# Event Ticketing dApp — Design

**Date:** 2026-06-28
**Bootcamp Level:** 2 (Yellow/Green Belt)
**Goal:** Multi-wallet Stellar dApp with a deployed Soroban contract, real-time event integration, and visible transaction status.

## Level 2 Requirements Mapping

| Requirement | How this project satisfies it |
|-------------|-------------------------------|
| 3 error types handled | (1) wallet not connected, (2) user rejected signature, (3) contract error (SoldOut / AlreadyHasTicket) |
| Contract deployed on testnet | Soroban `ticket` contract deployed to Stellar testnet |
| Contract called from frontend | `buy_ticket`, `get_info`, `has_ticket` invoked via stellar-sdk |
| Transaction status visible | `idle → pending → success/fail` shown in button + toast |
| Real-time / event integration | `TicketPurchased` event emitted on chain; UI re-reads `get_info` and updates the live capacity bar |
| 2+ meaningful commits | Contract commit, frontend commit, deploy/config commits |

## Architecture

```
soroban-event-ticket/
├── contracts/ticket/      # Rust Soroban contract → deployed to testnet
│   └── src/lib.rs
├── frontend/              # React + Vite + TypeScript
│   └── src/
│       ├── lib/wallet.ts      # Stellar Wallets Kit setup (multi-wallet)
│       ├── lib/contract.ts    # build/sign/submit + read calls
│       ├── lib/errors.ts      # error classification (3 types)
│       └── App.tsx            # UI: event info, capacity bar, buy button, status
└── docs/superpowers/specs/
```

## Smart Contract (Soroban / Rust)

**Scope:** Single event, free tickets, simple counter. One ticket per address.

### Storage
- `Admin: Address`
- `EventName: String`
- `Total: u32` — total ticket capacity
- `Sold: u32` — tickets sold so far
- `Holder(Address) -> bool` — whether an address already holds a ticket

### Functions
| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin, event_name, total_tickets)` | admin | One-time setup; panics if already initialized |
| `buy_ticket(buyer)` | buyer | Requires `buyer` auth; increments `Sold`, marks holder; emits event |
| `get_info() -> (String, u32, u32)` | — | Returns (event_name, total, sold) for reads |
| `has_ticket(addr) -> bool` | — | Whether `addr` holds a ticket |

### Events
- `buy_ticket` publishes topic `("ticket", "buy")` with data `(buyer: Address, ticket_number: u32)`.

### Errors (contract `#[contracterror]`)
- `NotInitialized = 1`
- `AlreadyInitialized = 2`
- `SoldOut = 3`
- `AlreadyHasTicket = 4`

## Frontend (React + Vite + TS)

### Multi-wallet
- **Stellar Wallets Kit** single modal: Freighter, xBull, Albedo, etc.
- Connect/disconnect; show connected address (truncated).

### UI
- Event name, **capacity bar** `sold / total` (remaining highlighted).
- "Buy Ticket" button (disabled when not connected / sold out / busy).
- Recent buyers list (from the latest tx event / re-read).
- Transaction status indicator + toast.

### Contract calls (`lib/contract.ts`)
- Read: `get_info`, `has_ticket` via simulation (no signature).
- Write: `buy_ticket` — build tx → simulate → sign with Wallets Kit → submit via RPC → poll result.

### Error handling (`lib/errors.ts`) — 3 types
1. **WalletNotConnected** — no wallet selected/connected → prompt to connect.
2. **UserRejected** — user cancels the signature in the wallet → "Transaction cancelled".
3. **ContractError** — contract panic (SoldOut / AlreadyHasTicket) parsed from RPC error → human-readable message.

### Transaction status
State machine: `idle → pending → success | fail`. Reflected in the button label/spinner and a toast. On `success`, re-read `get_info` and refresh the capacity bar.

### Real-time (Option A — chosen)
After a successful `buy_ticket`, parse the returned `TicketPurchased` event from the tx result and re-read `get_info()` to refresh the live capacity bar and append the buyer to the recent list. Simple and reliable; avoids continuous polling. (Option B — RPC `getEvents` polling — intentionally not used to keep scope tight.)

## Toolchain / Deploy

- Rust + `wasm32-unknown-unknown` target, stellar CLI.
- Testnet identity funded via friendbot/faucet.
- Build → optimize → deploy to testnet; record contract ID in `frontend/.env` (`VITE_CONTRACT_ID`, `VITE_RPC_URL`, `VITE_NETWORK_PASSPHRASE`).

## Out of Scope (YAGNI)

- Paid tickets / token transfers / trustlines.
- Multiple events.
- NFT/metadata standards.
- Continuous event polling / indexer.

## Testing

- Contract: Rust unit tests (`initialize`, `buy_ticket` happy path, `SoldOut`, `AlreadyHasTicket`, double-init).
- Frontend: manual verification on testnet (connect wallet, buy, observe status + live bar, trigger each error type).
