# 核心链路整改与本地 EVM 验证记录（2026-11-10）

本文只记录 **server / contracts / .env.example** 范围内、本轮按 Astra 两轮独立审查完成的重写与验证。
所有数字都是本机实际跑出来的，命令与退出码原样附上；没有跑过的环节一律标注“未做”。

## 1. 范围与所有权

- 拥有并改动：`server/`（含其测试）、`contracts/`、`.env.example`、本文。
- 未改动：`app/`、`miniprogram/`、`badge-studio/`、`README.md`、`tests/miniprogram/`、e2e 与 Playwright 配置。
- 未部署任何真实测试网交易，未生成、未读取任何用户密钥；`.env` 不存在（仓库内只有 `.env.example`）。
- `server/data/do-something.db` 未读写：主库 birth == mtime == `2026-11-10 07:54:35`，md5 `4baa595978000a661340c379fa8b5d89`，`lsof` 无打开句柄。所有测试一律用 `mkdtempSync` 建的临时库。

## 2. 两轮 Astra 意见 → 整改映射

### 第一轮（8 项）

| Astra 意见 | 整改位置 | 证明测试 |
| --- | --- | --- |
| resume() 对模拟模式提前返回，测试把缺陷冻结成“预期” | `receipts.ts` `resume()` 两种模式都恢复，只认 `mode` 与链/合约都匹配的行 | `receipts.test.ts` 跨进程临时库：queue 阶段进程退出 → resume 阶段进程只调 `resume()`，未再 `request()`，状态转为 confirmed |
| dispose() 一开始就 closed，丢掉在途 onSubmitted 的哈希；关闭 4s <  dispose 5s | 拆成 `stopping`（拒绝新排程、清定时器）与 `closed`（禁止回调写库）；drain 窗口内在途哈希可落库；总期限 `DISPOSE_TIMEOUT_MS = 4000`，进程级强制退出 5000 | `receipts.test.ts` dispose 排放闸门：哈希保留；closed 之后回调再触发，`store.database.prepare('SELECT 1').get()` 抛错且无 console.error |
| 取消发生在 provider 等待 RPC 期间仍会广播 | `ReceiptProvider.register` 增加 `control?: AbortSignal`；provider 在队列执行时、重试前、广播前三次检查 | 本轮新增真实发送管线闸门测试（见 3.2） |
| 同模式不同合约会把旧凭证投到新合约、改写旧字段 | `sameChainTarget()` 严格比对链 ID + 合约地址（大小写不敏感）；不匹配且无哈希 → `failed` 且只写 `status/error/updated_at`；不匹配但有哈希 → 只告警，原样保留 | `evm-provider.integration.ts` 两个合约场景：旧已确认凭证不登记到新合约，`receipt_id / tx_hash / contract_address / chain_id` 全部不变 |
| exists() 恢复可能拿任意哈希编造浏览器链接 | `inspectHash()` 校验 `to`、`status === 1`、`ReceiptRegistered` 事件与目标编号；`findRegistrationTx()` 用 `getLogs` 找回真实交易；找不到返回空哈希 + `explorerUrl: null` | 污染哈希场景、getLogs 失败场景（explorerUrl 必须为 null） |
| 新测试自身缺陷（未认证期望 200、record 字段记错、假哈希不一致、关闭测试用了永不 resolve 的 promise） | 未认证期望改为 401；RecordingProvider 以 `submitted[]` 为唯一事实源；关闭测试改为可控迟到回调 | `receipts.test.ts`、`shutdown.test.ts` |
| 真实构建与检查、清理 | 见第 4 节命令与退出码 | — |
| 只用每场景新夹具规避 pending-nonce 滞后 | 同一 provider/submitter 连续两笔 + 两笔并发 + 别处先广播 + 未广播失败后恢复 | 见 3.1 |

### 第二轮（2 项实质风险）

1. **取消检查在 `sendRegistration` 之外不够**：`sendQueue.then → contract.registerReceipt` 内部还会 await populate / estimateGas / nonce，注销可能发生在这些 await 里然后照样广播。
   **整改**：`sendRegistration(receipt, control)` 把信号带进串行队列，队列真正执行时检查一次；重试前检查一次；`sendRegistrationOnce` 把发送拆成 `populateTransaction`（读 nonce、估 gas、取手续费，有网络等待）→ `signTransaction`（纯本地，无网络）→ **同步检查取消** → `provider.broadcastTransaction(signed)`。也就是说最后一个检查点位于“签名已完毕、只剩一次网络广播”的位置，注销或退出在此之前落地就一定不会广播。
   **证明**：`evm-provider.integration.ts`「真实发送管线中账户被注销：广播前的同步检查生效，一笔都不广播」——闸门卡在真实 `estimateGas` 里，任务在途时 `DELETE /api/account`，放开闸门后 `broadcasts === 0`、链上 nonce 不变、该编号不在链上，随后另一个账户的凭证仍能正常确认（队列没被拖死）。

