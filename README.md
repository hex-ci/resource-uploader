Resource Uploader
===============================

[![Build Status](https://circleci.com/gh/hex-ci/resource-uploader/tree/master.svg?style=shield)](https://circleci.com/gh/hex-ci/resource-uploader/tree/master) [![Windows Build status](https://ci.appveyor.com/api/projects/status/rtsoxi1ek6atyxfb?svg=true)](https://ci.appveyor.com/project/hex-ci/resource-uploader) [![npm version](https://badgen.net/npm/v/resource-uploader)](https://www.npmjs.com/package/resource-uploader) [![Downloads](https://badgen.net/npm/dt/resource-uploader)](https://www.npmjs.com/package/resource-uploader)

一站式资源上传和处理工具（使用阿里云 OSS）

- [Resource Uploader](#resource-uploader)
  - [安装](#安装)
  - [特性](#特性)
  - [使用](#使用)
    - [上传资源到 OSS](#上传资源到-oss)
      - [用法](#用法)
      - [选项](#选项)
        - [--compress](#--compress)
        - [--babel](#--babel)
        - [--iife](#--iife)
        - [--obfuscate](#--obfuscate)
        - [--sass](#--sass)
        - [--less](#--less)
        - [--raw](#--raw)
        - [--concat](#--concat)
        - [--prefix](#--prefix)
        - [--name](#--name)
        - [--base64](#--base64)
        - [--dest](#--dest)
    - [刷新 OSS 资源](#刷新-oss-资源)
      - [用法](#用法-1)
    - [其它选项](#其它选项)
      - [--output-simple](#--output-simple)
      - [--config](#--config)
      - [--init-config](#--init-config)
    - [样式文件中的 px 转 rem 单位](#样式文件中的-px-转-rem-单位)
  - [示例](#示例)


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
resource-uploader [选项] 文件
```

简写：

```
res-up [选项] 文件
```

#### 选项

##### --compress

是否压缩文件。这个选项可以压缩图片、JS 脚本和样式文件。

简写: -c

类型: boolean

默认值: true

不压缩文件可以使用 `--no-compress`。

##### --babel

是否使用 Babel 转译 JS 文件。

类型: boolean

默认值: true

不进行转译可以使用 `--no-babel`。

##### --iife

JS 文件是否使用 IIFE（立即执行函数）包裹，启用压缩选项才可使用。一般来说这选项用于避免 JS 代码污染全局作用域。

类型: boolean

默认值: false

##### --obfuscate

是否开启 JS 深度混淆。这个选项一般用于混淆代码，防止别人拿到或分析源代码。

简写: -o

类型: boolean

默认值: false

##### --sass

是否使用 Sass 预处理器。

类型: boolean

默认值: true

不使用 Sass 预处理器可以这样 `--no-sass`。

##### --less

是否使用 Less 预处理器。

类型: boolean

默认值: true

不使用 Less 预处理器可以这样 `--no-less`。

##### --raw

是否上传原始文件。如果打开这个选项，所有文件处理选项全部关闭，文件将原封不动的上传到 OSS 或存储到目标位置。

类型: boolean

默认值: false

##### --concat

是否合并文件，如果开启此选项并传递多个文件，则会合并所有文件，并在 URL 中自动命名一个新文件名，如需要指定请使用 `--name` 选项。

类型: boolean

默认值: false

##### --prefix

自定义 URL 路径。可自定义生成的 URL 中的部分路径，例如: `http://domain.com/!/自定义路径/原文件名`。

简写: -p

类型: string

##### --name

自定义 URL 文件名。只用于开启文件合并和保存文件到本地的情况下，开启这个选项后合并文件将使用指定的文件名而不使用自动生成的文件名。例如: `http://domain.com/!/自定义路径/自定义文件名`。

类型: string

##### --base64

是否处理成 base64 内容，而不上传 OSS。单纯开启此选项会把生成的 base64 文本复制到剪贴板。

类型: boolean

默认值: false

##### --dest

本机文件系统路径，使用此选项将保存文件到指定路径，而不上传 OSS。可以使用此选项进行文件处理而不需要上传，如果结合 `--base64` 选项可以把 base64 内容保存到本地。

类型: string

### 刷新 OSS 资源

#### 用法

```
res-up refresh URL
```

URL 表示已经由 resource-uploader 生成的 OSS URL。一般使用这个命令覆盖已经上传过的文件，因为如果不刷新的话，OSS 会一直缓存旧的文件内容。

例如: `res-up refresh "https://oss.domain.com/-/xxx/filename.png"`

### 其它选项

#### --output-simple

是否简化控制台输出。简化输出后，控制台只输出生成的 URL，每行一个。

类型: boolean

默认值: false

#### --config

自定义配置文件。JSON文件格式，**配置数据需包裹在 alioss 字段名中**，可以通过这个选项指定其他配置文件的路径，一般用于多 OSS 账户之间的切换。

类型: string

示例:

custom-config.json

```
{
  "alioss": {
    "accessKeyId": "xxx",
    "secretAccessKey": "xxx",
    "bucket": "xxx",
    "urlPrefix": "xxx/",
    "endpoint": ""
  }
}
```

字段解释：

- accessKeyId：阿里云 OSS AccessKeyId
- secretAccessKey：阿里云 OSS AccessKeySecret
- bucket：阿里云 OSS Bucket 名称
- urlPrefix：阿里云 OSS 自定义域名，**需以 / 结尾**
- endpoint：阿里云 OSS 源站地址，为可选项，也可以直接去掉。

#### --init-config

初始化配置文件。使用这个选项重新初始化配置文件。

类型: boolean

默认值: false

### 样式文件中的 px 转 rem 单位

在样式文件的最开始增加 `@postcss-use postcss-pxtorem;` 即可，支持 css、sass、less。

如果需要对转换进行配置，可以这样：

```css
@postcss-use postcss-pxtorem {
  rootValue: 37.5;
}
```

配置默认值：

```css
@postcss-use postcss-pxtorem {
  rootValue: 75;
  unitPrecision: 6;
  replace: true;
  mediaQuery: false;
  minPixelValue: 2;
  propList: '["*"]';
  selectorBlackList: '["weui-", "no-rem-"]';
}
```

注意，其中 `propList` 和 `selectorBlackList` 中数组要用单引号括起来，数组中的字符串必须使用双引号，并且不能换行。

各个选项的意义请参考 https://github.com/cuth/postcss-pxtorem

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
