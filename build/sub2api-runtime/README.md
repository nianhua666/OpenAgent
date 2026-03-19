Sub2API 桌面运行时目录

这里现在只作为 **内嵌兜底运行时目录**，不再建议把它当成主要维护方式。

当前推荐顺序：

1. 在 OpenAgent 的 Sub2API 页面配置 **源码目录**
2. 拉取官方源码仓库 `https://github.com/Wei-Shaw/sub2api.git`
3. 在本机构建源码产物
4. 让 OpenAgent 优先使用源码构建出来的 `sub2api.exe`

如果源码模式不可用，OpenAgent 才会回退到这里：

- `bin/sub2api.exe`
- 其他运行时依赖文件

数据库与 Redis 不建议继续手工装在宿主机里。当前更推荐在 OpenAgent 的 Sub2API 页面里启用容器化依赖模式，让 PostgreSQL / Redis 通过 Docker Compose 在应用数据目录下独立运行和持久化。

开发态下，OpenAgent 会把这里当作兜底二进制路径。
打包后，electron-builder 会把整个目录复制到 `resources/sub2api-runtime`，作为发布包内的备用运行时。

运行时数据不要放在这里，而是放到应用数据目录下的 `sub2api-runtime`，避免覆盖用户配置、日志和 setup 结果。
