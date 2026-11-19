export const enrollmentTypes = {
  Enrollment: [
    { name: 'campaignId', type: 'uint256' },
    { name: 'reader', type: 'address' },
    { name: 'subject', type: 'bytes32' },
    { name: 'alreadyCompleted', type: 'bool' },
    { name: 'deadline', type: 'uint64' },
  ],
};

export const achievementTypes = {
  Achievement: [
    { name: 'campaignId', type: 'uint256' },
    { name: 'reader', type: 'address' },
    { name: 'subject', type: 'bytes32' },
    { name: 'kind', type: 'uint8' },
    { name: 'coverageBps', type: 'uint16' },
    { name: 'lastChapterCompleted', type: 'bool' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'occurredAt', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
  ],
};

export function attestationDomain(chainId, verifyingContract) {
  return { name: 'DoSomethingReading', version: '1', chainId, verifyingContract };
}
