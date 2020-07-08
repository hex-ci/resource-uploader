Resource Uploader
===============================

[![Build Status](https://circleci.com/gh/hex-ci/resource-uploader/tree/master.svg?style=shield)](https://circleci.com/gh/hex-ci/resource-uploader/tree/master) [![Windows Build status](https://ci.appveyor.com/api/projects/status/rtsoxi1ek6atyxfb?svg=true)](https://ci.appveyor.com/project/hex-ci/resource-uploader) [![npm version](https://badgen.net/npm/v/resource-uploader)](https://www.npmjs.com/package/resource-uploader) [![Downloads](https://badgen.net/npm/dt/resource-uploader)](https://www.npmjs.com/package/resource-uploader)

一站式资源上传和处理工具（使用阿里云 OSS）

## 安装

```
npm install -g resource-uploader
```

## 特性

* 支持 Babel 转译
* 支持 Javascript 压缩和优化
* 支持 Javascript 深度混淆
* 支持 Sass/Less 转 CSS
* 支持 CSS 自动加浏览器前缀
* 支持 px 单位转 rem 单位（可选）
* 支持 CSS 压缩和优化
* 支持 jpg/png/gif 压缩和优化，优化包括渐进式加载等
* 支持处理 HTML 文件，自动处理 HTML 中引用的所有资源
* 自动生成全站唯一 URL，形如 `https://domain.com/-/905bab36808f28a7/filename.png`
* 自动设置 HTTP 缓存头，永久缓存资源在浏览器
* 支持多配置
* 支持处理成 BASE64 资源
* 支持多文件合并

## 使用

### 上传资源到 OSS

#### 用法

```
res-up [选项] 文件
```

#### 选项

##### --compress

是否压缩文件

简写: -c

类型: boolean

默认值: true

#### --babel

是否使用 Babel 转译 JS 文件

类型: boolean

默认值: true

#### --iife

JS 文件是否使用 IIFE（立即执行函数）包裹，启用压缩选项才可使用

类型: boolean

默认值: true

#### --obfuscate

是否开启 JS 深度混淆

简写: -o

类型: boolean

默认值: false

#### --sass

是否使用 Sass 预处理器

类型: boolean

默认值: true

#### --less

是否使用 Less 预处理器

类型: boolean

默认值: true

#### --raw

是否上传原始文件

类型: boolean

默认值: false

#### --prefix

自定义 URL 路径

简写: -p

类型: string

#### --name

自定义 URL 文件名

类型: string

#### --base64

是否处理成 base64 内容，而不上传 OSS

类型: boolean

默认值: false

#### --dest

本机文件系统路径，使用此参数将保存文件到指定路径，而不上传 OSS

类型: string

#### --concat

是否合并文件

类型: boolean

默认值: false

### 刷新 OSS 资源

#### 用法

```
res-up refresh URL
```

### 公共选项

#### --output-simple

是否简化控制台输出

类型: boolean

默认值: false

#### --config

自定义配置文件

类型: striing

#### --init-config

初始化配置文件

类型: boolean

默认值: false

## 示例

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
res-up --config ./custom-config.json filename.png
res-up refresh "https://domain.com/-/xxx/filename.png"
```
