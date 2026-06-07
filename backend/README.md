# Backend

建议技术栈：FastAPI + Python 3.11+。

开发原则：

```text
API 层保持薄。
业务逻辑放 services。
视觉算法放 vision。
数据模型放 core。
相机和温控 adapter 必须 lazy import。
```
