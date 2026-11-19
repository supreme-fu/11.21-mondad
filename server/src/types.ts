export type ReceiptMode = 'simulation' | 'monad-testnet';
export type ReceiptStatus = 'not_requested' | 'queued' | 'submitted' | 'confirmed' | 'failed';

export interface UserRow {
  id: string;
  demo_key: string | null;
  display_name: string;
  status: 'active' | 'deleted';
  created_at: string;
}

export interface ReceiptRow {
  completion_id: string;
  receipt_id: string;
  chain_id: number;
  contract_address: string;
  tx_hash: string | null;
  status: ReceiptStatus;
  mode: ReceiptMode;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderSubmission {
  txHash: string;
  chainId: number;
  contractAddress: string;
}

export interface ProviderResult extends ProviderSubmission {
  explorerUrl: string | null;
}

/** provider 自述的链与合约，落库时不依赖环境变量快照。 */
export interface ProviderDescriptor {
  chainId: number;
  contractAddress: string;
}

export interface ReceiptProvider {
  describe(): ProviderDescriptor;
  /**
   * 登记一个凭证编号。
   * onSubmitted 在交易广播后、确认前调用，用来把交易哈希先落库。
   * control 为中止信号：账户注销或服务退出后被触发，provider 必须在真正广播前检查它。
   */
  register(
    receipt: ReceiptRow,
    onSubmitted: (submission: ProviderSubmission) => void | Promise<void>,
    control?: AbortSignal,
  ): Promise<ProviderResult>;
  /** 退出时释放连接与轮询；没有外部连接的 provider 可不实现。 */
  destroy?(): void;
}
