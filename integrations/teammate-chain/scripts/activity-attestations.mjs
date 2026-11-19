export const joinTypes = { Join: [{ name: 'activityId', type: 'uint256' }, { name: 'member', type: 'address' }, { name: 'deadline', type: 'uint64' }] };
export const proofTypes = { Proof: [
  { name: 'activityId', type: 'uint256' }, { name: 'member', type: 'address' }, { name: 'kind', type: 'uint8' },
  { name: 'score', type: 'uint16' }, { name: 'finalCheck', type: 'bool' }, { name: 'occurredAt', type: 'uint64' },
  { name: 'deadline', type: 'uint64' }, { name: 'evidenceHash', type: 'bytes32' },
] };
