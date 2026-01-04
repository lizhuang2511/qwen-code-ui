我将使用 `pigar` 工具来生成项目的依赖文件 `requirements.txt`。

根据您的要求，我制定了以下执行计划：

1. **执行** **`pigar`** **命令**：
   将在项目根目录下运行 `pigar generate` 命令。
2. **设置排除目录**：
   使用 `-e` 参数排除 `test` 和 `参考文件` 文件夹，避免扫描这些目录下的文件。

   * 排除规则：`test/*`

   * 排除规则：`参考文件/*`
3. **自动处理交互**：
   为了确保命令顺利执行不中断，我将添加 `--auto-select` 和 `--question-answer yes` 参数，以便自动选择最佳匹配的包并自动回答确认问题。

生成的命令如下：

```bash
pigar generate -e "test/*" -e "参考文件/*" --auto-select --question-answer yes
```

