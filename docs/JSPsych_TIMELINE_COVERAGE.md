# jsPsych 时间线页 × ExpVis 实现现状

> **本文件是生成物** —— `python3 tests/expvis_probe.py coverage` 重写它。
> 数字来自探针的**实际运行结果**,不是手写的。改这里会被下次生成覆盖;
> 要改结论就改 `tests/expvis_probe.py` 里的 `timelineDocCases()`。

来源: <https://shaobin-jiang.github.io/jsPsych-Chinese-Documentation/v8/overview/timeline/>

**24 条已实现 · 7 条手写可达 · 3 条做不到 · 34 条合计。**

**✍️ 手写可达** = 编辑器不会自己写,但研究者可以 —— 在试次或节点上写一条自定义参数。
**❌ 做不到** = 怎么都表达不了。


## 创建实验 · 时间线

| 功能点 | ExpVis | 说明 |
|---|---|---|
| timeline array + jsPsych.run | ✅ 有 |  |
| type selects the plugin | ✅ 有 |  |

## 单个试次

| 功能点 | ExpVis | 说明 |
|---|---|---|
| a trial is an object | ✅ 有 |  |
| plugin parameters (stimulus …) | ✅ 有 |  |

## 多个试次

| 功能点 | ExpVis | 说明 |
|---|---|---|
| multiple trials as successive timeline.push() | ❌ 做不到 | ExpVis collects each phase into one node and pushes the node; pushing trials individually is the same experiment written differently |

## 嵌套时间线

| 功能点 | ExpVis | 说明 |
|---|---|---|
| an object with its own timeline | ✅ 有 |  |
| a node's parameters inherited by its children | ✍️ 手写可达 | ExpVis writes every parameter on each trial rather than lifting shared ones to the node. Same output; it just repeats itself |
| a child overriding an inherited value | ✍️ 手写可达 | the editor inherits nothing, so there is nothing for it to override. A node parameter is how a researcher inherits one — and then a child trial overrides it |
| nesting any number of levels deep | ❌ 做不到 | two levels: the phase node, and the timed segments inside one trial |

## 时间线变量

| 功能点 | ExpVis | 说明 |
|---|---|---|
| timeline_variables | ✅ 有 |  |
| jsPsych.timelineVariable('name') | ✅ 有 |  |
| jsPsych.evaluateTimelineVariable() | ✍️ 手写可达 | the editor never writes it. Reachable by hand: a custom parameter is a JavaScript expression emitted in place of a generated one |
| dynamic parameters (a function on a parameter) | ✍️ 手写可达 | the editor never writes one. Addressable with a custom parameter, or the two places it already writes a function itself: jittered fixation duration and sample.fn |

## 试次顺序随机

| 功能点 | ExpVis | 说明 |
|---|---|---|
| randomize_order | ✅ 有 |  |

## 抽样 sample

| 功能点 | ExpVis | 说明 |
|---|---|---|
| sample | ✅ 有 |  |
| sample with-replacement | ✅ 有 |  |
| weights | ✅ 有 |  |
| sample without-replacement | ✅ 有 |  |
| sample fixed-repetitions | ✅ 有 |  |
| sample alternate-groups | ✅ 有 |  |
| sample custom + fn | ✅ 有 |  |

## 重复一系列试次

| 功能点 | ExpVis | 说明 |
|---|---|---|
| repetitions | ✅ 有 |  |
| repetitions alongside timeline_variables | ✅ 有 |  |
| repetitions alongside loop_function | ✅ 有 |  |
| repetitions alongside conditional_function | ✅ 有 |  |

## 循环与条件时间线

| 功能点 | ExpVis | 说明 |
|---|---|---|
| loop_function | ✅ 有 |  |
| conditional_function | ✅ 有 |  |

## 在运行时修改时间线

| 功能点 | ExpVis | 说明 |
|---|---|---|
| on_finish pushing onto the timeline | ✍️ 手写可达 | on_finish is emitted only to score a trial; a node parameter can add more |
| main_timeline.pop() | ❌ 做不到 | same |

## 时间线开始/结束回调

| 功能点 | ExpVis | 说明 |
|---|---|---|
| on_timeline_start | ✍️ 手写可达 | the editor never writes one; a node parameter in the phase settings does |
| on_timeline_finish | ✍️ 手写可达 | same — a node parameter in the phase settings |

## 文档示例里的其它 API

| 功能点 | ExpVis | 说明 |
|---|---|---|
| initJsPsych() | ✅ 有 |  |
| jsPsych.pluginAPI.compareKeys() | ✅ 有 |  |
| jsPsych.data.get().last(1).values()[0] | ✅ 有 |  |

## 怎么用这张表

- **验证**:`python3 tests/expvis_probe.py check` —— 有的一定在,不做的一定不在
- **改结论**:改 `timelineDocCases()`,然后重跑 `coverage`

有两条写不成正则,改成把产物在 jsPsych 桩上求值后看结构(`nodeShape()`):
节点是否携带共享的试次参数、以及 `timeline` 最深嵌套几层。
