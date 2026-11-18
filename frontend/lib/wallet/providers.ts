import type {
  EIP6963AnnounceProviderEvent,
  EIP6963ProviderDetail,
  Eip1193Provider,
  SupportedWalletCatalogItem,
} from "./types";

declare global {
  interface Window {
    ethereum?: any;
    okxwallet?: any;
    rabby?: any;
    trustwallet?: any;
    coinbaseWalletExtension?: any;
    bitkeep?: {
      ethereum?: any;
    };
    phantom?: {
      ethereum?: any;
    };
  }
}

// ----------------------------------------------------------------------------
// Official Crisp Inline SVG Icons
// ----------------------------------------------------------------------------

export const WALLET_ICONS = {
  okx: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="24" fill="#000000"/><rect x="25" y="25" width="22" height="22" fill="#FFFFFF"/><rect x="73" y="25" width="22" height="22" fill="#FFFFFF"/><rect x="49" y="49" width="22" height="22" fill="#FFFFFF"/><rect x="25" y="73" width="22" height="22" fill="#FFFFFF"/><rect x="73" y="73" width="22" height="22" fill="#FFFFFF"/></svg>`,
  metamask: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M29.07 3.32L17.58 11.83L19.72 6.78L29.07 3.32Z" fill="#E2761B" stroke="#E2761B" stroke-width="0.5"/><path d="M2.93 3.32L14.33 11.91L12.28 6.78L2.93 3.32Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M24.96 23.47L22.01 27.97L28.16 29.67L29.93 23.58L24.96 23.47Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M2.07 23.58L3.84 29.67L9.99 27.97L7.04 23.47L2.07 23.58Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M9.66 14.15L7.84 16.92L13.88 17.18L13.68 10.73L9.66 14.15Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M22.34 14.15L18.23 10.64L18.06 17.18L24.16 16.92L22.34 14.15Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M9.99 27.97L13.43 26.3L10.51 23.63L9.99 27.97Z" fill="#D7C1B3" stroke="#D7C1B3" stroke-width="0.5"/><path d="M22.01 27.97L21.49 23.63L18.57 26.3L22.01 27.97Z" fill="#D7C1B3" stroke="#D7C1B3" stroke-width="0.5"/><path d="M13.43 26.3L13.78 22.95L10.7 23.16L13.43 26.3Z" fill="#233447" stroke="#233447" stroke-width="0.5"/><path d="M18.57 26.3L21.3 23.16L18.22 22.95L18.57 26.3Z" fill="#233447" stroke="#233447" stroke-width="0.5"/><path d="M13.78 22.95L13.39 19.34L10.23 19.16L10.7 23.16L13.78 22.95Z" fill="#CD6116" stroke="#CD6116" stroke-width="0.5"/><path d="M18.22 22.95L21.3 23.16L21.77 19.16L18.61 19.34L18.22 22.95Z" fill="#CD6116" stroke="#CD6116" stroke-width="0.5"/><path d="M18.06 17.18L18.61 19.34L21.77 19.16L24.16 16.92L18.06 17.18Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M10.23 19.16L13.39 19.34L13.88 17.18L7.84 16.92L10.23 19.16Z" fill="#E4751F" stroke="#E4751F" stroke-width="0.5"/><path d="M18.61 19.34L18.22 22.95L18.57 26.3L21.49 23.63L22.01 27.97L24.96 23.47L21.77 19.16L18.61 19.34Z" fill="#F6851B" stroke="#F6851B" stroke-width="0.5"/><path d="M7.04 23.47L9.99 27.97L10.51 23.63L13.43 26.3L13.78 22.95L13.39 19.34L10.23 19.16L7.04 23.47Z" fill="#F6851B" stroke="#F6851B" stroke-width="0.5"/><path d="M16 16.35L17.58 11.83L16 9.87L14.42 11.83L16 16.35Z" fill="#763D16" stroke="#763D16" stroke-width="0.5"/><path d="M16 16.35L13.88 17.18L13.39 19.34L16 19.78L18.61 19.34L18.06 17.18L16 16.35Z" fill="#F6851B" stroke="#F6851B" stroke-width="0.5"/><path d="M16 19.78L13.78 22.95L18.22 22.95L16 19.78Z" fill="#C0AC9D" stroke="#C0AC9D" stroke-width="0.5"/><path d="M16 28.5L13.43 26.3L18.57 26.3L16 28.5Z" fill="#161616" stroke="#161616" stroke-width="0.5"/></svg>`,
  rabby: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="24" fill="#8697FF"/><path d="M38 42C38 31 47 22 58 22C69 22 78 31 78 42C78 51.5 71.5 59.5 62.5 61.5L64 78H52L53.5 61.5C44.5 59.5 38 51.5 38 42Z" fill="white"/><ellipse cx="50" cy="40" rx="4" ry="6" fill="#8697FF"/><ellipse cx="66" cy="40" rx="4" ry="6" fill="#8697FF"/><path d="M54 50C54 50 56 53 58 53C60 53 62 50 62 50" stroke="#8697FF" stroke-width="3" stroke-linecap="round"/><path d="M40 76C40 76 46 84 58 84C70 84 76 76 76 76" stroke="white" stroke-width="6" stroke-linecap="round"/><path d="M30 60C30 60 25 72 32 86C39 100 60 98 60 98" stroke="white" stroke-width="5" stroke-linecap="round"/><path d="M90 60C90 60 95 72 88 86C81 100 60 98 60 98" stroke="white" stroke-width="5" stroke-linecap="round"/></svg>`,
  trust: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="24" fill="#0500FF"/><path d="M60 22L86 35V66C86 82 75 95 60 100C45 95 34 82 34 66V35L60 22Z" fill="none" stroke="white" stroke-width="8" stroke-linejoin="round"/><path d="M50 60L57 67L71 53" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  coinbase: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="24" fill="#0052FF"/><rect x="36" y="36" width="48" height="48" rx="10" fill="white"/><rect x="48" y="48" width="24" height="24" rx="4" fill="#0052FF"/></svg>`,
  bitget: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="24" fill="#00F0FF"/><path d="M38 34H64C74 34 82 42 82 52C82 58 78 63 73 66C80 69 84 75 84 82C84 92 76 100 66 100H38V34Z" fill="#001826"/><circle cx="56" cy="52" r="7" fill="#00F0FF"/><circle cx="56" cy="82" r="7" fill="#00F0FF"/></svg>`,
  generic: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="24" fill="#1E293B"/><path d="M36 40C36 36.6863 38.6863 34 42 34H78C81.3137 34 84 36.6863 84 40V80C84 83.3137 81.3137 86 78 86H42C38.6863 86 36 83.3137 36 80V40Z" stroke="#22D3EE" stroke-width="6"/><path d="M72 54H86V66H72V54Z" fill="#22D3EE"/><circle cx="79" cy="60" r="2.5" fill="#0F172A"/></svg>`,
};

function toDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ----------------------------------------------------------------------------
// Supported Wallets Catalog (With Official Links & Explicit Fallback Detectors)
// ----------------------------------------------------------------------------

export const SUPPORTED_WALLET_CATALOG: readonly SupportedWalletCatalogItem[] = [
  {
    id: "okx",
    name: "OKX Wallet",
    rdns: "com.okex.wallet",
    downloadUrl: "https://www.okx.com/web3",
    iconSvg: WALLET_ICONS.okx,
    detectExplicitProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.okxwallet) return window.okxwallet;
      if (window.ethereum?.isOKExWallet) return window.ethereum;
      if (Array.isArray(window.ethereum?.providers)) {
        const p = window.ethereum.providers.find((prov: any) => prov.isOKExWallet);
        if (p) return p;
      }
      return null;
    },
  },
  {
    id: "metamask",
    name: "MetaMask",
    rdns: "io.metamask",
    downloadUrl: "https://metamask.io/download/",
    iconSvg: WALLET_ICONS.metamask,
    detectExplicitProvider: () => {
      if (typeof window === "undefined") return null;
      // Isolate MetaMask specifically so OKX/Rabby/Brave do not hijack it
      if (Array.isArray(window.ethereum?.providers)) {
        const p = window.ethereum.providers.find(
          (prov: any) =>
            prov.isMetaMask && !prov.isOKExWallet && !prov.isRabby && !prov.isTrust && !prov.isBitKeep
        );
        if (p) return p;
      }
      if (
        window.ethereum?.isMetaMask &&
        !window.ethereum?.isOKExWallet &&
        !window.ethereum?.isRabby &&
        !window.ethereum?.isTrust &&
        !window.ethereum?.isBitKeep
      ) {
        return window.ethereum;
      }
      return null;
    },
  },
  {
    id: "rabby",
    name: "Rabby Wallet",
    rdns: "io.rabby",
    downloadUrl: "https://rabby.io/",
    iconSvg: WALLET_ICONS.rabby,
    detectExplicitProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.rabby) return window.rabby;
      if (window.ethereum?.isRabby) return window.ethereum;
      if (Array.isArray(window.ethereum?.providers)) {
        const p = window.ethereum.providers.find((prov: any) => prov.isRabby);
        if (p) return p;
      }
      return null;
    },
  },
  {
    id: "trust",
    name: "Trust Wallet",
    rdns: "com.trustwallet.app",
    downloadUrl: "https://trustwallet.com/browser-extension",
    iconSvg: WALLET_ICONS.trust,
    detectExplicitProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.trustwallet) return window.trustwallet;
      if (window.ethereum?.isTrust) return window.ethereum;
      if (Array.isArray(window.ethereum?.providers)) {
        const p = window.ethereum.providers.find((prov: any) => prov.isTrust);
        if (p) return p;
      }
      return null;
    },
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    rdns: "com.coinbase.wallet",
    downloadUrl: "https://www.coinbase.com/wallet/downloads",
    iconSvg: WALLET_ICONS.coinbase,
    detectExplicitProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
      if (window.ethereum?.isCoinbaseWallet) return window.ethereum;
      if (Array.isArray(window.ethereum?.providers)) {
        const p = window.ethereum.providers.find((prov: any) => prov.isCoinbaseWallet);
        if (p) return p;
      }
      return null;
    },
  },
  {
    id: "bitget",
    name: "Bitget Wallet",
    rdns: "com.bitget.web3",
    downloadUrl: "https://web3.bitget.com/en/wallet-download",
    iconSvg: WALLET_ICONS.bitget,
    detectExplicitProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.bitkeep?.ethereum) return window.bitkeep.ethereum;
      if (window.ethereum?.isBitKeep) return window.ethereum;
      if (Array.isArray(window.ethereum?.providers)) {
        const p = window.ethereum.providers.find((prov: any) => prov.isBitKeep);
        if (p) return p;
      }
      return null;
    },
  },
];

