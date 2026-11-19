const svg = document.querySelector('#architecture');
const viewer = document.querySelector('#viewer');
const details = document.querySelector('#detail-body');
const namespace = 'http://www.w3.org/2000/svg';
const width = 1376;
const columns = [28, 386, 744, 1102];
const cardWidth = 246;
const kindStyles = {
  source: { name: '来源', color: '#a55372', line: '#e7bace', fill: '#fff5fa' },
  browser: { name: '浏览器', color: '#3b59b5', line: '#b9cbf5', fill: '#f3f7ff' },
  service: { name: '应用后端', color: '#6f53ae', line: '#cbbbeb', fill: '#f8f4ff' },
  store: { name: '服务器持久化存储', color: '#356c85', line: '#b8d9e9', fill: '#effaff' },
  chain: { name: 'Monad 测试网', color: '#476522', line: '#c4d697', fill: '#f6fbe7' },
};

const step = (kind, title, lines, detail) => ({ kind, title, lines, detail });
const flows = {
  overview: {
    title: '总览',
    summary: '从左往右读。每支箭头标出实际传递的数据，末列给出目的地或用户看到的结果。',
    rows: [
      {
        title: '浏览器怎样访问托管演示',
        links: ['HTTPS 请求', 'Host · Authorization', '页面与 JSON'],
        stages: [
          step('browser', '打开演示域名', ['加载页面或请求 API', '输入演示访问口令'], '首次访问时，浏览器通过 HTTPS 打开部署后的域名。'),
          step('service', 'HTTPS 网关', ['接收 TLS 连接', '把请求转发给应用'], '部署环境配置域名和证书，转发时保留 Host、Origin 和 Authorization。'),
          step('service', '服务器上的应用', ['检查域名与演示凭据', '处理页面资源与 API'], '应用根据配置检查 Host。写入接口还比对 Origin，初始化完成后提供服务。'),
          step('browser', '展示活动与个人空间', ['页面与 API 共用域名', '页面加载后读取活动'], '浏览器使用同源请求读取状态，后续按操作写入服务器状态或提交到 Monad。'),
        ],
      },
      {
        title: '浏览器怎样拿到活动、规则和个人空间',
        links: ['样例、原文、回执', '状态与余额', 'JSON 响应'],
        stages: [
          step('source', '内置样例与服务器记录', ['虚拟居民、模板、规则原文', '模拟成果、好友、已确认回执'], 'prototype-catalog.mjs 定义居民、模板和预置活动。PROTOTYPE_STATE_PATH 指定服务器状态文件，用于保存规则、成果、好友和已确认回执。'),
          step('service', '应用 API 汇总', ['GET /api/state', '查服务器状态 · 读 RPC 钱包余额'], 'prototype-server.mjs 合并活动、当前参与记录、好友关系和回执日志，并通过 RPC 读取 DSDEMO 钱包余额与区块时间。'),
          step('service', '按身份生成响应', ['浏览器以 as 参数选择身份', '钱包余额和区块来自 RPC'], '后端仅返回当前演示身份相关的好友记录。报名、领取和勋章来自已确认回执；余额和最新区块通过 RPC 获取。'),
          step('browser', '活动、详情与个人空间', ['显示活动列表、同场伙伴', '开门时展示已确认的勋章编号'], 'app.js 按 URL 切换页面。选择活动卡片会更新人物介绍，打开详情后可查看规则。保存像素人物后，活动页与个人空间共用这套数据。'),
        ],
      },
      {
        title: '一笔需要上链的操作怎样回到页面',
        links: ['操作和活动 ID', '已签交易', '回执与事件'],
        stages: [
          step('browser', '发布、报名或领取', ['POST /api/action', '活动标识、动作、相应参数'], '发布传入表单条款；报名和领取传站内活动标识。后端查出已确认的链上活动编号。'),
          step('service', '后端校验与签名', ['核验账户签 EIP-712 凭证', '演示钱包签交易 · RPC 广播'], '报名与领取使用核验签名。钱包签名和核验签名是不同的职责。服务先落盘交易哈希及待发交易，再广播。'),
          step('chain', 'ActivityHub 与 DSDEMO', ['合约校验并执行规则', '维护报名、活动余额和勋章'], 'ActivityHub 执行规则。DSDEMO 合约负责代币转账；完成奖才在 ActivityHub 铸造勋章。'),
          step('store', '确认回执写回服务器', ['解析事件并更新同一活动', '页面刷新后看到已确认状态'], '后端解析此次交易的日志，更新站内活动编号、成员、领取次数和勋章编号。链上后台也展示交易哈希与区块。'),
        ],
      },
      {
        title: '模拟成果和好友关系怎样保存',
        links: ['进度 / 文本 / 邀请', '校验后落盘', 'API 返回状态'],
        stages: [
          step('browser', '填写成果或发送邀请', ['模拟进度、末章或书评', '发送、接受、撤回好友邀请'], '这些操作在活动详情和居民空间发起。保存成果是链下操作，后续点击领取才会进入签名与链上执行。'),
          step('service', '链下成果与好友处理', ['检查参与资格和活动期限', '好友邀请由接收方确认'], '后端处理适用的完成门槛、数据格式和邀请权限。浏览器使用模拟身份，也可以直接切换身份演示双方。'),
          step('store', '保存原始数据', ['模拟进度 · 贡献正文', '好友关系与邀请状态'], '原始贡献正文、好友状态、规则全文保存在服务器；领奖时将成果摘要与对应达标字段提交合约。'),
          step('browser', '详情和房间更新', ['活动详情显示同步状态', '好友与邀请列表显示操作结果'], 'API 返回当前身份可见的邀请与好友，活动详情显示可展示的贡献内容。浏览器不广播好友和成果同步交易。'),
        ],
      },
    ],
  },
  publish: {
    title: '发布与报名',
    summary: '发布时锁定预算，报名时验证钱包和名额。只有确认回执才把链上结果写回服务器。',
    rows: [
      {
        title: '发布活动并锁定奖池',
        links: ['requestId · rules', 'publish(terms)', 'ActivityPublished'],
        stages: [
          step('browser', '主办方填写规则', ['正文、名额、截止与奖励', '每场请求有独立 requestId'], 'requestId 用于发布操作重试，服务会保留对应规则与草稿。'),
          step('service', '保存规则并组装调用', ['规则全文 → 服务器状态文件', '算预算 · 生成 rulesHash'], '每场预算等于名额乘以完成奖与贡献奖之和。链适配器按需分配测试币和授权。'),
          step('chain', '授权与发布', ['DSDEMO.approve', 'ActivityHub.publish 锁定预算'], '合约检查测试币到账，保存规则摘要和执行字段，并分配链上活动编号。'),
          step('store', '站内草稿变已发布', ['回执写入链上活动编号', 'GET /api/state 返回活动'], '浏览器读取包含已确认编号的活动，并显示其规则原文。'),
        ],
      },
      {
        title: '同一个钱包报名不同活动',
        links: ['action · key', 'Join · signature', 'MemberJoined'],
        stages: [
          step('browser', '从卡片打开活动详情', ['人物介绍所选活动', '在详情点击免费报名'], '选择活动卡后显示一句介绍，再进入详情。点击报名才发送写入请求。'),
          step('service', '查活动与签报名凭证', ['绑定链上活动 ID 和钱包', '凭证带有效时间'], '核验账户签 Join 凭证，再由参与者的服务器演示钱包签署交易。'),
          step('chain', 'ActivityHub.join', ['检查签名与报名截止', '限制本场名额和重复报名'], '报名按活动和钱包记录，同一钱包可以参加多场。测试 MON 只作为交易手续费。'),
          step('store', '服务器记录成员', ['保存报名时间与模拟基线', '我的活动和同场伙伴显示'], '服务以 MemberJoined 事件为依据更新成员，保留每个活动独立的进展。'),
        ],
      },
    ],
  },
  reward: {
    title: '成果与领奖',
    summary: '先模拟提交成果，再由核验账户签发凭证。奖励交易确认后，活动页和勋章库同步看到结果。',
    rows: [
      {
        title: '同步成果写入链下',
        links: ['score / finalCheck / text', 'progress / contribution', 'me'],
        stages: [
          step('source', '参与者点选或填写', ['覆盖率或任务完成度', '末章 / 最终成果 · 贡献正文'], '本版从页面生成模拟成果。共读样例是 80% 且末章完成；当前没有微信读书授权来源。'),
          step('service', 'API 检查提交资格', ['核对活动期、报名及状态', '校验完成度或贡献文本格式'], 'API 检查用户是否报名、活动是否开放、该成果是否已完成领取，再保存进度或贡献数据。'),
          step('store', '状态文件持久化', ['保存原始正文和时间', '按活动、参与者独立存储'], '服务器保存原始数据，领取时使用它生成证据摘要和凭证字段。'),
          step('browser', '详情更新可领取状态', ['GET 或操作响应返回 me', '未达标仍不能领取完成奖'], '同步成果不发送链上交易。是否可以领取在页面和后端分别检查，链上执行时再次核验条款。'),
        ],
      },
      {
        title: '领取测试奖励并更新勋章库',
        links: ['progress / contribution', 'Proof · signature', 'RewardPaid · 勋章'],
        stages: [
          step('store', '读取本场成果', ['已报名成员的进度或贡献', '提供成果正文和发生时间'], '领取时按站内活动标识和居民 ID 读取该成员的已存成果。'),
          step('service', '核验签名与 RPC', ['生成 evidenceHash', '核验账户签 EIP-712 Proof'], '后端根据奖项与已存成果生成 Proof，核验账户签发凭证。演示钱包签交易，保存待确认记录后提交 ActivityHub.claim。'),
          step('chain', '合约发奖并限制重领', ['检查门槛、时间和签名', '完成奖同时铸造绑定勋章'], '贡献奖和完成奖各限一次，可以叠加。合约扣减本场余额，DSDEMO 转入领取钱包。'),
          step('service', 'API 写回并返回状态', ['RewardPaid 更新领取状态', 'CompletionBadge 更新勋章库'], '后端解析事件后记录活动、参与者和勋章编号。个人空间通过 API 读取已确认的参与记录和勋章。'),
        ],
      },
      {
        title: '主办方退回奖池未领取余额',
        links: ['action · key', 'returnPool(activityId)', 'PoolReturned'],
        stages: [
          step('browser', '点击退回余额', ['活动详情的主办方操作', '提交 action=return 和 key'], '页面在领取截止后有余额时为主办方显示退回入口。'),
          step('service', '查主办方、截止与余额', ['站内 key → 链上活动编号', '主办方的钱包签署交易'], '后端核对主办方、领取截止和可退余额，再提交退回调用。'),
          step('chain', 'ActivityHub.returnPool', ['清零 remaining', '向主办方退回 DSDEMO'], 'ActivityHub 要求交易发送者为主办方，并验证领取时间和池余额。'),
          step('store', '确认退回', ['服务器记 returned=true', 'API 响应显示余额为 0'], '成功回执的 PoolReturned 事件记录活动编号、主办方地址和退回金额。'),
        ],
      },
    ],
  },
  social: {
    title: '人物与交友',
    summary: '浏览器负责活动预览和开关门。像素人物与好友记录保存在服务器，勋章编号来自已确认的链上事件。',
    rows: [
      {
        title: '保存像素人物',
        links: ['action · pixels', 'avatars[person]', 'people[].avatar'],
        stages: [
          step('browser', '上传图片或手绘', ['缩放为 32 × 32 RGBA', '以 Base64 发送像素'], '上传图片在浏览器转换。恢复默认时发送 pixels=null。'),
          step('service', '头像 API 校验', ['校验 RGBA 长度和格式', '检查至少一个可见像素'], 'avatar-save 按 as 定位演示居民，验证后更新其像素数据。'),
          step('store', '按居民保存', ['服务器 JSON 保存像素数据', '恢复默认时删除该条记录'], '服务器存储中的 avatars 以居民 ID 作为索引。'),
          step('browser', '活动页与房间共用', ['从 people[].avatar 取像素', '默认形象由前端绘制'], '两个页面使用同一居民像素形象，访客也可在对方空间看到。'),
        ],
      },
      {
        title: '拜访、邀请与确认',
        links: ['as · action · key', 'from · to · status', 'relationships[]'],
        stages: [
          step('browser', '打开居民空间', ['点击门查看像素勋章', '点添加、接受、撤回或拒绝'], 'app.js 管理活动预览与房间。浏览他人的勋章库使用 API 返回的公开参与记录。'),
          step('service', '好友处理模块', ['校验身份、对象和邀请方向', '接收方才可接受待处理邀请'], '好友操作直接进入 updateRelationship，不进入链上签名或广播路径。'),
          step('store', '保存双边关系', ['记录 from、to 和状态', '撤回和拒绝移除待处理邀请'], '好友关系保存在同一服务器 JSON 文件，切换身份或重启后仍可读取。'),
          step('browser', '我的空间与访客视图', ['只显示与当前身份相关的邀请', '从居民主页查看已确认勋章'], '当前身份可看自己的邀请与好友，进入他人空间时读取其公开参与记录和活动勋章编号。'),
        ],
      },
    ],
  },
  ledger: {
    title: '回执与链上核对',
    summary: '服务器交易日志来自已知提交的回执。需要核对时，再直接读取指定区块的合约值。',
    rows: [
      {
        title: '跟踪当次交易并恢复待确认操作',
        links: ['落盘哈希和待发交易', 'API 按哈希查询', 'API 解析并落盘'],
        stages: [
          step('service', '演示钱包签交易', ['生成已签交易与交易哈希', '保存后调用 RPC 广播'], '签名之后先保存 pending 记录。原型在网络异常时可显式重试广播同一笔已签交易。'),
          step('store', '后端待确认记录', ['记录操作、参与者、活动', '保留原交易哈希用于恢复'], '状态文件保存该后端发过且尚待确认的交易。API 响应会去掉待发交易原文。'),
          step('chain', 'Monad RPC 回执', ['按哈希读取成功或回滚', '按同一回执解析合约事件'], '后端按交易哈希查询，不做全链事件扫描。只在回执成功时更新履约状态。'),
          step('browser', '链上后台交易列表', ['交易、区块、状态、凭证摘要', '外链区块浏览器'], '已确认回执将活动、报名、领奖、勋章或资金返还写回服务器，页面读取并显示。'),
        ],
      },
      {
        title: '直接查合约，再和服务器记录比对',
        links: ['as · key', 'activityId · blockTag', 'pool · joined · matches'],
        stages: [
          step('browser', '点击读取合约并核对', ['在链上后台选中某场活动', 'GET /api/verify'], '核对请求用于读取，不创建交易，也不更新活动履约状态。'),
          step('service', '解析合约与活动编号', ['站内 key → 链上活动 ID', '读取最新区块号并固定查询'], '服务查站内活动编号并以当前区块号作为查询 blockTag。'),
          step('chain', 'ActivityHub.activities', ['返回规则摘要、主办方', '报名人数与池剩余金额'], '对外只读函数返回合约在该区块的值。区块号和合约读数随响应返回。'),
          step('browser', '显示实读结果和差异', ['比较规则、地址、人数、金额', '一致时在所选活动显示确认'], '服务比较服务器记录与链上值后返回 matches。活动页内的常规状态由已存回执汇总。'),
        ],
      },
    ],
  },
};

