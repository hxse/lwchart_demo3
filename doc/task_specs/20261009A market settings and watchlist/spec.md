# 行情设置与独立自选

## 任务边界

交付 just market、双来源 query、来源 Tab 设置、单一 hash 自选、独立编辑弹窗及离线测试。
同步受影响的 current spec、guide、README、公共配置注释和测试调用方。
直接替换 just crypto 与旧裸写 symbol／exchange_name／market／is_live 的页面参数；
旧书签需按新规则更新，旧写法明确失败，不建立兼容入口或双解析链。
内部目录、产物 dist-crypto、本地 API 路径、TOML 分区及行情请求协议保留原职责。
runtime 只返回 defaults，其中包含完整页面设置；旧 sources 字段及来源重置 helper 退出。
活动行情配置为完整页面设置的投影，不独立维护第二份可修改状态。
不改变行情窗口、EMA、时间或旧 Notebook 业务；不修改用户 config.toml，不新增在线测试。
所有规定交互和正式验证通过即可交付；不扩展服务端自选或浏览器存储。

## 任务规范

### 设置与来源

完整页面设置唯一维护 source、ccxt、tq 和公共显示参数。ccxt 为交易所、市场、环境、品种；
tq 为品种。两来源始终校验并保存，活动来源决定实际请求，非活动来源不传到行情 API。
TOML dashboard／ccxt／tq 组合成 runtime.defaults，私有鉴权仍不进入浏览器。
缺省 URL 字段使用对应启动默认值；首次加载补全所有新 query 字段，保留原 fragment。
来源 Tab 修改设置草稿中的 source，显示对应内部参数；来源 Tab 和参数共用一个细边框，公共参数在下方独立细边框内；边框沿用主题颜色。
切换 Tab 保留两边草稿；应用整体校验并提交一次，取消／关闭／Esc 丢弃草稿。
公共 dock_position 选择 top／bottom／left／right，TOML 缺省为 right；URL 缺省时采用启动默认值。
按钮栏为实际占位 div，42px 厚，左右竖排、上下横排；图表仅填充剩余空间，按钮不覆盖价格轴。
设置、自选和全部平铺按钮都在同一栏内，统一 32×30px；设置与自选入口固定在栏首，
平铺内容在剩余栏空间内滚动，竖排只纵向滚动、横排只横向滚动，未超出时没有滚动条。
位置应用、URL 导航与窗口变化只重排页面，不重新取数或重建图表；hash 与其他配置保留。
普通设置和自选展开面板保持浮层，从按钮栏朝图表一侧展开并限制在 viewport 内。
自选悬浮控制仍为浮层，左右及上侧栏在自选按钮下方显示，下侧栏向上显示，保持区域仍为 12px。
自选点击只覆盖 source 与目标来源的交易所／品种，其他所有设置保留，包括另一来源身份。
配置应用只有一个入口，供菜单和自选调用；实际行情沿既有活动配置链路更新。
来源切换保留公共 history_bars；CCXT 与 TQ 的实际请求继续各自投影参数。

### 独立自选

每页一个有序混合列表；允许当前品种不在其中，也允许重复条目。
fragment 为空表示无列表；有效条目按顺序显示，不同时请求未选中品种。
解析失败只在自选区域报错，不阻断有效 query 看盘；可打开编辑弹窗替换或清空。
小按钮独立于设置：无列表且未平铺时点击新建，有列表或开启平铺时点击展开／折叠。
鼠标进入小按钮后，在下方显示上一项／下一项。显示后以按钮与控制按钮联合矩形四周外扩
12px 为保持区域，范围内保持显示，离开立即隐藏；进入附近区域本身不触发显示。
键盘聚焦小按钮可显示控制，焦点离开控制区隐藏；鼠标离开保持区域时不因残留焦点继续显示。
面板默认折叠，朝图表一侧锚定自选按钮，150×320px；小屏限制为可用空间，不占图表布局。
面板标题带上一项、下一项、编辑、平铺、锁定及折叠按钮，内部纵向滚动；复用明暗主题和长名称提示。
锁定图标为 currentColor 单色线条，跟随主题，不使用彩色 emoji。
平铺默认 false，独立于临时锁定／展开状态，仅更新 hash 的 flat 布尔值，不改 query 或行情。
开启时保留原自选按钮，在实际按钮栏内依次排列上箭头、下箭头、编辑及全部候选；
候选复用正式选择入口，平铺栏在选择后保持显示；原悬浮框仍由原按钮展开，普通悬浮控制不重复显示。
平铺内容占用剩余按钮栏空间，按栏方向出现主题色细滚动条，未超出时不显示滚动条。
候选按钮名称：binance／kraken 取第一个 / 前的字符；tq 取最后一个 . 后的字符；
没有有效分隔或其它来源时显示完整 symbol。长名称省略，title 与可访问名称保留完整来源及品种。
平铺栏沿用当前项高亮与内部自动居中滚动。开关、编辑和导航均通过 hash／设置唯一链路更新。
展开或选中项／列表改变时，仅滚动列表使当前项居中；首尾限制在顶部／底部，无匹配项时不强制滚动。
当前条目按活动来源、交易所和品种匹配；重复时以上述第一匹配项为导航起点。
上一项／下一项首尾循环；当前不在列表时分别选择最后／第一项；空列表不可导航。
默认未锁定。未锁定时点击候选成功后或点击面板及自选按钮外部自动折叠；提交被拒绝时保留面板。
锁定后选择候选和点击外部均保持展开，仍可手动折叠。锁定只保存在页面状态，不进入 URL
或持久化，刷新恢复未锁定。未锁定时进入独立编辑弹窗收起列表，锁定时可保留。独立编辑弹窗支持新增、修改、删除、拖拽与上下按钮排序。
编辑使用草稿，保存才发布并保留 flat；空列表且 flat=false 时删除 fragment，flat=true 时保留布尔值。
关闭／取消／Esc 丢弃修改；平铺开关也遵守完整 URL 上限与原子提交失败语义。
保存只更新 hash，query 字节和设置状态保持原样，不刷新、不重载、不影响现有轮询。
保存一次及有效品种切换各新增一条浏览器历史；无变化不新增。浏览器前后退同步 query
和 hash；仅 hash 导航不重置设置草稿或重新配置行情。外部导航改变 hash 时关闭旧自选草稿。
不使用 localStorage、sessionStorage、IndexedDB，也不回写 TOML。

