import type { Address } from "viem";

export interface Eip1193RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export interface Eip1193Provider {
  request(args: Eip1193RequestArguments): Promise<unknown>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
  isMetaMask?: boolean;
  isOKExWallet?: boolean;
  isRabby?: boolean;
  isTrust?: boolean;
  isCoinbaseWallet?: boolean;
  isBitKeep?: boolean;
  providers?: Eip1193Provider[];
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: Eip1193Provider;
}

export interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: "eip6963:announceProvider";
  detail: EIP6963ProviderDetail;
}

export interface SupportedWalletCatalogItem {
  id: string;
  name: string;
  rdns: string;
  downloadUrl: string;
  iconSvg: string;
  detectExplicitProvider: () => Eip1193Provider | null;
}

export interface WalletContextState {
  account: Address | null;
  chainId: number | null;
  isChainOk: boolean;
  provider: Eip1193Provider | null;
  activeWallet: EIP6963ProviderDetail | null;
  detectedWallets: EIP6963ProviderDetail[];
  connecting: boolean;
  switching: boolean;
  balance: string | null;
  balanceRaw: bigint | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (
    wallet: EIP6963ProviderDetail,
    options?: { requestPermissions?: boolean }
  ) => Promise<boolean>;
  changeAccount: (wallet?: EIP6963ProviderDetail) => Promise<boolean>;
  disconnect: () => void;
  switchToElectroneum: () => Promise<boolean>;
  switchAccount: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}
