import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Mocks ──────────────────────────────────────────────────────────────

const push = vi.fn();
const disconnect = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}));

vi.mock("@/context/wallet-context", () => ({
  useWallet: () => ({
    session: {
      publicKey: "GAV4A377RAEV6YVAWZVHXF4VZD5ZBXGIKEMNHV5YIMV5LIKSNQVYUBR7",
      network: "TESTNET",
      walletName: "Freighter",
    },
    disconnect,
    isHydrated: true,
  }),
}));

vi.mock("@/lib/wallet", () => ({
  shortenPublicKey: (key: string) => `${key.slice(0, 4)}...${key.slice(-4)}`,
  formatNetwork: (n: string) => n,
  STELLAR_NETWORK: "TESTNET",
}));

vi.mock("@/lib/api/_shared", () => ({
  getApiBaseUrl: () => "http://localhost:4000",
}));

import SettingsContent from "../settings-content";

function getThemeButtons(): HTMLElement[] {
  const buttons = screen.getAllByRole("button");
  return buttons.filter(
    (b) => b.textContent === "Light" || b.textContent === "Dark" || b.textContent === "System"
  );
}

function getCurrencySelect(): HTMLSelectElement | null {
  return screen.queryByLabelText(/default token/i) as HTMLSelectElement | null;
}

describe("SettingsContent dirty-state detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default localStorage values
    localStorage.clear();
    localStorage.setItem("flowfi-theme", "dark");
    localStorage.setItem("flowfi-currency", "USD");
    localStorage.setItem("flowfi-amount-format", "full");
    localStorage.setItem("flowfi-decimal-places", "7");
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts clean (not dirty) on initial render", () => {
    render(<SettingsContent />);

    // Navigate away without changes — should proceed without confirmation
    act(() => {
      fireEvent.click(screen.getByText(/connect wallet/i));
    });

    expect(push).toHaveBeenCalledWith("/");
  });

  it("detects dirty state when theme is changed", () => {
    render(<SettingsContent />);

    const themeButtons = getThemeButtons();
    const lightButton = themeButtons.find((b) => b.textContent === "Light");
    expect(lightButton).toBeDefined();

    // Change theme to Light (different from initial "dark")
    act(() => {
      fireEvent.click(lightButton!);
    });

    // Try to navigate away — confirm should fire (mock returns false = declined)
    act(() => {
      fireEvent.click(screen.getByText(/connect wallet/i));
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled(); // Declined navigation
  });

  it("detects dirty state when display currency is changed", () => {
    // Accept the confirm dialog
    vi.mocked(window.confirm).mockReturnValue(true);

    render(<SettingsContent />);

    const select = getCurrencySelect();
    expect(select).not.toBeNull();

    // Change currency value
    act(() => {
      fireEvent.change(select!, { target: { value: "XLM" } });
    });

    // Try to navigate away — confirm should fire
    act(() => {
      fireEvent.click(screen.getByText(/connect wallet/i));
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(push).toHaveBeenCalled(); // Accepted navigation
  });

  it("detects dirty state when amount format is changed", () => {
    render(<SettingsContent />);

    // Find the amount format buttons
    const allButtons = screen.getAllByRole("button");
    const compactButton = allButtons.find((b) => b.textContent?.includes("Compact"));
    expect(compactButton).toBeDefined();

    act(() => {
      fireEvent.click(compactButton!);
    });

    // Navigate with the disconnect button
    const disconnectBtn = screen.getByText(/disconnect wallet/i);
    act(() => {
      fireEvent.click(disconnectBtn);
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  it("detects dirty state when decimal places is changed", () => {
    render(<SettingsContent />);

    // Find the decimal places buttons
    const allButtons = screen.getAllByRole("button");
    const fourDecimalsBtn = allButtons.find((b) => b.textContent?.includes("4 decimals"));
    expect(fourDecimalsBtn).toBeDefined();

    act(() => {
      fireEvent.click(fourDecimalsBtn!);
    });

    // Navigate with the disconnect button
    const disconnectBtn = screen.getByText(/disconnect wallet/i);
    act(() => {
      fireEvent.click(disconnectBtn);
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  it("does not show confirm when no changes were made", () => {
    render(<SettingsContent />);

    // Navigate away with disconnect — no changes made
    const disconnectBtn = screen.getByText(/disconnect wallet/i);
    act(() => {
      fireEvent.click(disconnectBtn);
    });

    // Should NOT show confirm
    expect(window.confirm).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it("restores dirty state to clean after disconnect", () => {
    render(<SettingsContent />);

    // No changes were made, so disconnect should work without confirm
    const disconnectBtn = screen.getByText(/disconnect wallet/i);
    act(() => {
      fireEvent.click(disconnectBtn);
    });

    expect(window.confirm).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