let active = 'overview';
let selected;
let scale = 1;
let zoomMode = 'responsive';
let height = 680;
const nodes = new Map();
const edges = [];
const repoUrl = 'https://github.com/supreme-fu/do-something/blob/main/';

function fieldElement(parent, tag, content) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  parent.append(node);
  return node;
}

function drawOperationFields(key) {
  const { title, operations } = operationFields[key];
  document.querySelector('#field-title').textContent = `操作字段 · ${title}`;
  const list = document.querySelector('#field-operations');
  list.replaceChildren();
  for (const operation of operations) {
    const entry = fieldElement(list, 'details');
    entry.className = 'field-operation';
    const heading = fieldElement(entry, 'summary', operation.title);
    fieldElement(heading, 'code', operation.endpoint);
    for (const [direction, fields] of operation.sections) {
      fieldElement(entry, 'h3', direction);
      const definitions = fieldElement(entry, 'dl');
      for (const [field, meaning] of fields) {
        const definition = fieldElement(definitions, 'div');
        fieldElement(fieldElement(definition, 'dt'), 'code', field);
        fieldElement(definition, 'dd', meaning);
      }
    }
    const source = fieldElement(entry, 'a', '查看对应源码 ↗');
    source.className = 'field-source';
    source.href = repoUrl + operation.source.replace(/^\.\.\//, '');
  }
}

function element(name, attributes = {}, parent = svg) {
  const node = document.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  parent.append(node);
  return node;
}

function text(parent, x, y, content, options = {}) {
  const node = element('text', { x, y, fill: '#23375f', 'font-size': 14, ...options }, parent);
  node.textContent = content;
  return node;
}

function highlight(id) {
  const related = new Set([id]);
  for (const edge of edges) {
    const connected = edge.from === id || edge.to === id;
    edge.group.classList.toggle('muted', Boolean(id) && !connected);
    if (connected) { related.add(edge.from); related.add(edge.to); }
  }
  for (const [key, node] of nodes) {
    node.group.classList.toggle('muted', Boolean(id) && !related.has(key));
    node.group.classList.toggle('selected', key === selected);
    node.group.setAttribute('aria-pressed', String(key === selected));
  }
}

function clearSelection() {
  selected = undefined;
  document.querySelector('#detail-type').textContent = '节点说明';
  document.querySelector('#detail-title').textContent = flows[active].title;
  details.textContent = flows[active].summary;
  highlight();
}

function selectNode(id) {
  selected = id;
  const { stage, incoming, outgoing } = nodes.get(id);
  document.querySelector('#detail-type').textContent = kindStyles[stage.kind].name;
  document.querySelector('#detail-title').textContent = stage.title;
  const paragraph = document.createElement('p');
  paragraph.textContent = stage.detail;
  details.replaceChildren(paragraph);
  for (const [label, value] of [['进入的数据', incoming], ['传出的数据', outgoing]]) {
    if (!value) continue;
    const line = document.createElement('p');
    const name = document.createElement('strong');
    name.textContent = label + '　';
    line.append(name, value);
    details.append(line);
  }
  highlight(id);
}

function card(stage, x, y, id, incoming, outgoing) {
  const style = kindStyles[stage.kind];
  const group = element('g', { class: 'diagram-node', tabindex: 0, role: 'button', 'aria-label': stage.title, 'data-id': id });
  element('rect', { x, y, width: cardWidth, height: 130, rx: 11, fill: style.fill, stroke: style.line, class: 'outline' }, group);
  text(group, x + 15, y + 25, style.name, { fill: style.color, 'font-size': 11, 'font-weight': 650 });
  text(group, x + 15, y + 54, stage.title, { 'font-size': 17, 'font-weight': 700 });
  for (const [i, line] of stage.lines.entries()) text(group, x + 15, y + 82 + i * 21, line, { fill: '#4e6183', 'font-size': 13 });
  nodes.set(id, { group, stage, incoming, outgoing });
  group.addEventListener('mouseenter', () => highlight(id));
  group.addEventListener('mouseleave', () => highlight(selected));
  group.addEventListener('focus', () => highlight(id));
  group.addEventListener('blur', () => highlight(selected));
  group.addEventListener('click', () => selectNode(id));
  group.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectNode(id);
  });
}

