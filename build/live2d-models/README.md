这里已经内置了默认模型 Shizuku，来源于公开 npm 包 live2d-widget-model-shizuku。

如果你还要继续随安装包内置其他模型，把已经获得授权的 Live2D 完整模型目录放在这里，重新打包后应用会自动扫描并显示为“安装包内置”模型。

推荐目录结构：

build/live2d-models/shizuku/shizuku.model.json
build/live2d-models/my-assistant/model.model3.json

注意事项：

1. 模型配置引用到的 moc、纹理、动作、物理、表情等文件，需要和 model.json 或 model3.json 处在同一目录树内。
2. 当前实现会拒绝包含 ../ 上级目录引用的模型包，避免打包后资源丢失。
3. 不要把未授权的第三方模型直接打进安装包。
4. 若要替换默认模型，可删除 shizuku 目录后放入你自己的内置模型，再同步调整前端默认路径。