import { ArrowRight, Check, Database, FileKey2, LockKeyhole, Waypoints } from 'lucide-react';
import { Link } from 'react-router';

export default function AboutPage() {
  return (
    <div className="about-page page-container">
      <header className="about-hero">
        <p className="eyebrow">Do Something 的产品约定</p>
        <h1>连接，不必发生在<br />认识彼此之前。</h1>
        <p>我们关心的不是让两个人同时出发，而是当他们各自完成一件相似的小事之后，可以偶然看见：原来有人也在认真生活。</p>
        <div className="about-intro-banner">
          <div>
            <strong>想快速了解项目全貌与跨应用生活档案愿景？</strong>
            <span>我们已将独立的概念官网与架构图解拆分至独立页面，方便随时讲解与分享。</span>
          </div>
          <a className="primary-link" href="/intro.html">查看完整项目官网介绍<ArrowRight /></a>
        </div>
      </header>
      <section className="about-principles"><article><Waypoints /><h2>行动后连接</h2><p>没有匹配大厅、好友任务和即时聊天。同主题是最初也是唯一的匹配条件，偶然感不应以读取私密内容为代价。</p></article><article><LockKeyhole /><h2>自愿分享</h2><p>完成、写感受、允许分享、申请凭证是四个独立决定。任何一步都不替你做下一步的授权。</p></article></section>
      <section className="chain-explainer">
        <div><p className="eyebrow">链上与链下，各自负责什么</p><h2 className="section-title">凭证不是生活真实性的裁判。</h2><p>首版采用凭证方案 A：平台服务端生成不可预测的随机编号，并由受限提交账户登记。它主要证明“平台曾登记这个编号”，不证明你真的做了饭、读完书或改善了关系。</p></div>
        <div className="boundary-table" role="table" aria-label="链上与链下数据边界">
          <div role="row" className="boundary-row boundary-heading"><span role="columnheader">位置</span><span role="columnheader">保存内容</span><span role="columnheader">删除边界</span></div>
          <div role="row" className="boundary-row"><span role="cell"><Database />本地服务端</span><span role="cell">演示账户、参与、自报完成、正文、分享许可、随机编号与账户映射</span><span role="cell">撤回分享、删除正文或注销后可删除链下数据与映射</span></div>
          <div role="row" className="boundary-row"><span role="cell"><FileKey2 />Monad 测试网适配</span><span role="cell">仅随机凭证编号；链本身产生交易时间和提交地址</span><span role="cell">已广播或确认的历史无法由平台单方面抹除</span></div>
        </div>
      </section>
      <section className="simulation-explainer"><span className="soft-icon"><FileKey2 /></span><div><h2>Monad 测试网凭证说明</h2><p>页面仅在链上登记极简随机凭证编号。测试 MON 没有真实资产奖励，本产品也不提供代币、押金或兑换。</p></div></section>
      <section className="deletion-explainer"><p className="eyebrow">你始终可以说“不要了”</p><h2 className="section-title">分享能撤回，正文能删除，账户能注销。</h2><ul><li><Check />撤回后，新访问者不会再从相似经历接口读到该正文。</li><li><Check />删除正文会清空服务端文本与分享资格，不修改完成声明。</li><li><Check />注销会撤销会话、取消未广播任务并删除链下关联。</li><li><Check />他人此前复制或截图的内容，以及已确认的公开链历史，不承诺能够收回。</li></ul></section>
      <section className="about-closing"><h2>人本身是值得的。<br />完成，只是另一件值得被看见的事。</h2><Link to="/" className="primary-link">选一件想做的事<ArrowRight /></Link></section>
    </div>
  );
}
