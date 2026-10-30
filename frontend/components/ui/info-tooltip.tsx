"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, Info, X } from "lucide-react";

import { cn } from "@/lib/cn";

export interface InfoTooltipProps {
  /** The term or heading for this concept, e.g. "EOA Wallet" */
  term?: React.ReactNode;
  /** Beginner-friendly definition/explanation */
  definition: React.ReactNode;
  /** Custom trigger child elements. If not provided, renders term or icon */
  children?: React.ReactNode;
  /** Whether to show a micro info icon next to trigger */
  showIcon?: boolean;
  /** Type of icon if showIcon is true: "info" (default) or "help" */
  iconType?: "info" | "help";
  /** Subtle dotted underline styling under the trigger */
  underline?: boolean;
  /** Preferred placement: "top" | "bottom" | "auto" */
  side?: "top" | "bottom" | "auto";
  /** Custom class for trigger element */
  className?: string;
  /** Custom class for tooltip popup bubble */
  contentClassName?: string;
  /** Stop event propagation on click (default true to prevent row selection) */
  stopPropagation?: boolean;
  /** Optional badge/tag text displayed inside header, e.g. "DeFi Metric" or "PRO" */
  category?: string;
}

/**
 * Standard Web3 Glossary mapping covering terms across MyVerse, PulseSwap, and PulseDrop.
 */
export const WEB3_GLOSSARY = {
  // Wallet & Contract Types
  eoa: {
    term: "EOA Wallet",
    definition:
      "Externally Owned Account — A standard personal crypto wallet (like MetaMask or Rabby) controlled by a human via a private key, rather than automated smart contract code.",
  },
  contract: {
    term: "Automated Smart Contract",
    definition:
      "Automated Smart Contract — An on-chain protocol contract or DEX liquidity pool holding tokens for trading/staking, not an individual person's wallet.",
  },
  proxy: {
    term: "ERC1967Proxy / Proxy Contract",
    definition:
      "Upgradeable Proxy Contract — A smart contract architecture commonly used by protocols, bridges, or token treasuries to manage ecosystem funds.",
  },
  burn: {
    term: "Burn / Null Address",
    definition:
      "Permanently Locked — Tokens sent to this address are removed from circulation forever and cannot be spent by anyone.",
  },

  // Holdings & Portfolio
  estBuyPrice: {
    term: "Est. Buy Price",
    definition:
      "Estimated average price paid per token, calculated from historical on-chain transfers into this wallet.",
  },
  unrealizedPnl: {
    term: "Unrealized PnL",
    definition:
      "Paper Profit or Loss on current holdings based on the live ElectroSwap market price versus the wallet's estimated entry cost.",
  },
  dustFilter: {
    term: "Dust Hidden (< $0.05)",
    definition:
      "Hides micro-balances and spam tokens worth less than 5 cents to keep your portfolio view clean.",
  },

  // DeFi & LP Positions
  impermanentLoss: {
    term: "Impermanent Loss (IL)",
    definition:
      "The difference in value between holding tokens inside a DEX liquidity pool versus simply holding them idle in your wallet.",
  },
  hodlBaseline: {
    term: "HODL Baseline",
    definition:
      "What your deposited tokens would be worth today if you had kept them in your wallet instead of providing liquidity.",
  },
  netLpReturn: {
    term: "Net LP Return",
    definition:
      "Your total liquidity pool performance after combining earned trading fees (0.3%) and Impermanent Loss.",
  },

  // NFTs
  erc721: {
    term: "ERC-721",
    definition:
      "Unique 1-of-1 Non-Fungible Token standard where every token ID is a distinct digital collectible.",
  },
  erc1155: {
    term: "ERC-1155",
    definition:
      "Semi-Fungible Multi-Token standard allowing a single contract to hold multiple editions of items or game assets.",
  },

  // Security & Intelligence
  revokeShield: {
    term: "Unlimited Approval / Revoke Shield",
    definition:
      "Token approvals allow smart contracts to spend tokens from your wallet. Revoking resets the allowance to 0 so a contract can no longer move your funds.",
  },

  // Swap & Multi-Sender
  slippageTolerance: {
    term: "Slippage Tolerance",
    definition:
      "The maximum price difference you are willing to accept between submitting a swap and its confirmation on-chain.",
  },
  priceImpact: {
    term: "Price Impact",
    definition:
      "How much your trade size directly moves the token's price inside the ElectroSwap liquidity pool.",
  },
  approvalPolicy: {
    term: "Exact (Safe) vs. Unlimited Approval",
    definition:
      "Exact mode only approves the precise amount needed for this single trade. Unlimited mode approves future trades without re-signing.",
  },
} as const;

/**
 * Resolves address-type glossary metadata for a given address and contract name.
 */
