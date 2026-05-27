# ExpVis — BRM 投稿计划

## 基本信息

| 项目 | 内容 |
|------|------|
| **工具名称** | ExpVis |
| **目标期刊** | *Behavior Research Methods* (IF 4.6, 5年IF 7.2, Q1) |
| **投稿类型** | **Tutorial**（非 Original Article） |
| **核心叙事** | 可视化组件式实验构建 + AI生成 + 多智能体审核 + jsPsych代码导出 |

---

## 1. 论文定位

现有工具的可视化编辑（lab.js）和 AI 辅助（SweetBean, MacBehaviour）是分离的——没有人将可视化拖拽、AI生成、AI审核整合到一个完整的实验开发管线中。ExpVis 填补了这个空白。

**与现有工具的关键差异：**

| Feature | ExpVis | lab.js | Gorilla | PsychoPy | jsPsych |
|---------|--------|--------|---------|----------|---------|
| Visual drag-drop | ✅ | ✅ | ✅ | ✅ | ❌ |
| AI generation (NL→experiment) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-agent review | ✅ | ❌ | ❌ | ❌ | ❌ |
| jsPsych code export | ✅ | ❌ | ❌ | ❌ | 本身就是 |
| Device simulation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Built-in data dashboard | ✅ | ❌ | ❌ | ❌ | ❌ |
| 17 component types | ✅ | ~10 | ~15 | ~20 | unlimited |
| 3-preview pipeline | ✅ | partial | ✅ | ✅ | ❌ |

---

## 2. 论文结构

```
1. Introduction
2. System Architecture
3. Tutorial: Building Experiments with ExpVis
4. AI Generation Fidelity Assessment
5. Comparison with Existing Tools
6. Discussion
7. Appendix: Component Specification
```

### 2.1 Introduction
- 痛点：现有在线实验工具要么需要编程技能（jsPsych），要么缺乏AI辅助
- 现有方案的局限：lab.js（可视化但无AI），SweetBean（Python DSL但无UI），MacBehaviour（AI但方向相反——测试AI而非辅助人类研究）
- 方案：ExpVis = 组件式可视化 + AI生成 + AI审核 + jsPsych输出

### 2.2 System Architecture（不需要验证数据）
- **2.2.1 组件体系**：17种组件，三类（Stimulus/Response/Logic）
- **2.2.2 三预览统一渲染管线**：实时预览 → 可视化编辑 → 全屏交互预览
- **2.2.3 AI生成管线**：NL → 多Provider API → 实验JSON → 可视化编辑
- **2.2.4 多智能体审核**：伦理学/安全性/方法论三个Agent
- **2.2.5 jsPsych代码生成**：内部表示 → 标准jsPsych timeline
- **2.2.6 发布与数据系统**：独立实验文件 + 内置数据看板

### 2.3 Tutorial（4个逐步教程，配截图）
| Tutorial | 内容 | 展示的功能 |
|----------|------|-----------|
| T1: Stroop任务 | 15步从零搭建 | drag-drop, 文本/键盘/注视点/循环 |
| T2: Flanker任务 | 箭头+映射按键+分支 | randomize, key mapping, branch |
| T3: 最后通牒博弈 | 滑块+循环 | slider, variable |
| T4: AI生成实验 | NL描述→一键生成→微调→发布 | AI generation, multi-provider |

### 2.4 AI Generation Fidelity Assessment（替代人类被试验证）

**不需要收人类被试。只需要专家评分。**

- 用AI（GPT-4o）生成5种经典范式：Stroop, Simon, Flanker, IAT, N-back
- 每种范式生成3次（共15个实验）
- 3位评审者独立评估：
  - 阶段结构完整率（0-100%）
  - 组件完整率
  - 逻辑正确率（randomize/branch/loop）
  - 总体可用性（1-5 Likert）
- 统计：inter-rater reliability (ICC), 平均正确率

### 2.5 Comparison with Existing Tools
参见上方对比表。

### 2.6 Discussion
- 贡献：降低技术门槛 + AI辅助闭环
- 局限：单HTML架构，localStorage存储，review为规则引擎
- 未来：后端，多人实验，真实LLM审核

---

## 3. 工具开发进度

### 已完成 ✅
- [x] 17种组件的可视化编辑器
- [x] 三预览统一渲染管线
- [x] 7个经典实验模板
- [x] AI生成（OpenAI/Claude/Gemini/DeepSeek/通义千问/自定义兼容）
- [x] 多智能体审核
- [x] jsPsych代码生成
- [x] 设备模拟（Desktop/Mobile）
- [x] 发布独立实验文件
- [x] 发布文件内置数据看板
- [x] 中英文界面（默认英文）
- [x] 项目代码模块化
- [x] 重命名为 ExpVis
- [x] 全部UI英文化

### 待完成 ⏳
- [ ] GitHub仓库 + Zenodo DOI
- [ ] GitHub Pages在线Demo
- [ ] 论文写作
- [ ] AI生成fidelity评估（5范式×3次×3评审者）
- [ ] 论文截图准备

---

## 4. 关键文献

| 论文 | 期刊/年份 | 用途 |
|------|----------|------|
| lab.js (Henninger et al.) | BRM 2022 | 最直接竞品，Related Work |
| jsPsych (de Leeuw) | BRM 2015 | 先驱，代码生成目标 |
| Gorilla (Anwyl-Irvine et al.) | BRM 2020 | 商业竞品参考 |
| PsychoPy2 (Peirce et al.) | BRM 2019 | 最主流工具，必引 |
| MacBehaviour (Duan et al.) | BRM 2025 | AI实验工具论文范例 |
| SweetBean (Strittmatter & Musslick) | JOSS 2025 | Python DSL→jsPsych |
| VR online tutorial (Kumle et al.) | BRM 2026 | Tutorial格式模板 |
| DDM-UI (Aguayo-Mendoza & Dos Santos) | BRM 2025 | 可视化UI工具论文范例 |
| e-Babylab (Lo et al.) | BRM 2024 | 开源浏览器工具范例 |

---

## 5. 时间线

| 阶段 | 任务 | 预估 |
|------|------|------|
| 第1周 | GitHub开源 + Demo + 论文 System Architecture 写作 | 3天 |
| 第2周 | 论文 Tutorial 部分（4个教程+截图） | 3天 |
| 第3周 | AI生成fidelity评估 + Results | 2天 |
| 第4周 | Introduction + Discussion + 打磨 | 3天 |
| 第5周 | 内部修改 + 投稿 | 2天 |

**总计：约3-4周**

---

## 6. 投稿checklist

- [ ] 所有作者确认
- [ ] BRM Tutorial 模板格式
- [ ] 代码 GitHub 开源（MIT license）
- [ ] 在线 Demo 可访问
- [ ] Zenodo DOI
- [ ] 所有图表高分辨率
- [ ] 引用格式正确（APA 7th）
- [ ] 补充材料：ExpVis Component Specification (Appendix)
- [ ] 补充材料：Tutorial截图合集
- [ ] Cover letter
