export const MONAD_TESTNET_EXPLORER = 'https://testnet.monadvision.com';

export const LITTLE_PRINCE_CONTRACTS = {
  chainId: 10143,
  bookTitle: '《小王子》',
  readingChallenge: {
    name: 'ReadingChallenge',
    address: '0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2',
    txHash: '0x4d584c9d1fa52ba47ea80fd8c15e5373a84e3c85c5fcb7cf7f166cb514caa164',
    explorerUrl: `${MONAD_TESTNET_EXPLORER}/address/0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2`,
    txExplorerUrl: `${MONAD_TESTNET_EXPLORER}/tx/0x4d584c9d1fa52ba47ea80fd8c15e5373a84e3c85c5fcb7cf7f166cb514caa164`,
  },
  readingBadge: {
    name: 'ReadingBadge',
    address: '0xf584037417B6A4734656641904B009C0BAB4E720',
    explorerUrl: `${MONAD_TESTNET_EXPLORER}/address/0xf584037417B6A4734656641904B009C0BAB4E720`,
  },
  rewardToken: {
    name: 'DemoRewardToken',
    symbol: 'DSDEMO',
    address: '0xAEc92f5A8D121b6e3FaFcB429dC4B7Cc24781353',
    txHash: '0x27485f76ce117ccfad83f581250144435bcf2a15c9c4b19fa868c41cbf015d29',
    explorerUrl: `${MONAD_TESTNET_EXPLORER}/address/0xAEc92f5A8D121b6e3FaFcB429dC4B7Cc24781353`,
  },
} as const;

export const SAMPLE_LITTLE_PRINCE_REVIEW =
  '我原以为驯养是占有，读到狐狸那一章才发现，它更像是主动拿出时间，让一个原本普通的人对自己变得独一无二。';

export function shortenHex(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
