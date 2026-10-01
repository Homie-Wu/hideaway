# 猎人部件资产

`blender --background --python assets/characters/build_characters.py`（需本机安装 Blender 4.x）

输出 `hunter-kit.blend` 和 `public/models/characters/hunter-kit.glb`。全部造型由本地原创脚本生成，无外部模型、贴图或运行时网络请求。角色约 48 游戏单位高，游戏 X 向右、Y 向上、-Z 向前；脚本映射到 Blender `(x,-z,y)`，glTF 导出恢复 Y-up。每个部件的原点就是运行时关节原点，所有网格变换已应用。

帽檐、面部、圆润袖口、背包、鞋底、枪管和刀刃具有独立轮廓。每个关节部件合并为一个含顶点色的网格；两个共享材质分别表达衣物和涂装金属。运行时 `preloadHunterAssets` 先加载、验证必需名称并缓存，共享几何/材质克隆。失败直接反馈资源错误，不静默替换。无蒙皮：`rig.ts` 的刚性关节层级和解析 IK 驱动 Blender 部件，提供步态、跑跳落地、蹲伏、瞄准、攻击、换弹、切换、受击和倒地。

四武器坐标统一为右手握柄原点，枪口沿 -Z；`grip-mount`、`magazine-mount` 和实时 `muzzle` 挂点在运行时关节层级提供。武器数值和命中规则未更改。