function edge(from, to, x, nextX, y, label) {
  const group = element('g', { class: 'diagram-edge', 'aria-hidden': true });
  const start = x + cardWidth + 3;
  const end = nextX - 6;
  element('line', { x1: start, x2: end, y1: y, y2: y, stroke: '#6f88ba', 'stroke-width': 1.5, 'marker-end': 'url(#arrow)' }, group);
  text(group, (start + end) / 2, y - 10, label, { 'font-size': 11, fill: '#4b6391', 'text-anchor': 'middle' });
  edges.push({ from, to, group });
}

function draw(key) {
  active = key;
  const { title, summary, rows } = flows[key];
  height = 24 + rows.length * 196;
  nodes.clear();
  edges.length = 0;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  element('title').textContent = `Do Something · ${title}`;
  element('desc').textContent = summary;
  const style = element('style');
  style.textContent = 'text{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}.diagram-node{cursor:pointer}.diagram-node.selected .outline,.diagram-node:focus-visible .outline{stroke:#4167d3;stroke-width:2.5}.diagram-node,.diagram-edge{transition:opacity .15s}.muted{opacity:.2}@media(prefers-reduced-motion:reduce){.diagram-node,.diagram-edge{transition:none}}';
  const marker = element('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, element('defs'));
  element('path', { d: 'M 0 1 L 9 5 L 0 9', fill: 'none', stroke: '#6f88ba', 'stroke-width': 1.5 }, marker);
  element('rect', { width, height, fill: '#f0f5ff' });
  rows.forEach((row, index) => {
    const y = 16 + index * 196;
    element('rect', { x: 13, y, width: width - 26, height: 180, rx: 13, fill: '#ffffff', stroke: '#d9e4f4' });
    text(svg, 29, y + 27, row.title, { 'font-size': 15, 'font-weight': 700 });
    row.links.forEach((label, col) => edge(`${index}-${col}`, `${index}-${col + 1}`, columns[col], columns[col + 1], y + 106, label));
    row.stages.forEach((stage, col) => card(stage, columns[col], y + 39, `${index}-${col}`, row.links[col - 1], row.links[col]));
  });
  for (const tab of document.querySelectorAll('[data-flow]')) tab.setAttribute('aria-pressed', String(tab.dataset.flow === key));
  document.querySelector('#flow-summary').textContent = summary;
  drawOperationFields(key);
  clearSelection();
  if (zoomMode !== 'manual') fit();
  else setScale(scale);
  viewer.scrollTop = 0;
}

function setScale(value) {
  scale = Math.min(2, Math.max(.2, value));
  svg.style.width = `${width * scale}px`;
  svg.style.height = `${height * scale}px`;
  document.querySelector('#zoom-value').textContent = `${Math.round(scale * 100)}%`;
}
function fit() {
  setScale(zoomMode === 'responsive' && viewer.clientWidth <= 580 ? .8 : viewer.clientWidth / width);
  viewer.scrollLeft = 0;
}
document.querySelector('#fit').addEventListener('click', () => { zoomMode = 'fit'; fit(); });
document.querySelector('#actual').addEventListener('click', () => { zoomMode = 'manual'; setScale(1); });
document.querySelector('#zoom-in').addEventListener('click', () => { zoomMode = 'manual'; setScale(scale * 1.2); });
document.querySelector('#zoom-out').addEventListener('click', () => { zoomMode = 'manual'; setScale(scale / 1.2); });
document.querySelector('#clear').addEventListener('click', clearSelection);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') clearSelection(); });
for (const tab of document.querySelectorAll('[data-flow]')) tab.addEventListener('click', () => draw(tab.dataset.flow));
new ResizeObserver(() => { if (zoomMode !== 'manual') fit(); }).observe(viewer);

let drag;
viewer.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.diagram-node') || event.pointerType === 'touch' || event.button !== 0) return;
  drag = { x: event.clientX, y: event.clientY, left: viewer.scrollLeft, top: viewer.scrollTop };
  viewer.setPointerCapture(event.pointerId);
  viewer.classList.add('dragging');
});
viewer.addEventListener('pointermove', (event) => {
  if (!drag) return;
  viewer.scrollLeft = drag.left - (event.clientX - drag.x);
  viewer.scrollTop = drag.top - (event.clientY - drag.y);
});
function endDrag() { drag = undefined; viewer.classList.remove('dragging'); }
viewer.addEventListener('lostpointercapture', endDrag);
viewer.addEventListener('pointerup', endDrag);
viewer.addEventListener('pointercancel', endDrag);

document.querySelector('#export').addEventListener('click', () => {
  const clone = svg.cloneNode(true);
  clone.removeAttribute('style');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  for (const node of clone.querySelectorAll('.muted, .selected')) node.classList.remove('muted', 'selected');
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `do-something-${active}.svg`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

draw(active);
