# GeoIP.mmdb 获取与恢复

Core 和 Agent 共用 `<安装根目录>/gpupanel/geo/GeoIP.mmdb`，默认是
`/opt/gpupanel/geo/GeoIP.mmdb`，用于登录日志和 SSH 历史的地址信息。
数据库缺失时 SSH 历史仍应展示，地址信息暂时为空。

当前数据源为：

```text
https://resource.fit2cloud.com/1panel/package/v2/geo/GeoIP.mmdb
```

此地址来自 [1Panel dev-v2 官方打包脚本](https://github.com/1Panel-dev/1Panel/blob/dev-v2/ci/script.sh)。
旧的 `/resource/v2/geo/GeoIP.mmdb` 和本次探测的国际站地址返回 404，GeoIP
统一使用上面实际可获取的地址；其他资源地址和版本通道不变。

启动时先校验现有数据库，再尝试最近升级包中的 `GeoIP.mmdb`，最后远程下载。
下载限时 90 秒、文件上限 128 MiB；先写同目录独立临时文件，逐网络解码校验后
原子替换。HTTP 错误、损坏或截断文件不替换现有数据库，临时文件会清理。
Core/Agent 同时启动也不会读取到写了一半的数据库。语言包恢复与 GeoIP 初始化独立。
失败会记录 `download geo ip failed`；修复网络后重启服务可再次尝试，没有后台无限重试。

上游自定义数据库使用 `country.en/zh`、`province.en/zh`，不应直接拿任意标准
GeoLite City 文件替换。本次文件缺少严格 `Verify()` 所要求的描述元数据，故使用
全量网络解码检查结构和本项目字段类型，并以真实中英文查询验证兼容性。

安装包仍允许在 `deploy/assets/GeoIP.mmdb` 存放操作员审核的数据文件；未提供时
首次启动需要访问上述地址。仓库未新增第三方数据库二进制，也不声明其再分发许可。
运行期下载不固定摘要以保留上游更新能力，HTTPS 来源不等于版本锁定；本次实测
文件的来源、摘要与结果见 [修复证据](../evidence/2026-10-16/geoip/RESULTS.md)。

## 本地复核

普通单元测试离线运行；真实数据库测试由环境变量显式提供文件：

```bash
(cd core && go test ./utils/geo ./init/geo)
(cd agent && go test ./utils/geo ./init/lang)
GPUPANEL_GEOIP_TEST_FILE=/absolute/path/GeoIP.mmdb sh -c 'cd core && go test -race -v ./utils/geo'
GPUPANEL_GEOIP_TEST_FILE=/absolute/path/GeoIP.mmdb sh -c 'cd agent && go test -race -v ./utils/geo'
```

`scripts/install-test/geoip.py` 只适用于本任务正在运行且数据库原先缺失的一次性 VM，
会停服备份旧二进制、替换当前构建、验证真实下载及重启查询。它需要私有目录中的
真实数据库参照文件和编译的 `geoip-check` 查询工具；不是生产修复脚本或通用升级器。
旧二进制保留在 guest `/opt/gpupanel/geoip-repair-backup/`，需回退时先停服再恢复这两个
二进制，保留数据库和业务数据。未执行生产升级、离线全量安装或应用恢复验收。