### 校验与失败语义

query 拒绝未知、重复、空参数和非法类型；内部身份与公共参数复用现有校验与失败语义。
hash 条目由来源和完整 symbol 构成，仅支持 binance、kraken、tq；来源忽略大小写。
hash 可含一次 flat=true 或 flat=false，位置不限；缺省 false。非法值或重复 flat 明确报错，
不影响有效 query；写入时只在 true 下输出 flat=true，置于候选之前，false 省略。
每个字段分别 URL 编码，先分隔再解码，保证 symbol 内的逗号、分号、百分号可往返。
允许最后一个分号，不接受中间空项、缺字段、未知来源、坏编码或非法 symbol。
完整编码 URL 最大 8192 字符，包含协议、主机、路径、query、hash。所有提交先检查，
超限弹窗说明当前长度、上限和缩短列表建议，阻止提交且保留原设置、URL、列表及草稿。
首次打开超长手写 URL 也弹窗提示，不截断内容，仍允许编辑缩短；非法 query 不发起行情。

## 公开接口与用户写法

```bash
just market
just market --dev --config=config.toml
just market --build
just market --serve
just market --stop
```

query 唯一字段为 source、ccxt.exchange_name、ccxt.market、ccxt.is_live、ccxt.symbol、
tq.symbol、layout、timeframes、indicators、refresh_seconds、history_bars、theme、timezone、dock_position。
字段取值范围沿用已有规范；两来源字段独立覆盖并始终序列化。以下是可直接打开的写法：

```text
http://127.0.0.1:5174/?source=tq&ccxt.exchange_name=binance&ccxt.market=future&ccxt.is_live=true&ccxt.symbol=BTC%2FUSDT%3AUSDT&tq.symbol=KQ.m%40SHFE.rb&history_bars=1500#binance,BTC/USDT:USDT;tq,KQ.m@SHFE.rb
http://127.0.0.1:5174/?dock_position=left#flat=true;binance,BTC/USDT:USDT;tq,KQ.m@SHFE.rb
```

仅写 ?source=tq 使用 TQ 默认品种，其余字段补全默认值。列表还可直接写：

```text
#Binance,BTC/USDT:USDT;binance,ETH/USDT:USDT;TQ,KQ.m@SHFE.rb;
#flat=true;binance,BTC/USDT:USDT;kraken,ETH/USD;tq,KQ.m@SHFE.rb
```

编辑保存使用小写来源与字段编码，保留 flat；无列表且默认未平铺时保存为空 fragment。
?symbol=ETH、?market=future、?ccxt.is_live=1 明确报错；#unknown,BTC 或坏百分号编码
只使自选不可用，不改变当前看盘。runtime 结果为 {defaults: 完整页面设置}，其中
ccxt／tq 是嵌套身份，公共参数与 source 位于 defaults 顶层，不含私有服务配置。

## 测试、验证与阶段过渡

按顺序运行正式入口 just check、just test、just market --build；全部必须通过。
just test 维持现有串行离线 Bun／Playwright 入口，测试 fixture 使用 market 命令。
逻辑测试覆盖两来源独立覆盖及往返、活动投影、公共字段保留、旧写法拒绝、hash 编码、
混合顺序、首尾导航、当前不在列表、非法输入及完整 URL 8192 边界。
浏览器覆盖 Tab 草稿与应用／取消、非活动参数保存、跨来源自选切换、主题、按钮悬浮连续性、
点击后折叠、当前项居中与首尾滚动、锁定与外部点击、悬浮区域进入／离开及残留焦点、按钮下方控制及分区主题边框、独立编辑增删修改、上下按钮及拖拽排序、保存只改 hash、空列表、书签恢复、
hashchange／前后退、错误隔离、超长弹窗和失败提交原子性。
验证平铺默认、hash 布尔值往返与反向错误、名称规则、书签与前后退、编辑保留模式、
空列表模式、长短按钮栏滚动、选择复用、模式切换不取数、超长开关拒绝及单色锁图标的明暗主题。
验证四向按钮栏实际占位、不覆盖图表、统一按钮尺寸、浮层锚定／窗口约束与悬浮控制，
位置草稿／应用／取消、默认值和非法值、URL 往返、hash 保留、不重取历史及旧入口隔离。
沿现有全部离线套件回归行情、EMA、数量、旧入口和开发／生产服务，测试只访问本地 fixture。
命令帮助和退出测试证明 just crypto 退出，market 参数、构建及停止仍正确。
本任务在同一 change 完整替换页面与 runtime 契约，无暂不可用阶段、旧参数兼容或接受的失败。
