# CODEX_TASK_TEMPLATE.md

每个 Codex 任务建议按以下格式执行和记录。

## Task

```text
<任务名称>
```

## Related milestone

```text
Milestone X: <名称>
```

## Files to read first

```text
AGENTS.md
problem.md
<相关 docs>
```

## Scope

### In scope

```text
<本任务要做什么>
```

### Out of scope

```text
<本任务不做什么>
```

## Expected output

```text
<代码/文档/测试/导出文件>
```

## Acceptance criteria

```text
[ ] <验收点 1>
[ ] <验收点 2>
```

## Problem tracker updates

```text
[ ] 检查 problem.md 中是否已有相关问题
[ ] 如发现新问题，新增 P-XXXX
[ ] 如修复问题，改为 FIXED_PENDING_BROWSER_RETEST
[ ] 真实浏览器复测通过后，改为 RESOLVED_BROWSER_VERIFIED
```

## Browser retest required?

```text
Yes / No
```

如果 Yes，必须填写：

```text
Browser:
Dataset:
Page:
Steps:
Expected:
Actual:
Evidence:
```
