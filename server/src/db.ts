import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { id as keccakId, Wallet } from 'ethers';

const now = () => new Date().toISOString();
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const activities = [
  {
    id: 'cooking',
    title: '给在乎的人做一道菜',
    invitation: '不必丰盛。把一道一直想吃、想做或想分享的菜，认真端上桌。',
    description: '为家人、朋友、室友，也可以只为自己。你可以替换任何不适合自己的关系对象，不需要证明一段关系。',
    category: '饮食与陪伴',
    duration: '约 45 分钟',
    completionHint: '按自己的方式做完并品尝这道菜，就算完成。没有摆拍、热量或厨艺要求。',
    ruleVersion: 1,
  },
  {
    id: 'meeting',
    title: '去见一个一直想见的人',
    invitation: '发一条消息，留一段时间。见面不必有宏大的理由。',
    description: '可以是一位老朋友、一位新邻居，也可以是和久违的自己独处。线上相见同样被允许。',
    category: '关系与相逢',
    duration: '约 30 分钟',
    completionHint: '完成一次你真心投入的相见或交谈，就算完成。对方是否进一步联系，不由你负责。',
    ruleVersion: 1,
  },
  {
    id: 'reading',
    title: '读完一本想读的短书',
    invitation: '从书架上取下它，给故事一个不被催促的下午。',
    description: '纸质书、电子书或有声书都可以。这里不接入任何阅读平台，只记录你的自报完成。',
    category: '阅读与思考',
    duration: '留一个下午',
    completionHint: '读完你选定的短书或一个完整篇章，就算完成。不需要交出笔记或接受阅读测验。',
    ruleVersion: 1,
  },
  {
    id: 'outing',
    title: '去一个一直想去的小地方',
    invitation: '不用远行。街角的旧书店、河边的长椅，都值得一次出发。',
    description: '选择一个安全、开放、适合自己的目的地。不采集定位，也不要求上传照片。',
    category: '城市与远方',
    duration: '约 90 分钟',
    completionHint: '亲自抵达并停留一会儿，就算完成。天气、体力或临时计划改变时，可以改日再来。',
    ruleVersion: 1,
  },
] as const;

export class Store {
  readonly database: DatabaseSync;
  private readonly seedRichProfile: boolean;

