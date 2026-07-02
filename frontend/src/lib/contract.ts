import {
  Account,
  Address,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, signTx } from "./wallet";

const RPC_URL = import.meta.env.VITE_RPC_URL as string;
const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID as string;

export const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

export interface EventInfo {
  name: string;
  total: number;
  sold: number;
  remaining: number;
}

export interface PurchaseResult {
  ticketNumber: number;
  txHash: string;
}

// ---- Reads (simulation only, no signature) -------------------------------

export async function getInfo(): Promise<EventInfo> {
  const result = await simulateRead(contract.call("get_info"));
  const [name, total, sold] = result as [string, number, number];
  return { name, total, sold, remaining: total - sold };
}

export async function hasTicket(address: string): Promise<boolean> {
  const op = contract.call("has_ticket", Address.fromString(address).toScVal());
  return (await simulateRead(op)) as boolean;
}

async function simulateRead(op: xdr.Operation): Promise<unknown> {
  // Reads only run through simulation, so a dummy (unfunded) source is fine.
  const account = new Account(READ_SOURCE, "0");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  if (!sim.result?.retval) {
    throw new Error("Empty simulation result");
  }
  return scValToNative(sim.result.retval);
}

// A throwaway but valid account id used only as the source for read simulations.
const READ_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// ---- Write: buy_ticket ----------------------------------------------------

export async function buyTicket(buyer: string): Promise<PurchaseResult> {
  const account = await server.getAccount(buyer);
  const op = contract.call("buy_ticket", Address.fromString(buyer).toScVal());

  const builtTx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  // Simulate + assemble (adds Soroban resource footprint & auth).
  const prepared = await server.prepareTransaction(builtTx);

  // Sign with the connected wallet.
  const signedXdr = await signTx(prepared.toXDR(), buyer);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  // Submit and poll for the result.
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === "TRY_AGAIN_LATER") {
    throw new Error(
      "The network is busy and could not accept the transaction. Please try again in a few seconds.",
    );
  }
  if (sent.status === "DUPLICATE") {
    throw new Error(
      "This transaction was already submitted. Please refresh before trying again.",
    );
  }
  if (sent.status === "ERROR") {
    throw new Error(JSON.stringify(sent.errorResult ?? sent));
  }

  const final = await pollTx(sent.hash);
  const ticketNumber =
    final.returnValue != null ? Number(scValToNative(final.returnValue)) : 0;

  return { ticketNumber, txHash: sent.hash };
}

async function pollTx(hash: string): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  for (let i = 0; i < 15; i++) {
    const res = await server.getTransaction(hash);
    if (res.status === "SUCCESS") {
      return res;
    }
    if (res.status === "FAILED") {
      throw new Error(JSON.stringify(res));
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Transaction timed out");
}
