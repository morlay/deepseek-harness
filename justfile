# 列出所有可用入口
[group('meta')]
default:
    @just --list

# 安装依赖
[group('env')]
dep:
    @aube install

# 更新依赖到最新版本
[group('env')]
update:
    @aube update --latest

# 目录清理
[group("env")]
clean:
    @rm -f aube-lock.yaml
    @aube clean

# 运行测试
[group('test')]
vitest *args:
    @aube exec vitest --run {{ args }}

# 分析 e2e 日志
[group('test')]
analyze-log file:
    @node tool/analyze-log.ts {{ file }}

# 代码检查
[group('lint')]
oxlint path="." *args:
    @aube exec oxlint {{ args }} {{ path }}

# 格式化代码（默认写入，仅检查用 --check）
[group('fmt')]
fmt path="." *args="-w -l":
    @aube exec prettier {{ args }} {{ path }}

[group("debug")]
exec cmd *args:
    {{ cmd }} {{ args }}
