# 手机测试：大师杆法与战术版（未部署）

预览为 pool-master-tactics-preview.html，默认八球、56% 力度、中杆。顶部保留横屏、全屏、AI 测试与音乐按钮。

建议依次试：

1. 普通直球、薄球、碰库：确认熟悉的减速与碰撞手感已经回来。
2. 八球与九球开球：先用 56%，再试 80% 和 100%，比较散球和最高球速。
3. 辅助线：原来的首碰圆和两条短线已恢复，不显示全台反弹预测。
4. 袋口：打开 AI 测试，选择角袋慢球、中袋慢球、30° 切入和打偏袋口，分别观察落袋与反弹；再手动试擦袋角。口径保留 +2%。
5. AI 测试选择“大师翻袋专项”：观察出杆前击球点的低杆位置、目标球先碰库再落袋。
6. 选择“大师勾球进袋 · 有挡球”：观察白球绕过挡球，先碰下库再碰 1 号并进袋。
7. 选择“大师做斯诺克 · 高杆加塞”：观察出杆前高杆加左塞的击球点、白球停在遮挡位置；下一杆手动检查对手可否直接碰到自己的球。专项场景自动使用大师档；只是指定搜索战术，击球仍用实际物理。
8. 选择“大师杆法与下一球走位”，比较击球点及下一杆打 2 号的角度；普通局面再切标准、入门作对比。新开一局也可选择大师，确认正常对局会自行取舍进攻和防守。

运行当前检查：

```
node tests/physics-regression.cjs
node tests/physics-spin-regression.cjs
node tests/pocket-regression.cjs
node tests/preview-pocket-smoke.cjs /workspace/pool-master-tactics-preview.html
node tests/master-position-regression.cjs
node tests/master-tactics-regression.cjs
node tests/preview-master-smoke.cjs /workspace/pool-master-tactics-preview.html
node tests/ai-regression.cjs
node tests/source-mobile-smoke.cjs
node tests/mobile-preview-smoke.cjs /workspace/pool-master-tactics-preview.html
node tests/preview-clock-regression.cjs /workspace/pool-master-tactics-preview.html
```

预览使用原游戏的固定步长时钟。source-mobile 和预览 smoke 使用模拟接口，不代替真机测试。大师规划会先试算，手机上可能需要等待数秒。专项测试用固定随机种子验证，实际试玩仍有执行误差。详细实现见 MASTER_TACTICS.md，物理及袋口说明见 PHYSICS_REVIEW.md。音乐沿用上一版测试曲。源码在 real-pool-web 目录启动本地静态服务即可测试。

当前部署要求：本版保存到与 main 并列的 real-pool-master-20261006 分支，以 real-pool-web 为独立站点根目录；保留原网站及其发布设置，按用户此前确定的平台发布到新地址。公网部署进度以当前回复为准。