export function getAddressTypeGlossary(
  isContract: boolean,
  contractName?: string | null,
  address?: string
): { term: string; definition: string } {
  const lowerAddr = (address || "").toLowerCase();
  if (
    lowerAddr === "0x0000000000000000000000000000000000000000" ||
    lowerAddr === "0x000000000000000000000000000000000000dead"
  ) {
    return WEB3_GLOSSARY.burn;
  }

  const name = contractName || "";
  if (name.includes("Proxy") || name.includes("ERC1967")) {
    return WEB3_GLOSSARY.proxy;
  }

  if (
    isContract ||
    name.includes("Pool") ||
    name.includes("Pair") ||
    name.includes("Contract") ||
    name.includes("Router")
  ) {
    return {
      term: name ? `${name} (Smart Contract)` : WEB3_GLOSSARY.contract.term,
      definition: WEB3_GLOSSARY.contract.definition,
    };
  }

  return WEB3_GLOSSARY.eoa;
}

export function InfoTooltip({
  term,
  definition,
  children,
  showIcon = false,
  iconType = "info",
  underline = false,
  side = "auto",
  className,
  contentClassName,
  stopPropagation = true,
  category,
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: "top" | "bottom" }>({
    top: 0,
    left: 0,
    placement: "bottom",
  });
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const tooltipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(300, window.innerWidth - 32);
    const estimatedHeight = 110;

    // Horizontal centering clamped to viewport
    let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

    // Vertical placement preference
    const spaceAbove = triggerRect.top;
    const spaceBelow = window.innerHeight - triggerRect.bottom;

    let placement: "top" | "bottom" = "bottom";
    let top = triggerRect.bottom + 6;

    if (side === "top") {
      placement = "top";
      top = triggerRect.top - estimatedHeight - 6;
    } else if (side === "bottom") {
      placement = "bottom";
      top = triggerRect.bottom + 6;
    } else {
      // auto
      if (spaceBelow < estimatedHeight + 20 && spaceAbove > spaceBelow) {
        placement = "top";
        top = Math.max(16, triggerRect.top - estimatedHeight - 6);
      } else {
        placement = "bottom";
        top = triggerRect.bottom + 6;
      }
    }

    setCoords({ top, left, placement });
  }, [side]);

  const handleOpen = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    updatePosition();
    setIsOpen(true);
  };

  const handleClose = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (isOpen) {
      setIsOpen(false);
    } else {
      updatePosition();
      setIsOpen(true);
    }
  };

  // Close when tapping/clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        triggerRef.current &&
        tooltipRef.current &&
        !triggerRef.current.contains(target) &&
        !tooltipRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  const IconComponent = iconType === "help" ? HelpCircle : Info;

  const triggerContent = children ?? (
    <span className="inline-flex items-center gap-1">
      {term && <span>{term}</span>}
      <IconComponent className="h-3 w-3 text-cyan-400 opacity-80" />
    </span>
  );

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            if (stopPropagation) e.stopPropagation();
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className={cn(
          "inline-flex items-center gap-1 cursor-help transition select-none outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 rounded",
          underline && "border-b border-dotted border-slate-500/70 hover:border-cyan-400 text-slate-200",
          className
        )}
      >
        {triggerContent}
        {showIcon && children && (
          <IconComponent className="h-2.5 w-2.5 text-cyan-400/80 shrink-0 hover:text-cyan-300" />
        )}
      </span>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={tooltipRef}
                id={tooltipId}
                role="tooltip"
                initial={{ opacity: 0, scale: 0.94, y: coords.placement === "top" ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: coords.placement === "top" ? 4 : -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                onMouseEnter={() => {
                  if (leaveTimeoutRef.current) {
                    clearTimeout(leaveTimeoutRef.current);
                    leaveTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={handleClose}
                onClick={(e) => {
                  if (stopPropagation) e.stopPropagation();
                }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  width: Math.min(300, window.innerWidth - 32),
                  zIndex: 99999,
                }}
                className={cn(
                  "rounded-xl border border-cyan-500/30 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur-md leading-relaxed",
                  "ring-1 ring-cyan-500/20",
                  contentClassName
                )}
              >
                {/* Header with Term and Close Button */}
                {(term || category) && (
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-cyan-300 text-[0.72rem] tracking-tight">
                        {term}
                      </span>
                      {category && (
                        <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1 py-0.2 text-[0.55rem] font-bold text-cyan-400 uppercase">
                          {category}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        if (stopPropagation) e.stopPropagation();
                        setIsOpen(false);
                      }}
                      className="text-slate-400 hover:text-slate-100 p-0.5 rounded transition"
                      aria-label="Close tooltip"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Definition Content */}
                <p className="text-[0.68rem] text-slate-300 leading-normal">
                  {definition}
                </p>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
