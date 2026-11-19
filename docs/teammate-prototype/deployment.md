# 服务器部署

部署目标是可通过 HTTPS 访问的 Monad 测试网演示。页面和 API 由同一个 Node.js 进程提供，浏览器使用同一域名访问。示例采用一个容器实例和一个持久化卷，适合现有 JSON 状态与交易回执处理方式。

## 构建并运行

在服务器的部署环境中配置下列变量。文件保存在仓库之外，由运行账户读取。测试网部署钱包和核验私钥需与 `scripts/prototype-network.json` 对应的演示配置匹配。新服务器可挂载空卷开新场，迁移既有演示见下文。

| 变量 | 部署设置 |
| --- | --- |
| `PROTOTYPE_ORIGIN` | 浏览器使用的完整 HTTPS 根地址，例如 `https://demo.example.com` |
| `PROTOTYPE_DEMO_PASSWORD` | 至少 32 位的随机 Base64url 口令。可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` 生成 |
| `DEPLOYER_PRIVATE_KEY` | 测试网发布钱包私钥，用于演示发奖资金和测试 MON 手续费 |
| `DEMO_ATTESTOR_PRIVATE_KEY` | 测试网核验签名私钥，地址需与合约的 `attestor` 一致 |
| `MONAD_RPC_URL` | Monad 测试网 RPC，可使用项目默认值 |
| `PROTOTYPE_STATE_PATH` | 容器默认 `/var/lib/do-something/prototype-state.json`，如需覆盖，要放在挂载的持久化目录内 |

替换 `--env-file` 为服务器上保存配置的绝对路径。在项目根目录构建镜像，并用命名卷运行。下面的端口映射仅供同一服务器上的 HTTPS 网关访问。

```bash
docker build -t do-something:demo .
docker volume create do-something-data
docker run -d --name do-something --restart unless-stopped \
  --env-file /etc/do-something/prototype.env \
  --mount type=volume,source=do-something-data,target=/var/lib/do-something \
  -p 127.0.0.1:4175:4175 do-something:demo
```

宿主机上运行的 HTTPS 反向代理把该域名的请求转发到 `127.0.0.1:4175`，保留浏览器的 `Host`、`Origin` 和 `Authorization`。域名和证书由部署环境配置。以下是放在已配置 TLS 的 Nginx 虚拟主机内的转发段。

```nginx
location / {
    proxy_pass http://127.0.0.1:4175;
    proxy_set_header Host $http_host;
}
```

`GET /healthz` 初始化完成时返回 `200` 和 `{ "ready": true }`。打开 HTTPS 域名，用用户名 `demo` 和服务器配置的口令进入。演示访问凭据供受邀测试，进入后可切换虚拟居民。

## 状态与更新

- 同一个卷由一个应用实例使用。替换容器时先停止旧实例，再用同一份环境配置和同一个卷启动新实例。托管平台需要分配持久化磁盘，并关闭多副本和滚动并行启动。
- 要保留已有活动、头像、好友和未确认交易，在原实例停止后，将它的 `deployments/prototype-state.json` 导入新服务器的持久化目录。保留对应的测试网钱包配置，并让容器 `node` 用户拥有该文件和目录的读写权限。把状态文件作为私有数据备份，它含演示钱包私钥。
- 首次需要样例时，可在上述命令末尾使用 `do-something:demo node scripts/prototype-server.mjs --seed` 启动容器。该命令会按状态文件补齐缺少的预置活动，发布会消耗测试网资产。

如需公开注册与跨实例部署，后续使用真实用户认证和共享数据库，把模拟核验替换为获授权的数据来源。

[Node.js 24 发行版](https://nodejs.org/en/download/archive/v24) · [Docker 持久化卷](https://docs.docker.com/engine/storage/volumes)
