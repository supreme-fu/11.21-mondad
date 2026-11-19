# Do Something 原型架构与数据流

当前原型包含多活动发布、报名、模拟成果、链上奖励、个人空间和好友邀请。以下图可直接在 GitHub 阅读。要切换流程或点击节点，可在本机用浏览器打开[交互版](index.html)，也可运行 `npm run preview` 后访问 `http://127.0.0.1:4173`。

每个操作的请求、存储、上链参数和回执字段见[操作字段](operation-fields.md)。

## 托管架构

部署后，浏览器通过 HTTPS 域名加载页面并调用同域 API。HTTPS 网关把请求转发到服务器的 Node.js 应用，应用核验演示访问口令、执行规则与签名流程。[服务器部署指南](deployment.md) · [应用后端](../scripts/prototype-server.mjs)

后端把规则全文、模拟进度、书评、人物和好友记录写到 `PROTOTYPE_STATE_PATH` 指定的持久化文件。需要上链时，后端用演示钱包签交易，通过 RPC 发给 Monad 公共测试网，再把确认结果回传给浏览器。测试网记录报名、测试代币余额和勋章归属。[应用 API](../scripts/prototype-server.mjs) · [测试网调用](../scripts/prototype-chain.mjs)

## 模块关系

实线箭头表示请求、调用或写入。虚线箭头表示读取的数据或返回结果。

```mermaid
flowchart LR
    subgraph Client[浏览器]
        UI[活动卡、详情、个人空间、链上后台]
    end
    subgraph Server[服务器]
        Gateway[HTTPS 网关]
        Catalog[内置身份、模板和活动样例]
        API[API 校验、编排与回执处理]
        File[(服务器 JSON 状态文件)]
        Adapter[核验签名、钱包签名与 RPC]
    end
    subgraph Testnet[Monad 公共测试网]
        Hub[ActivityHub 活动、履约、勋章]
        Token[DSDEMO 余额与转账]
    end
    UI -->|HTTPS 页面与 API 请求| Gateway
    Gateway -->|身份、活动标识、操作参数| API
    API -.->|页面、JSON 状态和核对结果| Gateway
    Gateway -.->|HTTPS 响应| UI
    Catalog -.->|人物与模板| API
    API -->|规则、成果、人物、好友与交易记录| File
    File -.->|已保存状态及待确认交易| API
    API -->|校验后的活动动作与查询| Adapter
    Adapter -.->|回执、区块和合约读数| API
    Adapter -->|广播交易或只读调用| Hub
    Adapter -->|代币授权与余额查询| Token
    Hub -->|预算入池、发奖与余额退回| Token
```

