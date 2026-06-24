// Bank-connection / sync seam. This is the slot Plaid prod drops into: the app
// talks to a `BankProvider` interface, and a config flag swaps the mock for the
// real Plaid-backed implementation (which calls the ConjureOS plaid-* edge
// functions: plaid-link-token, plaid-exchange, plaid-sync, plaid-unlink).
//
// Mock mode simulates one already-linked institution so the Connections UI is
// demoable end to end without a backend. Nothing here moves money or touches a
// real bank.

import { ACCOUNTS } from "../api/mock/data";

export interface BankConnection {
  id: string;
  institution: string;
  status: "healthy" | "needs_attention";
  lastSyncedAt: string | null;
  accountMasks: string[];
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  syncedAt: string;
}

export interface BankProvider {
  readonly mode: "mock" | "plaid";
  listConnections(): Promise<BankConnection[]>;
  /** Launch the link flow (Plaid Link in prod; simulated in mock). */
  connect(institution: string): Promise<BankConnection>;
  /** Pull new/updated transactions. `connectionId` omitted = sync all. */
  sync(connectionId?: string): Promise<SyncResult>;
  unlink(connectionId: string): Promise<void>;
}

class MockBankProvider implements BankProvider {
  readonly mode = "mock" as const;
  private connections: BankConnection[];

  constructor() {
    // Seed one connection from the mock accounts so the seed data looks linked.
    this.connections = [
      {
        id: "conn_conjure",
        institution: "Conjure Bank",
        status: "healthy",
        lastSyncedAt: new Date().toISOString(),
        accountMasks: ACCOUNTS.map((a) => a.mask),
      },
    ];
  }

  async listConnections(): Promise<BankConnection[]> {
    return [...this.connections];
  }

  async connect(institution: string): Promise<BankConnection> {
    // In prod this is where Plaid Link returns a public token we exchange.
    const conn: BankConnection = {
      id: `conn_${Date.now().toString(36)}`,
      institution: institution.trim() || "New institution",
      status: "healthy",
      lastSyncedAt: new Date().toISOString(),
      accountMasks: [],
    };
    this.connections = [...this.connections, conn];
    return conn;
  }

  async sync(connectionId?: string): Promise<SyncResult> {
    const now = new Date().toISOString();
    this.connections = this.connections.map((c) =>
      !connectionId || c.id === connectionId ? { ...c, lastSyncedAt: now, status: "healthy" } : c,
    );
    // Mock data is static, so a sync brings nothing new — but the shape is the
    // real one (Plaid's /transactions/sync added/modified/removed counts).
    return { added: 0, modified: 0, removed: 0, syncedAt: now };
  }

  async unlink(connectionId: string): Promise<void> {
    this.connections = this.connections.filter((c) => c.id !== connectionId);
  }
}

/**
 * Real Plaid-backed provider. Not enabled until Plaid prod lands (blocked on
 * the LLC). It would call the ConjureOS edge functions via the host bridge;
 * left as a typed placeholder so flipping `VITE_BANK_PROVIDER=plaid` is the
 * only change needed.
 */
class PlaidBankProvider implements BankProvider {
  readonly mode = "plaid" as const;
  private notReady(): never {
    throw new Error("Plaid bank sync is not enabled yet (awaiting Plaid prod)");
  }
  async listConnections(): Promise<BankConnection[]> {
    return [];
  }
  async connect(): Promise<BankConnection> {
    return this.notReady();
  }
  async sync(): Promise<SyncResult> {
    return this.notReady();
  }
  async unlink(): Promise<void> {
    return this.notReady();
  }
}

let provider: BankProvider | null = null;
export function bankProvider(): BankProvider {
  if (!provider) {
    const mode = (import.meta.env.VITE_BANK_PROVIDER as string) || "mock";
    provider = mode === "plaid" ? new PlaidBankProvider() : new MockBankProvider();
  }
  return provider;
}
