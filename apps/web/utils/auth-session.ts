export function normalizeComparableAddress(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function doesSessionMatchWallet(
  sessionWalletAddress: string | null | undefined,
  walletAddresses: Array<string | null | undefined>,
): boolean {
  const normalizedSessionAddress = normalizeComparableAddress(sessionWalletAddress);
  if (!normalizedSessionAddress) return false;

  return walletAddresses.some((walletAddress) => (
    normalizeComparableAddress(walletAddress) === normalizedSessionAddress
  ));
}