  constructor(path: string, options?: { seedRichProfile?: boolean }) {
    this.seedRichProfile = Boolean(options?.seedRichProfile);
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
    this.seed();
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        demo_key TEXT UNIQUE,
        display_name TEXT NOT NULL,
        bio TEXT,
        goal TEXT,
        points INTEGER NOT NULL DEFAULT 100,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        invitation TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        duration TEXT NOT NULL,
        completion_hint TEXT NOT NULL,
        rule_version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE IF NOT EXISTS participations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL REFERENCES activities(id),
        rule_version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'joined',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS completions (
        id TEXT PRIMARY KEY,
        participation_id TEXT NOT NULL UNIQUE REFERENCES participations(id) ON DELETE CASCADE,
        declared_at TEXT NOT NULL,
        verification_type TEXT NOT NULL DEFAULT 'self_report',
        idempotency_key TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reflections (
        completion_id TEXT PRIMARY KEY REFERENCES completions(id) ON DELETE CASCADE,
        text TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        shared_at TEXT,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS receipts (
        completion_id TEXT PRIMARY KEY REFERENCES completions(id) ON DELETE CASCADE,
        receipt_id TEXT NOT NULL UNIQUE,
        chain_id INTEGER NOT NULL,
        contract_address TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reading_challenges (
        participation_id TEXT PRIMARY KEY REFERENCES participations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id INTEGER NOT NULL DEFAULT 1,
        book_title TEXT NOT NULL DEFAULT '《小王子》',
        book_hash TEXT NOT NULL,
        rules_hash TEXT NOT NULL,
        reader_wallet TEXT NOT NULL,
        subject_hash TEXT NOT NULL,
        enrolled_at TEXT NOT NULL,
        enrollment_digest TEXT NOT NULL,
        enrollment_sig TEXT NOT NULL,
        already_completed INTEGER NOT NULL DEFAULT 0,
        coverage_bps INTEGER NOT NULL DEFAULT 6200,
        last_chapter_completed INTEGER NOT NULL DEFAULT 0,
        read_chapters_json TEXT NOT NULL DEFAULT '[]',
        current_chapter INTEGER NOT NULL DEFAULT 1,
        reading_seconds INTEGER NOT NULL DEFAULT 0,
        highlights_json TEXT NOT NULL DEFAULT '[]',
        reading_updated_at TEXT,
        review_submitted_at TEXT,
        reading_claimed_at TEXT,
        reading_proof_digest TEXT,
        reading_tx_hash TEXT,
        reading_block_number INTEGER,
        review_claimed_at TEXT,
        review_proof_digest TEXT,
        review_tx_hash TEXT,
        badge_token_id INTEGER,
        reward_reading_dsdemo TEXT NOT NULL DEFAULT '10',
        reward_review_dsdemo TEXT NOT NULL DEFAULT '2',
        mode TEXT NOT NULL DEFAULT 'simulation'
      );
      CREATE TABLE IF NOT EXISTS activity_logs (
        participation_id TEXT PRIMARY KEY REFERENCES participations(id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        verified_channel TEXT,
        verified_code TEXT,
        verified_digest TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_participations_user ON participations(user_id);
      CREATE INDEX IF NOT EXISTS idx_participations_user_activity ON participations(user_id, activity_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
      CREATE INDEX IF NOT EXISTS idx_reading_challenges_user ON reading_challenges(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_activity ON activity_logs(activity_id);
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.ensureColumn('users', 'bio', 'TEXT');
    this.ensureColumn('users', 'goal', 'TEXT');
    this.ensureColumn('users', 'points', 'INTEGER NOT NULL DEFAULT 100');
    this.ensureColumn('reading_challenges', 'read_chapters_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('reading_challenges', 'current_chapter', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('reading_challenges', 'reading_seconds', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('reading_challenges', 'highlights_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('reading_challenges', 'reading_block_number', 'INTEGER');
    this.removeParticipationUniqueConstraint();
  }

  private removeParticipationUniqueConstraint() {
    const tableRow = this.database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'participations'",
    ).get() as { sql?: string } | undefined;
    if (!tableRow?.sql || !/UNIQUE\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(tableRow.sql)) {
      return;
    }

    // 临时关闭外键检查（必须在事务外执行），安全重建 participations 表以移除 UNIQUE(user_id, activity_id)。
    this.database.exec('PRAGMA foreign_keys = OFF;');
    try {
      this.database.exec('BEGIN IMMEDIATE');
      try {
        this.database.exec(`
          CREATE TABLE participations_new (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            activity_id TEXT NOT NULL REFERENCES activities(id),
            rule_version INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'joined',
            created_at TEXT NOT NULL
          );
          INSERT INTO participations_new (id, user_id, activity_id, rule_version, status, created_at)
          SELECT id, user_id, activity_id, rule_version, status, created_at FROM participations;
          DROP TABLE participations;
          ALTER TABLE participations_new RENAME TO participations;
          CREATE INDEX IF NOT EXISTS idx_participations_user ON participations(user_id);
          CREATE INDEX IF NOT EXISTS idx_participations_user_activity ON participations(user_id, activity_id);
        `);
        this.database.exec('COMMIT');
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON;');
    }
  }

  private countRows(table: 'users' | 'activities') {
    return (this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  }

  private seedDemoAccounts() {
    const insertUser = this.database.prepare(
      'INSERT OR IGNORE INTO users (id, demo_key, display_name, bio, goal, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insertUser.run(
      'user-a',
      'a',
      '阿黎',
      '广州 · 独立开发者 & 生活记录者，构建面向 AI Agent 时代的个人链上生活档案。',
      '完成《小王子》27 章共读核验，持续沉淀真实生活上下文（LIFE CONTEXT）。',
      'active',
      now(),
    );
    insertUser.run(
      'user-b',
      'b',
      '小舟',
      '喜欢在旧书店和珠江边散步的产品人，已完结本期《小王子》共读。',
      '每周认真完成一件想做的小事。',
      'active',
      now(),
    );
    insertUser.run('user-example', null, '示例经历', null, null, 'active', now());
  }

  private seedExampleEchoes() {
    this.database.prepare(
      'INSERT OR IGNORE INTO users (id, demo_key, display_name, status, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('user-example', null, '示例经历', 'active', now());

    const exampleEchoes = [
      {
        participationId: 'participation-example',
        completionId: 'completion-example',
        activityId: 'cooking',
        idempotencyKey: 'fixture-example-v1',
        text: '我把手机留在客厅，照着一张旧食谱做了番茄炖牛腩。火候没有刚刚好，但我们一起把它吃完了。',
      },
      {
        participationId: 'participation-example-cooking-2',
        completionId: 'completion-example-cooking-2',
        activityId: 'cooking',
        idempotencyKey: 'fixture-example-cooking-v2',
        text: '深夜回家有点累，还是给自己煮了一碗热腾腾的阳春面，煎了一个流心荷包蛋。厨房起雾的那几分钟很踏实。',
      },
      {
        participationId: 'participation-example-meeting-1',
        completionId: 'completion-example-meeting-1',
        activityId: 'meeting',
        idempotencyKey: 'fixture-example-meeting-1',
        text: '约了好久没见的老朋友在街角咖啡馆坐了半小时。没有聊什么大事，只是知道彼此都还在认真过日子，就已经很好。',
      },
      {
        participationId: 'participation-example-meeting-2',
        completionId: 'completion-example-meeting-2',
        activityId: 'meeting',
        idempotencyKey: 'fixture-example-meeting-2',
        text: '晚上给远方的妈妈打了一通不聊工作和催促的视频电话，只是看她把阳台的绿萝剪了新枝，挂断前我们都笑了一下。',
      },
      {
        participationId: 'participation-example-reading-1',
        completionId: 'completion-example-reading-1',
        activityId: 'reading',
        idempotencyKey: 'fixture-example-reading-1',
        text: '把手机调成静音放进抽屉，一口气读完了搁在床头两个月的短篇小说集。翻到封底时天刚好黑下来，心里很安静。',
      },
      {
        participationId: 'participation-example-reading-2',
        completionId: 'completion-example-reading-2',
        activityId: 'reading',
        idempotencyKey: 'fixture-example-reading-2',
        text: '趁着午后窗边有太阳，泡了杯茶读完了一本小书的最后一章。没有做读书笔记，只记住了一句让我松口气的话。',
      },
      {
        participationId: 'participation-example-outing-1',
        completionId: 'completion-example-outing-1',
        activityId: 'outing',
        idempotencyKey: 'fixture-example-outing-1',
        text: '傍晚下班故意早下了两站地铁，沿着河边的长椅慢慢走，坐在那里吹了二十分钟晚风。原来城市傍晚的天空这么好看。',
      },
      {
        participationId: 'participation-example-outing-2',
        completionId: 'completion-example-outing-2',
        activityId: 'outing',
        idempotencyKey: 'fixture-example-outing-2',
        text: '周末独自去了一家收藏很久的老巷子旧书店，没有买什么大部头，在木书架间站了半小时，带回了一张手绘明信片。',
      },
    ] as const;

    const insertParticipation = this.database.prepare(`
      INSERT OR IGNORE INTO participations
      (id, user_id, activity_id, rule_version, status, created_at)
      VALUES (?, 'user-example', ?, 1, 'completed', ?)
    `);
    const insertCompletion = this.database.prepare(`
      INSERT OR IGNORE INTO completions
      (id, participation_id, declared_at, verification_type, idempotency_key)
      VALUES (?, ?, ?, 'self_report', ?)
    `);
    const insertReflection = this.database.prepare(`
      INSERT OR IGNORE INTO reflections
      (completion_id, text, visibility, shared_at, deleted_at)
      VALUES (?, ?, 'shared', ?, NULL)
    `);

    const ts = now();
    for (const item of exampleEchoes) {
      insertParticipation.run(item.participationId, item.activityId, ts);
      insertCompletion.run(item.completionId, item.participationId, ts, item.idempotencyKey);
      insertReflection.run(item.completionId, item.text, ts);
    }
  }

  private seedActivities() {
    const insertActivity = this.database.prepare(`
      INSERT OR IGNORE INTO activities
      (id, title, invitation, description, category, duration, completion_hint, rule_version, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);
    for (const activity of activities) {
      insertActivity.run(
        activity.id,
        activity.title,
        activity.invitation,
        activity.description,
        activity.category,
        activity.duration,
        activity.completionHint,
        activity.ruleVersion,
      );
    }
  }

  seedRichDemoProfile(forceReset = false) {
    const userA = this.database.prepare("SELECT id FROM users WHERE id = 'user-a' AND status = 'active'").get();
    if (!userA) return;

    if (forceReset) {
      this.database.prepare("DELETE FROM participations WHERE user_id = 'user-a'").run();
    } else {
      const existing = this.database.prepare("SELECT COUNT(*) AS count FROM participations WHERE user_id = 'user-a'").get() as { count: number };
      if (existing.count > 0) return;
    }

    this.database.prepare(`
      UPDATE users
      SET bio = COALESCE(bio, ?), goal = COALESCE(goal, ?), points = 100
      WHERE id = 'user-a'
    `).run(
      '广州 · 独立开发者 & 生活记录者，构建面向 AI Agent 时代的个人链上生活档案。',
      '完成《小王子》27 章共读核验，持续沉淀真实生活上下文（LIFE CONTEXT）。',
    );

    const tReadingStart = hoursAgo(14);
    const tReadingUpdate = hoursAgo(1);
    const tUserBReading = hoursAgo(18);

    const insertPart = this.database.prepare(`
      INSERT OR IGNORE INTO participations (id, user_id, activity_id, rule_version, status, created_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    const insertComp = this.database.prepare(`
      INSERT OR IGNORE INTO completions (id, participation_id, declared_at, verification_type, idempotency_key)
      VALUES (?, ?, ?, 'self_report', ?)
    `);
    const insertRefl = this.database.prepare(`
      INSERT OR IGNORE INTO reflections (completion_id, text, visibility, shared_at, deleted_at)
      VALUES (?, ?, ?, ?, NULL)
    `);
    const insertReceipt = this.database.prepare(`
      INSERT OR IGNORE INTO receipts (completion_id, receipt_id, chain_id, contract_address, tx_hash, status, mode, error, created_at, updated_at)
      VALUES (?, ?, 10143, '0x0000000000000000000000000000000000000000', ?, 'confirmed', 'simulation', NULL, ?, ?)
    `);

    // 预置 9 次真实已完成记录（做菜 3 次 + 相见 3 次 + 出行 3 次 = 累计 9 次），
    // 这样当用户读完《小王子》第 27/27 章并确认上链时，刚好达成第 10 次行动，同步解锁「一页之间」与「10 次 · 铜色起步」里程碑勋章！
    const priorActions = [
      { key: 'cooking-1', activityId: 'cooking', hours: 168, text: '下班炖了一锅番茄牛腩，屋里满是酸甜香气，和室友一人盛了两大碗。', shared: true, withReceipt: true },
      { key: 'meeting-1', activityId: 'meeting', hours: 148, text: '和毕业后半年没见的阿哲在体育西路喝了杯手冲，聊完觉得很踏实。', shared: false, withReceipt: false },
      { key: 'outing-1', activityId: 'outing', hours: 126, text: '傍晚去东山口逛了旧书店和小展馆，没有赶景点，只记住红砖墙上的夕阳。', shared: true, withReceipt: true },
      { key: 'cooking-2', activityId: 'cooking', hours: 102, text: '给自己煮了一碗葱油拌面配溏心蛋，厨房起雾的几分钟特别安静。', shared: false, withReceipt: false },
      { key: 'meeting-2', activityId: 'meeting', hours: 84, text: '晚上和妈妈打了一通不聊催促的视频电话，看她把阳台绿萝修剪了新枝。', shared: false, withReceipt: false },
      { key: 'outing-2', activityId: 'outing', hours: 68, text: '下班早下两站地铁，沿着珠江边长椅吹了二十分钟晚风。', shared: true, withReceipt: false },
      { key: 'cooking-3', activityId: 'cooking', hours: 48, text: '周末试做了蒜香黄油烤蘑菇，配了一杯温热乌龙茶。', shared: false, withReceipt: false },
      { key: 'meeting-3', activityId: 'meeting', hours: 32, text: '约了老同事在沙面散步半小时，重新拾起几个一直想做的点子。', shared: true, withReceipt: false },
      { key: 'outing-3', activityId: 'outing', hours: 20, text: '午后一个人去广东省博物馆慢慢看展，带回一张书签。', shared: true, withReceipt: true },
    ];

    for (const item of priorActions) {
      const ts = hoursAgo(item.hours);
      const pid = `demo-part-${item.key}`;
      const cid = `demo-comp-${item.key}`;
      insertPart.run(pid, 'user-a', item.activityId, 'completed', ts);
      insertComp.run(cid, pid, ts, `demo-seed-${item.key}`);
      insertRefl.run(cid, item.text, item.shared ? 'shared' : 'private', item.shared ? ts : null);
      if (item.withReceipt) {
        insertReceipt.run(
          cid,
          keccakId(`do-something:demo-receipt:${item.key}`),
          `simulation-${keccakId(`do-something:demo-tx:${item.key}`).slice(2, 18)}`,
          ts,
          ts,
        );
      }
    }

    // 进行中的《小王子》共读：已读完第 1~26 章，当前打开即停在第 27/27 章末章，点击「确认读完」即可进入上链扣点与双勋章铸造仪式！
    insertPart.run('demo-part-reading-active', 'user-a', 'reading', 'joined', tReadingStart);
    const readerWallet = new Wallet(keccakId('do-something:demo-reader-wallet:user-a')).address;
    const subjectHash = keccakId('do-something:reading:1:user-a');
    const bookHash = keccakId('the-little-prince:do-something:v1');
    const rulesHash = keccakId('coverage>=8000 AND lastChapter; eligible review; fixed rewards; v1');
    const readChapters = Array.from({ length: 26 }, (_, i) => i + 1); // 1..26 已读，当前停在第 27/27 章
    const highlights = [
      {
        id: 'hl-fox-1',
        chapter: 21,
        text: '“只有用心才能看得清。实质性的东西，用眼睛是看不见的。”',
        createdAt: hoursAgo(3),
      },
      {
        id: 'hl-fox-2',
        chapter: 21,
        text: '“正是你为你的玫瑰花费的时间，才使你的玫瑰变得如此重要。”',
        createdAt: hoursAgo(2),
      },
    ];
    this.database.prepare(`
      INSERT OR REPLACE INTO reading_challenges (
        participation_id, user_id, campaign_id, book_title, book_hash, rules_hash,
        reader_wallet, subject_hash, enrolled_at, enrollment_digest, enrollment_sig,
        already_completed, coverage_bps, last_chapter_completed,
        read_chapters_json, current_chapter, reading_seconds, highlights_json,
        reading_updated_at, mode
      ) VALUES (?, 'user-a', 1, '《小王子》', ?, ?, ?, ?, ?, ?, ?, 0, 9630, 0, ?, 27, 3420, ?, ?, 'simulation')
    `).run(
      'demo-part-reading-active',
      bookHash,
      rulesHash,
      readerWallet,
      subjectHash,
      tReadingStart,
      keccakId(`do-something:enrollment:digest:${subjectHash}`),
      `0x${'ab'.repeat(65)}`,
      JSON.stringify(readChapters),
      JSON.stringify(highlights),
      tReadingUpdate,
    );

    // 5) 给对照账户「小舟」也准备一条已分享的《小王子》真实共读回响，让「阿黎」完成阅读后能真正相遇
    const userB = this.database.prepare("SELECT id FROM users WHERE id = 'user-b' AND status = 'active'").get();
    if (userB) {
      insertPart.run('demo-part-userb-reading-1', 'user-b', 'reading', 'completed', tUserBReading);
      insertComp.run('demo-comp-userb-reading-1', 'demo-part-userb-reading-1', tUserBReading, 'demo-seed-userb-reading-1');
      insertRefl.run(
        'demo-comp-userb-reading-1',
        '合上第 27 章那一刻突然明白，狐狸说的“驯养”不是占有，而是彼此在时间里留下的认真约定。今晚抬头看广州的夜空，觉得风都温柔了。',
        'shared',
        tUserBReading,
      );
    }
  }

  private seed() {
    const alreadySeeded = this.database.prepare('SELECT value FROM meta WHERE key = ?')
      .get('demo_seed_v1') as { value: string } | undefined;
    const legacyDatabase = !alreadySeeded
      && (this.countRows('users') > 0 || this.countRows('activities') > 0);
    this.seedActivities();
    if (!alreadySeeded) {
      if (!legacyDatabase) this.seedDemoAccounts();
      this.database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
        .run('demo_seed_v1', now());
    }
    const seededEchoesV2 = this.database.prepare('SELECT value FROM meta WHERE key = ?')
      .get('demo_seed_echoes_v2') as { value: string } | undefined;
    if (!seededEchoesV2) {
      this.seedExampleEchoes();
      this.database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
        .run('demo_seed_echoes_v2', now());
    }
    if (this.seedRichProfile) {
      const seededRichV3 = this.database.prepare('SELECT value FROM meta WHERE key = ?')
        .get('demo_seed_rich_profile_v3') as { value: string } | undefined;
      if (!seededRichV3) {
        this.seedRichDemoProfile(false);
        this.database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
          .run('demo_seed_rich_profile_v3', now());
      }
    }
  }

  close() {
    this.database.close();
  }
}
