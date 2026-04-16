import { isAddress } from 'viem';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const INITIA_BECH32_PREFIX = 'init';

function bech32HrpExpand(hrp: string): number[] {
  const values: number[] = [];
  for (let index = 0; index < hrp.length; index += 1) {
    values.push(hrp.charCodeAt(index) >> 5);
  }
  values.push(0);
  for (let index = 0; index < hrp.length; index += 1) {
    values.push(hrp.charCodeAt(index) & 31);
  }
  return values;
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;

  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < generators.length; index += 1) {
      if ((top >> index) & 1) {
        checksum ^= generators[index];
      }
    }
  }

  return checksum;
}

function decodeBech32(raw: string): { prefix: string; words: number[] } | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed !== trimmed.toLowerCase() || trimmed.includes('1') === false) {
    return null;
  }

  const separatorIndex = trimmed.lastIndexOf('1');
  if (separatorIndex < 1 || separatorIndex + 7 > trimmed.length) {
    return null;
  }

  const prefix = trimmed.slice(0, separatorIndex);
  const data = trimmed.slice(separatorIndex + 1);
  const words: number[] = [];

  for (const character of data) {
    const value = BECH32_CHARSET.indexOf(character);
    if (value === -1) {
      return null;
    }
    words.push(value);
  }

  if (bech32Polymod([...bech32HrpExpand(prefix), ...words]) !== 1) {
    return null;
  }

  return {
    prefix,
    words: words.slice(0, -6),
  };
}

function convertBech32WordsToBytes(words: number[]): Uint8Array | null {
  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;

  for (const word of words) {
    if (word < 0 || word > 31) {
      return null;
    }
    accumulator = (accumulator << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }

  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0) {
    return null;
  }

  return Uint8Array.from(bytes);
}

export function normalizeEvmWalletAddress(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || !isAddress(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function normalizeInitiaWalletAddress(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const decoded = decodeBech32(value);
  if (!decoded || decoded.prefix !== INITIA_BECH32_PREFIX) {
    return null;
  }

  const bytes = convertBech32WordsToBytes(decoded.words);
  if (!bytes || bytes.length !== 20) {
    return null;
  }

  return value.trim().toLowerCase();
}

export function normalizeSupportedWalletAddress(value: unknown): string | null {
  return normalizeEvmWalletAddress(value) ?? normalizeInitiaWalletAddress(value);
}