2. **NonceManager 在 populate/send 之前就 increment**：`INSUFFICIENT_FUNDS`、估 gas 失败这类“明确没有广播”的失败也会占掉本地 nonce，只对 nonce 错误 reset 会让后续交易一直 pending。
   **整改**：不再依赖 `NonceManager.sendTransaction`（源码确认它在 `this.signer.populateTransaction(tx)` 之前就 `this.increment()`）。改为显式三步：
   - `populateTransaction` 阶段失败（取 nonce / 估 gas）→ `signer.reset()`；
   - `broadcastTransaction` 被节点拒收 → `signer.reset()`；
   - **只有广播成功才 `signer.increment()`**。
   同时把“nonce 被拒就重发”收紧为：先 `signer.reset()`，再用 `exists()` 核验链上是不是我们自己的交易已经登记过——已登记则沿用可验证哈希返回，未登记才重发一次。`isNonceRejection` 覆盖 nonce 相关与 replacement underpriced。
   **证明**：三条测试——
   - 「明确未广播的失败不占用 nonce，恢复后同编号提交成功」：余额清零后广播被节点以 `Sender doesn't have enough funds to send tx` 拒收，nonce 不变；同一 provider 实例恢复余额后提交成功，nonce 接着基线走（实测错误消息来自 `eth_sendRawTransaction`，正是 Astra 指出的那类失败）。
   - 「nonce 被别处占用而拒收，且链上已有该编号：沿用真实交易，不盲目重发」：沿用别处那笔交易，链上不产生第二笔。
   - 「nonce 被别处占用而拒收：重置本地计数后重发」：重发使用被占用的下一个 nonce，两个编号都正确登记，只产生一次提交回调。

## 3. 本地 EVM 实链验证（Hardhat，非 mock）

`npm run test:evm` = `npm run compile --prefix contracts` + `node scripts/test-evm-provider.mjs`：脚本自起本地节点、注入 `LOCAL_EVM_RPC_URL`，跑真实部署、真实广播、真实回执。**14 个用例全部通过，0 失败，总时长 10.50 s。**

### 3.1 nonce 与串行（Astra 第一轮第 8 项）

- 同一 provider 连续提交两个不同凭证：nonce 连续（`second = first + 1`），都确认，事件与编号一一对应。
- 两个并发 HTTP 申请：两条凭证各有自己的交易，逐条核对 `to` / status / 事件。
- 钱包在别处先广播过一笔：provider 提交的 nonce = 别处那笔的 nonce + 1（nonce 从 `getTransaction(hash)` 读，不用 `.wait()` 后的 receipt——后者没有 nonce 字段）。
- 未广播失败（余额不足）后同一 provider 恢复并成功：nonce 不跳号。

### 3.2 根因记录（为什么原来会 nonce 崩）

- **ethers 250 ms 响应缓存**：`JsonRpcProvider` 默认 `cacheTimeout = 250`，`eth_getTransactionCount` 会命中缓存返回旧 nonce，连发两笔即 `Nonce too low. Expected nonce to be 1 but got 0`。整改：provider 一律 `new JsonRpcProvider(request, undefined, { cacheTimeout: -1 })`。
- **NonceManager 的 increment 时机**：见第 2 节第二轮第 2 项，源码 `signer-noncemanager.ts` 中 `sendTransaction` 先 `this.increment()` 再 `populateTransaction`。
- **发送串行化**：`sendQueue` 保证同一钱包一笔一发，不靠 sleep。

## 4. 实跑命令与退出码（原样）

| 命令 | 退出码 | 实测结果 |
| --- | --- | --- |
| `npm run build --prefix server` | 0 | 编译通过（dist 只有 src 的 5 个文件，无临时脚本产物） |
| `npm test --prefix server` | 0 | tests 25 / suites 4 / pass 25 / fail 0 / duration 10539 ms |
| `npm test --prefix contracts` | 0 | 3 passing (238 ms) |
| `npm run test:evm` | 0 | tests 14 / pass 14 / fail 0 / duration 10503 ms |
| `npm run typecheck --prefix server` | 0 | `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json`（src + test 全量） |

