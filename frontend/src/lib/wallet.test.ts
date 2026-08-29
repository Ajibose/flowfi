import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockIsConnected = vi.fn();
const mockSetAllowed = vi.fn();
const mockGetAddress = vi.fn();
const mockGetNetworkDetails = vi.fn();

vi.mock("@stellar/freighter-api", () => ({
  isConnected: (...args: unknown[]) => mockIsConnected(...args),
  setAllowed: (...args: unknown[]) => mockSetAllowed(...args),
  getAddress: (...args: unknown[]) => mockGetAddress(...args),
  getNetworkDetails: (...args: unknown[]) => mockGetNetworkDetails(...args),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import {
  connectWallet,
  FreighterNotInstalledError,
  type WalletSession,
} from "./wallet";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Default happy-path stubs so individual tests only override what they need. */
function stubHappyPath(overrides?: {
  connected?: boolean;
  address?: string;
  addressError?: string;
  networkPassphrase?: string;
  networkDetailsError?: string;
}) {
  mockIsConnected.mockResolvedValue({
    isConnected: overrides?.connected ?? true,
  });

  mockSetAllowed.mockResolvedValue(undefined);

  mockGetAddress.mockResolvedValue({
    address: "address" in (overrides ?? {}) ? overrides!.address : "GABCDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    error: overrides?.addressError ?? undefined,
  });

  mockGetNetworkDetails.mockResolvedValue({
    networkPassphrase:
      overrides?.networkPassphrase ?? "Test SDF Network ; September 2015",
    error: overrides?.networkDetailsError ?? undefined,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("connectWallet → connectFreighter error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. FreighterNotInstalledError ────────────────────────────────────────

  describe("Freighter extension not installed", () => {
    it("throws FreighterNotInstalledError when isConnected returns false", async () => {
      stubHappyPath({ connected: false });

      await expect(connectWallet("freighter")).rejects.toThrow(
        FreighterNotInstalledError,
      );
    });

    it("FreighterNotInstalledError has the correct name and message", async () => {
      stubHappyPath({ connected: false });

      try {
        await connectWallet("freighter");
        throw new Error("expected connectWallet to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(FreighterNotInstalledError);
        expect((error as Error).name).toBe("FreighterNotInstalledError");
        expect((error as Error).message).toContain("not installed");
      }
    });

    it("does not call setAllowed or getAddress when not connected", async () => {
      stubHappyPath({ connected: false });

      await expect(connectWallet("freighter")).rejects.toThrow();

      expect(mockSetAllowed).not.toHaveBeenCalled();
      expect(mockGetAddress).not.toHaveBeenCalled();
    });
  });

  // ── 2. getAddress() failure ─────────────────────────────────────────────

  describe("getAddress() failure", () => {
    it("throws when getAddress returns an error string", async () => {
      stubHappyPath({ addressError: "User denied access" });

      await expect(connectWallet("freighter")).rejects.toThrow(
        "User denied access",
      );
    });

    it("throws a generic message when getAddress returns no address and no error", async () => {
      stubHappyPath({ address: undefined, addressError: undefined });

      await expect(connectWallet("freighter")).rejects.toThrow(
        "Freighter did not return a valid public key.",
      );
    });

    it("throws when getAddress returns empty string address", async () => {
      stubHappyPath({ address: "", addressError: undefined });

      await expect(connectWallet("freighter")).rejects.toThrow(
        "Freighter did not return a valid public key.",
      );
    });

    it("calls setAllowed before getAddress", async () => {
      stubHappyPath({ addressError: "some error" });

      await expect(connectWallet("freighter")).rejects.toThrow();

      expect(mockSetAllowed).toHaveBeenCalledOnce();
      expect(mockGetAddress).toHaveBeenCalledOnce();

      // setAllowed should be called before getAddress
      const setAllowedOrder = mockSetAllowed.mock.invocationCallOrder[0];
      const getAddressOrder = mockGetAddress.mock.invocationCallOrder[0];
      expect(setAllowedOrder).toBeLessThan(getAddressOrder);
    });
  });

  // ── 3. getNetworkDetails() catch fallback ───────────────────────────────

  describe("getNetworkDetails() catch fallback", () => {
    it("returns a valid session when getNetworkDetails throws", async () => {
      stubHappyPath();
      mockGetNetworkDetails.mockRejectedValue(new Error("network timeout"));

      const session: WalletSession = await connectWallet("freighter");

      expect(session.walletId).toBe("freighter");
      expect(session.publicKey).toBe(
        "GABCDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      );
      // Falls back to env-based network (default is TESTNET → "Testnet")
      expect(session.network).toBe("Testnet");
      expect(session.mocked).toBe(false);
    });

    it("returns Mainnet when getNetworkDetails throws and env is MAINNET", async () => {
      // Temporarily override the env-based network ID used by wallet.ts.
      // The module-level STELLAR_NETWORK_ID is computed at import time from
      // NEXT_PUBLIC_STELLAR_NETWORK, so we mock the module to simulate MAINNET.
      vi.resetModules();
      vi.doMock("@stellar/freighter-api", () => ({
        isConnected: mockIsConnected,
        setAllowed: mockSetAllowed,
        getAddress: mockGetAddress,
        getNetworkDetails: mockGetNetworkDetails,
      }));

      // Re-import with MAINNET env to get the correct STELLAR_NETWORK_ID
      vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK", "MAINNET");
      const { connectWallet: connectWalletMainnet } = await import("./wallet");

      stubHappyPath();
      mockGetNetworkDetails.mockRejectedValue(new Error("boom"));

      const session: WalletSession = await connectWalletMainnet("freighter");

      // The fallback uses STELLAR_NETWORK_ID which contains "Public" for mainnet
      expect(session.network).toBe("Mainnet");

      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("returns a valid session when getNetworkDetails resolves with an error field", async () => {
      stubHappyPath({ networkDetailsError: "something went wrong" });

      const session: WalletSession = await connectWallet("freighter");

      // When details.error is truthy, the passphrase branch is skipped,
      // so the fallback STELLAR_NETWORK_ID is used (default TESTNET → "Testnet")
      expect(session.network).toBe("Testnet");
    });
  });

  // ── 4. Happy path (smoke) ───────────────────────────────────────────────

  describe("happy path (smoke)", () => {
    it("returns a valid WalletSession on successful connection", async () => {
      stubHappyPath();

      const session: WalletSession = await connectWallet("freighter");

      expect(session).toMatchObject({
        walletId: "freighter",
        walletName: "Freighter",
        publicKey: "GABCDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        network: "Testnet",
        mocked: false,
      });
      expect(session.connectedAt).toBeDefined();
    });
  });
});
