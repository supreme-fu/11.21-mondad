const operationFields = {
  overview: {
    title: '读取页面与浏览操作',
    operations: [
      {
        title: '访问托管演示与检查服务状态',
        endpoint: 'HTTPS 页面与 API · GET /healthz',
        sections: [
          ['浏览器 → HTTPS 网关 → 应用后端', [
            ['Host, Authorization', '域名须与 PROTOTYPE_ORIGIN 一致。托管模式通过 HTTP Basic 校验用户名 demo 和服务器口令，凭据沿 HTTPS 传入。验证失败返回 401 和 WWW-Authenticate。'],
            ['Origin, Content-Type', '写入接口要求 Origin 为应用 HTTPS 地址，Content-Type 为 application/json。'],
          ]],
          ['应用后端 → 部署环境', [
            ['GET /healthz → ready', '初始化完成返回 200 和 ready=true。初始化期间返回 503 和 ready=false。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L339-L369',
      },
      {
        title: '首次打开、刷新或切换身份',
        endpoint: 'GET /api/state?as=<居民 ID>',
        sections: [
          ['浏览器 → 应用后端', [
            ['as', '演示居民 ID，可选 lin、xu、chen，省略时为 lin。切换成功后浏览器把选中的 ID 记在 localStorage 的 do-something:persona。'],
          ]],
          ['应用后端 → 浏览器', [
            ['person, people[], templates', '当前居民 ID、居民目录、活动模板。每个居民含 id、name、initials、color、handle、room、bio、avatar 和钱包 address。'],
            ['activities[]', '每场含发布规则，以及 key、host、rulesHash、createdAt、endsAt、claimDeadline、chainId、returned、remaining、memberCount、status、me 和 members。'],
            ['activities[].me', '当前居民的参与记录，未报名时为 null。参与记录含 joinedAt、baselineComplete、progress、contribution，以及领取后写入的 completeClaimed、contributionClaimed 或 badgeId。'],
            ['activities[].members[]', '公开成员摘要含 personId，已领奖时有 badgeId，已提交时有 contribution 正文。其他人的私人进度不会随成员摘要返回。'],
            ['relationships[], transactions[], pending', '与该身份相关的好友关系、可见交易日志、是否存在待确认交易。交易字段见「回执与链上核对」。'],
            ['network, walletBalance', 'network 含 chainId、address、hash、token、attestor、time、block。其中 network.chainId 是网络编号，activity.chainId 是链上活动编号。walletBalance 是该居民 DSDEMO 的十进制字符串，来自 balanceOf(address)。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L146-L161',
      },
      {
        title: '搜索、预览、打开详情或空间',
        endpoint: '浏览器内操作',
        sections: [
          ['已有数据 → 页面', [
            ['filter, search, activities[]', '按活动 template 分类，用 title、tagline 和模板名匹配搜索。'],
            ['key, title, tagline', '点击卡片后浏览器以站内活动 key 查活动，展示标题及简短介绍，用 #activity/<key> 打开详情。'],
            ['personId, roomKey, badgeId, badgeMotif', '个人空间按居民 ID 渲染。开门状态记在当前页面的 openVaults，展示 API 已返回的勋章编号，图案由活动选项或主题决定。'],
            ['template, draftKey, example', '切换发布模板会填充表单，点击「填入示例」把模板示例放进当前居民和活动的编辑草稿。保存表单或同步成果时才提交。'],
          ]],
        ],
        source: '../prototype/app.js#L349-L371',
      },
    ],
  },
  publish: {
    title: '发布与报名',
    operations: [
      {
        title: '发布活动',
        endpoint: 'POST /api/action?as=<主办方 ID>',
        sections: [
          ['浏览器 → 应用后端', [
            ['action, requestId, rules', 'action 为 publish。requestId 是浏览器生成的 UUID，也是站内草稿的 key。同一主办方可用同一请求编号和同一套规则恢复发布。'],
            ['rules.template, rules.badgeMotif', '模板可选 reading、photo、cooking、custom。勋章样式可留空，或选 book、camera、pan、letter、music、trail、art、star。'],
            ['rules.title, rules.tagline, rules.description', '标题 2–36 字符、简述 2–70 字符、活动介绍 10–900 字符。'],
            ['rules.method, rules.metric, rules.evidence', '参与方式 5–600 字符、完成度名称 2–22 字符、核验标准 5–650 字符。'],
            ['rules.finalLabel, rules.contributionLabel, rules.contributionRule', '最终成果最多 64 字符，贡献任务名称最多 16 字符，贡献要求最多 600 字符。共读必须填写最终成果。启用贡献奖时，后两项至少为 2 和 5 字符。'],
            ['rules.minScore, rules.capacity', '整百分比门槛 1–100，共读至少 80。名额为 1–30 的整数。'],
            ['rules.completionReward, rules.contributionReward', '每人完成奖 1–30、贡献奖 0–30，单位是整枚 DSDEMO。贡献奖为 0 表示关闭。'],
            ['rules.durationDays, rules.claimDays', '活动期 1–30 天，领取宽限期 1–14 天，均为整数。'],
          ]],
          ['应用后端 → 服务器存储 → Monad', [
            ['key, host, rulesHash, createdAt, endsAt, claimDeadline', '后端保存规则全文和草稿。规则摘要为标准化规则 JSON 的 Keccak-256。以当前区块时间加活动天数得到 endsAt，再加宽限天数得到 claimDeadline。'],
            ['to, value · to, amount · spender, amount', '按需用测试 MON 转账补手续费，用 DSDEMO.transfer 为主办方补奖励代币，用 DSDEMO.approve 授权 ActivityHub。预算为 capacity × (completionReward + contributionReward)。'],
            ['publish(terms)', 'terms 含 rulesHash、endsAt、claimDeadline、capacity、minScore、requiresFinalCheck、completionReward、contributionReward。门槛乘 100 后上链，例如 80% 写成 8000。代币按 18 位最小单位传入，requiresFinalCheck 由 finalLabel 是否为空决定。'],
          ]],
          ['Monad → 应用后端 → 浏览器', [
            ['ActivityPublished(activityId, host, rulesHash, budget) → chainId, selected', '发布事件确认后把 activityId 写入服务器活动记录的 chainId。响应 selected 是站内 key，浏览器用它打开详情。'],
          ]],
        ],
        source: '../scripts/prototype-chain.mjs#L57-L74',
      },
      {
        title: '继续发布草稿',
        endpoint: 'POST /api/action?as=<主办方 ID>',
        sections: [
          ['浏览器 → 应用后端 → Monad', [
            ['action, key', 'action 为 retry-publish，key 指向已保存的草稿。由原主办方在活动结束前继续发布。'],
            ['已存 rulesHash 与 terms', '沿原发布路径检查代币与授权、提交 publish。ActivityPublished 确认后返回更新后的活动和 selected。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L225-L231',
      },
      {
        title: '免费报名',
        endpoint: 'POST /api/action?as=<参与者 ID>',
        sections: [
          ['浏览器 → 应用后端', [
            ['action, key', 'action 为 join，key 为站内活动标识。后端查活动是否已发布、报名是否开放、是否满人和是否已经报名。'],
          ]],
          ['应用后端 → Monad', [
            ['Join(activityId, member, deadline), signature', '核验账户签署 EIP-712 报名凭证。member 是居民对应的钱包地址，deadline 为当前区块时间加 600 秒与活动截止中的较早时间。'],
            ['join(activityId, deadline, signature)', '参与者演示钱包签署交易，合约用交易发送者作为 member，记录 joinedAt[activityId][member] 并增加 joined。活动免费，链上交易使用测试 MON 支付手续费。'],
          ]],
          ['Monad → 应用后端 → 浏览器', [
            ['MemberJoined(activityId, member) → joinedAt, baselineComplete, me, memberCount', '后端按回执所在区块时间记下报名时间，设置样例基线并初始化 progress、contribution。页面更新参与状态和同场伙伴。'],
          ]],
        ],
        source: '../scripts/prototype-chain.mjs#L76-L81',
      },
    ],
  },
  reward: {
    title: '成果与领奖',
    operations: [
      {
        title: '同步模拟完成度',
        endpoint: 'POST /api/action?as=<参与者 ID>',
        sections: [
          ['浏览器 → 应用后端 → 服务器存储', [
            ['action, key, score, finalCheck', 'action 为 progress。key 是站内活动标识，score 是 0–100 的整数，finalCheck 为布尔值。共读样例中它表示正文末章是否读完。'],
            ['members[person].progress = { score, finalCheck, at }', '后端要求已报名且仍在活动期，已在报名时达标或已领完成奖的记录不可改。at 来自最新区块时间，无最终成果要求时 finalCheck 存为 false。响应通过 me.progress 显示。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L248-L263',
      },
      {
        title: '同步模拟贡献或书评',
        endpoint: 'POST /api/action?as=<参与者 ID>',
        sections: [
          ['浏览器 → 应用后端 → 服务器存储', [
            ['action, key, text', 'action 为 contribution。text 去掉首尾空白后须有 15–600 字符。后端检查已报名、活动有效、贡献奖已开启且未领取。'],
            ['members[person].contribution = { text, at }', 'at 取当前区块时间。原文保存在服务器并可在活动成员摘要中展示。原型验证提交条件与长度，书评来源和内容核验仍是模拟。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L248-L263',
      },
      {
        title: '领取完成奖或贡献奖',
        endpoint: 'POST /api/action?as=<参与者 ID>',
        sections: [
          ['浏览器 → 应用后端', [
            ['action, key', 'action 为 claim-complete 或 claim-contribution。后端读取该居民在本场已保存的 progress 或 contribution，分别检查完成门槛或贡献资格，以及领取截止与重复领取。'],
            ['evidenceHash', '后端对包含 mock、rulesHash、链上活动编号、居民 ID 与原始成果对象的 JSON 数组取 Keccak-256。链上接收这个摘要，成果正文保存在服务器存储。'],
          ]],
          ['应用后端 → Monad', [
            ['Proof.activityId, Proof.member, Proof.kind', '链上活动编号、参与钱包地址、奖励类别。kind 为 0 表示完成奖，1 表示贡献奖。'],
            ['Proof.score, Proof.finalCheck, Proof.occurredAt', '完成奖用已存 score × 100 和最终成果状态，贡献奖传 0 和 false。occurredAt 为对应成果记录的 at。'],
            ['Proof.deadline, Proof.evidenceHash, signature', 'deadline 取当前区块时间加 600 秒和领取截止中的较早时间。核验账户签署 Proof，参与钱包提交 claim(proof, signature)。'],
          ]],
          ['Monad → 应用后端 → 浏览器', [
            ['RewardPaid(activityId, member, kind, amount, evidenceHash)', '合约发放 DSDEMO 并按奖励类别记 claimed，后端写入 completeClaimed 或 contributionClaimed，每类一次且可以叠加。'],
            ['CompletionBadge(activityId, member, badgeId)', '完成奖同时铸造不可转让勋章，后端保存 badgeId，个人空间显示编号和对应的像素图案。像素图案来自活动规则与前端。'],
          ]],
        ],
        source: '../contracts/ActivityHub.sol#L103-L131',
      },
      {
        title: '退回奖励池余额',
        endpoint: 'POST /api/action?as=<主办方 ID>',
        sections: [
          ['浏览器 → 应用后端 → Monad', [
            ['action, key → returnPool(activityId)', 'action 为 return，后端用 key 定位链上活动。主办方在领取截止后且有余额时签署交易。'],
            ['PoolReturned(activityId, host, amount) → returned, remaining', '链上把剩余 DSDEMO 发回主办方，后端按回执写 returned=true，状态响应显示 remaining=0。'],
          ]],
        ],
        source: '../contracts/ActivityHub.sol#L133-L141',
      },
    ],
  },
  social: {
    title: '人物与交友',
    operations: [
      {
        title: '保存或恢复默认像素人物',
        endpoint: 'POST /api/action?as=<居民 ID>',
        sections: [
          ['浏览器 → 应用后端 → 服务器存储', [
            ['action, pixels', 'action 为 avatar-save。浏览器把上传图或手绘图转换为 32 × 32 RGBA 像素，再编码为 Base64，pixels=null 表示恢复默认。'],
            ['avatars[person] → people[].avatar', '后端校验格式、长度和至少一个可见像素，写入或删除该居民的像素数据。活动页和个人空间从同一字段读取。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L167-L180',
      },
      {
        title: '发送、接受、拒绝或撤回好友邀请',
        endpoint: 'POST /api/action?as=<操作居民 ID>',
        sections: [
          ['浏览器 → 应用后端', [
            ['key', '操作对象的居民 ID。在好友操作中 key 指居民，活动操作中 key 指站内活动。'],
            ['action = friend-request', '邀请方发起，新增 { from: 当前居民, to: 对方居民, status: pending }。'],
            ['action = friend-accept', '接收方接受待处理邀请，把 status 改为 accepted。'],
            ['action = friend-decline', '接收方拒绝待处理邀请，删除该记录。'],
            ['action = friend-cancel', '邀请方撤回待处理邀请，删除该记录。'],
          ]],
          ['服务器存储 → 浏览器', [
            ['relationships[]: from, to, status', 'API 只返回当前居民参与的关系，页面据此显示邀请和好友。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L182-L201',
      },
    ],
  },
  ledger: {
    title: '回执与链上核对',
    operations: [
      {
        title: '跟踪交易或重发待确认交易',
        endpoint: 'GET /api/state?as=<居民 ID> · POST /api/action?as=<居民 ID>',
        sections: [
          ['浏览器 → 应用后端', [
            ['action, key', '主动重发使用 action=resume，页面同时发送空 key，后端按后端待确认记录定位交易。普通状态刷新也会查找回执。'],
          ]],
          ['服务器存储 ↔ Monad', [
            ['raw, hash, from, person, activity, label, method, proofDigest, status', '广播前保存签名交易原文 raw、哈希及上下文，初始 status 为 pending。proofDigest 是报名或领奖凭证的 EIP-712 摘要。'],
            ['hash, raw', 'RPC 按 hash 查回执。主动重发时，如果链上没有回执且 RPC 查不到该交易，才广播已保存的同一份 raw。'],
            ['block, status, fee, events[], confirmedAt', '解析回执后保存区块、confirmed 或 reverted、以 MON 表示的手续费、事件列表和区块时间。每项事件含 name 与 args。回执处理完成后删除 raw。'],
          ]],
          ['应用后端 → 浏览器', [
            ['transactions[], pending', '页面收到可见交易记录与待确认标志，展示活动、发送者、状态、区块及相关哈希。raw 不进入响应。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L93-L144',
      },
      {
        title: '读取合约并核对服务器记录',
        endpoint: 'GET /api/verify?as=<居民 ID>&key=<站内活动 ID>',
        sections: [
          ['浏览器 → 应用后端 → Monad', [
            ['as, key → activities(activityId, { blockTag })', '后端从已发布活动找到链上活动编号，用最新区块号固定此次只读查询。'],
            ['host, terms, joined, remaining', '读取合约活动的主办方、发布条款、报名人数与池余额。'],
          ]],
          ['应用后端 → 浏览器', [
            ['block, pool, joined, rulesHash, matches', '响应包含区块号、按 DSDEMO 格式化的余额、报名人数和规则摘要。matches 表示主办方地址、规则摘要、人数与余额均与服务器记录一致。此操作无需签名或广播。'],
          ]],
        ],
        source: '../scripts/prototype-server.mjs#L326-L338',
      },
    ],
  },
};
