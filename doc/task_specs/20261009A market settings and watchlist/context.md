# 行情设置与独立自选

## 使用场景与设计初衷

看盘已支持 CCXT 与 TQ，crypto 命令不能准确表达用途。用户希望在混合品种间快速
切换，保留布局、周期、历史数量等配置，并通过浏览器书签管理多个看盘组合。
现有来源切换会丢弃非活动来源的参数；仅保存一个 symbol 也无法恢复各来源的品种。

## 方案对比

将分组自选纳入设置与 query 会增加配置耦合；列表编辑本身无需改变看盘或请求行情。
使用一个混合列表并独立保存在 fragment，能按原顺序跨来源导航，并避免将列表发送到服务端。
浏览器本地存储或服务端列表管理增加额外持久化入口，不能直接以一个书签恢复全部状态。

## 取舍结论

一个页面保存一份完整设置和一个可为空的混合自选列表。query 同时保存 CCXT、TQ
内部参数与公共参数，source 选择活动来源；fragment 独立保存自选，书签负责多个组合。
窄悬浮面板只负责选择；增删、修改及排序放在独立弹窗。列表保存不触发配置应用。
依据 Chromium URL 传递限制及 Firefox 书签校验限制，应用选择更保守的 8192 字符
完整 URL 上限；它是应用限制，不宣称为浏览器通用硬上限。
来源为 [Chromium URL 常量](https://chromium.googlesource.com/chromium/src/+/HEAD/url/url_constants.h)
与 [Firefox 书签 URL 校验](https://searchfox.org/firefox-main/source/toolkit/components/places/PlacesUtils.sys.mjs)。
