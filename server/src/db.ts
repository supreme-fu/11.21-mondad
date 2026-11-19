import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const now = () => new Date().toISOString();

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

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
    this.seed();
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        demo_key TEXT UNIQUE,
        display_name TEXT NOT NULL,
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
        reading_updated_at TEXT,
        review_submitted_at TEXT,
        reading_claimed_at TEXT,
        reading_proof_digest TEXT,
        reading_tx_hash TEXT,
        review_claimed_at TEXT,
        review_proof_digest TEXT,
        review_tx_hash TEXT,
        badge_token_id INTEGER,
        reward_reading_dsdemo TEXT NOT NULL DEFAULT '10',
        reward_review_dsdemo TEXT NOT NULL DEFAULT '2',
        mode TEXT NOT NULL DEFAULT 'simulation'
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_participations_user ON participations(user_id);
      CREATE INDEX IF NOT EXISTS idx_participations_user_activity ON participations(user_id, activity_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
      CREATE INDEX IF NOT EXISTS idx_reading_challenges_user ON reading_challenges(user_id);
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

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
      'INSERT OR IGNORE INTO users (id, demo_key, display_name, status, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insertUser.run('user-a', 'a', '阿黎', 'active', now());
    insertUser.run('user-b', 'b', '小舟', 'active', now());
    insertUser.run('user-example', null, '示例经历', 'active', now());
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

  private seed() {
    const alreadySeeded = this.database.prepare('SELECT value FROM meta WHERE key = ?')
      .get('demo_seed_v1') as { value: string } | undefined;
    // 兼容本修复之前创建的数据库：库里已有用户或主题，说明初始化早已发生过，
    // 缺失的演示账号只可能来自注销，此时不再重建，保证注销是永久的。
    const legacyDatabase = !alreadySeeded
      && (this.countRows('users') > 0 || this.countRows('activities') > 0);
    // 主题目录是静态元数据，与个人记录无关，每次启动幂等补齐（需早于示例参与记录，外键依赖它）。
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
  }

  close() {
    this.database.close();
  }
}