浏览器使用 `app.js` 控制活动预览与开门，`pixels.js` 渲染同一角色在活动页和个人空间的外观。上传或绘制完成后，只将转换后的 32 × 32 像素数据写入服务器状态文件。选好的 `as` 是演示身份。后端把身份映射到服务器演示钱包，并按身份整理页面数据。核验账户签的是报名或领取凭证，演示钱包签的是发送到 Monad 的交易。[浏览器请求](../prototype/app.js) · [应用 API](../scripts/prototype-server.mjs) · [签名与合约调用](../scripts/prototype-chain.mjs#L13)

## 发布活动与报名

```mermaid
sequenceDiagram
    participant W as 浏览器
    participant S as 应用 API
    participant F as 服务器状态文件
    participant M as Monad 合约
    W->>S: 提交规则全文、名额、期限和奖励
    S->>F: 保存草稿及 rulesHash
    S->>M: DSDEMO 授权，ActivityHub.publish
    M-->>S: ActivityPublished 回执和链上活动编号
    S->>F: 更新活动编号与回执
    S-->>W: 返回可见活动和规则
    W->>S: 点击免费报名
    S->>M: 核验账户签发 Join，演示钱包提交 join
    M-->>S: MemberJoined 回执
    S->>F: 保存报名时间和演示基线
    S-->>W: 我的活动和同场伙伴更新
```

每场预算等于名额乘以每人可领的完成奖与贡献奖总和。活动规则全文留在服务器，合约保存摘要与可执行条件，如名额、时间和门槛。奖励领取截止后，主办方可取回本场未使用奖励。每场活动以独立的链上活动编号记账，同一个钱包可以报名多个活动。[发布与报名](../scripts/prototype-server.mjs) · [活动合约](../contracts/ActivityHub.sol#L79)

## 模拟成果怎样变成链上奖励

```mermaid
sequenceDiagram
    participant W as 活动详情或个人空间
    participant S as 应用 API 与签名服务
    participant F as 服务器状态文件
    participant H as ActivityHub 与 DSDEMO
    W->>S: 模拟进度、最终成果状态或贡献正文
    S->>F: 校验后存原始成果及发生时间
    S-->>W: 返回当前进度和能否领取
    W->>S: 点击领取完成奖或贡献奖
    F-->>S: 提供该活动、该居民的已存成果
    S->>F: 保存交易哈希和待确认交易
    S->>H: 广播 claim，携带 Proof、签名及 evidenceHash
    H-->>S: 回执、RewardPaid、完成奖的 CompletionBadge
    S->>F: 更新领取状态、活动余额计算所需记录和勋章 ID
    S-->>W: 页面读取领奖结果，勋章库显示已确认编号
```

合约核对钱包、报名、时间、签名、奖励类别和领取次数。完成奖还核对分数和活动设置的最终成果条件，并在同一笔交易派奖与铸造不可转让勋章。贡献奖只派奖。共读样例的 80% 与正文末章是活动规则，数据来自模拟提交。未来接入微信读书后，实际阅读事实还需要授权数据来源和核验。[模拟成果与领取](../scripts/prototype-server.mjs) · [链上校验](../contracts/ActivityHub.sol#L103)

## 好友和链上核对各走哪条路径

```mermaid
flowchart LR
    Visit[访问居民主页] -->|发送、接受、拒绝或撤回| Friends[好友 API 校验双方与邀请状态]
    Friends -->|保存关系| LocalFile[(服务器 JSON 文件)]
    LocalFile -.->|API 返回和当前身份相关的邀请与好友| Room[我的空间]
    Ledger[链上后台] -->|GET /api/verify 与活动标识| Verify[后端定位链上活动并固定区块]
    Verify -->|只读 activities 调用| Hub[ActivityHub]
    Hub -.->|规则摘要、主办方、人数、余额| Verify
    Verify -.->|实读值与服务器记录比对结果| Ledger
```

普通页面状态由服务器记录与已确认回执汇总，钱包余额直接读代币合约。后台交易列表按后端提交的哈希追踪回执。页面的「读取合约并核对」再对指定活动和区块直接查询合约。好友操作和成果同步写入服务器存储。[应用后端](../scripts/prototype-server.mjs)

## 数据落点

| 数据 | 来源 | 保存位置与使用方式 |
| --- | --- | --- |
| 虚拟居民与活动模板 | 内置目录 | 后端读取目录，页面以 `as` 选择演示身份 |
| 规则全文、样例进度、贡献正文 | 发布者或参与者的页面输入 | 服务器状态文件，详情、核验与社交展示读取 |
| 邀请与好友状态 | 居民主页上的动作 | 服务器状态文件，API 按演示身份返回 |
| 自定义像素人物 | 浏览器转换后的 32 × 32 RGBA 数据 | 服务器状态文件，活动页和个人空间共同读取 |
| 规则摘要、名额、时间、门槛、活动预算 | 发布时从规则派生 | `ActivityHub`，用于报名和领奖条件判断 |
| 报名、领取标记、勋章归属 | 已确认链上交易 | `ActivityHub`，后端按回执更新展示记录 |
| 成果摘要和测试代币转账 | 后端核验凭证与奖励调用 | Monad 领取交易及相关合约事件，`DSDEMO` 余额由代币合约维护 |
| 交易哈希与回执状态 | 演示钱包签名、Monad RPC 回执 | 服务器状态文件，链接至区块浏览器 |