// ----------------------------------------------------------------------------
// Multi-Wallet Discovery Store (EIP-6963 + Explicit Providers)
// ----------------------------------------------------------------------------

class WalletDiscoveryManager {
  private eip6963Wallets = new Map<string, EIP6963ProviderDetail>();
  private listeners = new Set<() => void>();
  private initialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
    }
  }

  public init() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    // 1. Listen for EIP-6963 announcements
    const handleAnnounce = (event: Event) => {
      const e = event as EIP6963AnnounceProviderEvent;
      if (!e.detail || !e.detail.info || !e.detail.provider) return;
      const rdns = e.detail.info.rdns.toLowerCase();
      this.eip6963Wallets.set(rdns, e.detail);
      this.notify();
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounce);

    // 2. Request providers from already initialized extensions
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // 3. Fallback request retry (extensions sometimes load asynchronously)
    setTimeout(() => {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      this.notify();
    }, 500);

    setTimeout(() => {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      this.notify();
    }, 1500);
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Returns a unified list of detected wallet extensions.
   * Prioritizes EIP-6963 announcements, and fills with explicit window fallbacks.
   */
  public getDetectedWallets(): EIP6963ProviderDetail[] {
    const list: EIP6963ProviderDetail[] = [];
    const seenRdns = new Set<string>();

    // 1. Add EIP-6963 announced wallets
    for (const [rdns, detail] of this.eip6963Wallets.entries()) {
      seenRdns.add(rdns);
      list.push(detail);
    }

    // 2. Check catalog explicit window providers if not already announced via EIP-6963
    for (const item of SUPPORTED_WALLET_CATALOG) {
      const rdns = item.rdns.toLowerCase();
      if (!seenRdns.has(rdns)) {
        const explicitProvider = item.detectExplicitProvider();
        if (explicitProvider) {
          seenRdns.add(rdns);
          list.push({
            info: {
              uuid: item.id,
              name: item.name,
              icon: toDataUri(item.iconSvg),
              rdns: item.rdns,
            },
            provider: explicitProvider,
          });
        }
      }
    }

    // 3. Check for generic window.ethereum if nothing detected yet
    if (list.length === 0 && typeof window !== "undefined" && window.ethereum) {
      list.push({
        info: {
          uuid: "injected-browser",
          name: "Browser Injected Wallet",
          icon: toDataUri(WALLET_ICONS.generic),
          rdns: "injected.browser",
        },
        provider: window.ethereum,
      });
    }

    return list;
  }
}

export const walletDiscovery = new WalletDiscoveryManager();
