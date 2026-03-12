Sub2API 桌面运行时目录

建议目录结构：

- bin/sub2api.exe
- 其他运行时依赖文件

OpenAgent 开发态会优先从 build/sub2api-runtime/bin/sub2api.exe 查找本地网关二进制。
打包后，electron-builder 会把整个目录复制到 resources/sub2api-runtime。

当前桌面版只使用内嵌二进制运行时，不依赖 Docker 或 Compose。

运行时数据不建议放在这里，而是放到应用数据目录下的 sub2api-runtime，以避免覆盖用户配置、日志和 setup 结果。