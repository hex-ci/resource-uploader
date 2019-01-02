Resource Uploader
===============================

[![Build Status](https://circleci.com/gh/hex-ci/resource-uploader/tree/master.svg?style=shield)](https://circleci.com/gh/hex-ci/resource-uploader/tree/master) [![Windows Build status](https://ci.appveyor.com/api/projects/status/rtsoxi1ek6atyxfb?svg=true)](https://ci.appveyor.com/project/hex-ci/resource-uploader)

一站式前端资源 CDN 上传工具（使用阿里云 OSS）

## 安装

```
npm install -g resource-uploader
```

## 使用

用法:

```
res-up [选项] 文件
```

选项:

| 选项            | 描述                                                           | 类型                   |
|-----------------|----------------------------------------------------------------|------------------------|
| -h, --help      | 显示帮助信息                                                   | [布尔]                 |
| --compress, -c  | 是否压缩文件                                                   | [布尔] [默认值: true]  |
| --prefix, -p    | 自定义 URL 路径                                                | [字符串]               |
| --name          | 自定义 URL 文件名                                              | [字符串]               |
| --concat        | 是否合并文件                                                   | [布尔] [默认值: false] |
| --base64        | 是否处理成 base64 内容，而不上传 CDN                           | [布尔] [默认值: false] |
| --dest          | 本机文件系统路径，使用此参数将保存文件到指定路径，而不上传 CDN | [字符串]               |
| --refresh, -r   | 否刷新 CDN 资源                                                | [布尔] [默认值: false] |
| --output-simple | 是否简化控制台输出                                             | [布尔] [默认值: false] |
| --init-config   | 初始化配置文件                                                 | [布尔] [默认值: false] |
| --version, -v   | 显示版本信息                                                   | [布尔]                 |

示例：

```
res-up filename.png
res-up /Users/xxx/Desktop/**/*.png
res-up /Users/xxx/Desktop/**/*.png --output-simple
res-up /Users/xxx/Desktop/1.js /Users/xxx/Desktop/2.js --concat
res-up --prefix folder1/folder2 filename.png
res-up --prefix folder1/folder2 --name new.png filename.png
res-up --base64 filename.png
res-up --base64 --dest /Users/xxx/Desktop filename.png
res-up --dest /Users/xxx/Desktop filename.png
res-up --no-compress filename.png
res-up --refresh "https://domain.com/-/xxx/filename.png"
```