未做：`npm run test:e2e`（Playwright，属 app/ 范围，非本次整改对象）。

## 5. 独立 RPC 核验（不经 ethers 封装）

临时脚本（已删除）自起 Hardhat、用普通 `Wallet` 部署合约，再让 `MonadReceiptProvider` 连续登记两个凭证，随后全部用原生 `fetch` JSON-RPC 复核：

```
chainId(local)=0x7a69
{"nonce":1,"txTo":true,"receiptTo":true,"status":"0x1","eventMatches":true,"logQueryHash":"与 txHash 一致"}
{"nonce":2,"txTo":true,"receiptTo":true,"status":"0x1","eventMatches":true,"logQueryHash":"与 txHash 一致"}
hardhat pid=... cleaned
```

即：`eth_getTransactionByHash.to`、`eth_getTransactionReceipt.to`、`status = 0x1`、`ReceiptRegistered` 事件（topic0 = `ethers.id('ReceiptRegistered(bytes32)')`、topic1 = receiptId）、`eth_getLogs` 反查，五项全部对上；nonce 1 → 2 连续。

## 6. 真实 Monad 测试网的 RPC 事实（2026-11-10 复测）

- `https://rpc.ankr.com/monad_testnet` → `{"result":"0x279f"}`（10143）可用。
- `https://testnet-rpc.monad.xyz` → `{"code":-32002,"message":"blocked: restricted region"}`（当前网络区域被官方默认策略拒绝）。
- `.env.example` 已按此书写：默认 `RECEIPT_MODE=simulation`，`MONAD_CHAIN_ID=10143` 且“填错服务端拒绝启动”（本地 31337 联调由测试直接注入 provider，不靠改环境变量），并把 Ankr 地址列为可选注释。
- **RPC 可用性的准确表述**：官方默认 RPC 在本机所在网络区域受限（`blocked: restricted region`），这是官方按区域默认收紧，**不是「Monad 链不可用」，也不是「所有 RPC 都不可用」**——Ankr 镜像 `https://rpc.ankr.com/monad_testnet` 已实测可读（chainId 10143）。要换区域或换官方入口，是网络路径问题，不是链上事实问题。
- **实链未执行的原因只有一项：用户选择等待钱包与 MON 配置**：
  1. 钱包 / 私钥未配置——`MONAD_CONTRACT_ADDRESS` 与 `MONAD_TESTNET_PRIVATE_KEY` 为空时 `assertReady()` 直接拒绝发送，不会产出任何交易；
  2. 测试 MON 未到位——没有燃料就无法完成部署与确认。
  用户明确选择：等专用测试钱包与测试 MON 配置好之后再做部署与确认，本轮只做本地 EVM（14 项）。因此目前不存在任何 Monad 合约地址、交易哈希或部署记录。官方 RPC 的区域限制与这条等待是两件事，不合并叙述成「RPC 阻塞导致无法上链」。

## 7. 边界与常量（写死值，非“建议”）

| 项 | 值 |
| --- | --- |
| 真实链 ID | 10143（0x279f），`MONAD_CHAIN_ID` 只接受它 |
| 本地联调链 ID | 31337（0x7a69），由测试注入 |
| 单次 RPC 超时 | 30 s（`FetchRequest.timeout`） |
| 广播后等确认超时 | 60 s，超时只标记失败，哈希已先落库 |
| dispose 总期限 | 4 s（`DISPOSE_TIMEOUT_MS`），进程级强制退出 5 s |
| 排程延迟 | 120 ms（合并没有必要的重复发送） |
| getLogs 回退窗口 | 先查全历史，RPC 限范围时退回最近 200 000 个块 |
| nonce 重发 | 仅 nonce 类拒收，且 `exists()` 核验未登记后才重发一次 |

## 8. 清理确认

- 临时核验脚本已删除（`server/.verify-tmp.ts` 不存在）。
- 无残留 Hardhat 进程（`ps -eo pid,command | grep "hardhat node"` 为空）；所有本地节点都用显式 PID 启停，未使用 `pkill` 模糊匹配。
- 无 `.env`、无 `deployments/` 目录、无任何伪造的 monad-testnet 部署记录。
- `server/data/do-something.db` 未读写（见第 1 节）。
