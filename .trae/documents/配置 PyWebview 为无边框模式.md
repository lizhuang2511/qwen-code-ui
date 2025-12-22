要实现 PyWebview 不显示原生窗口边框（标题栏、最大化/最小化按钮等），只需要在 `create_window` 函数中添加 `frameless=True` 参数即可。

为了保证无边框窗口仍然可以被拖动，通常还会配合 `easy_drag=True` 参数（允许按住窗口任意非交互区域进行拖拽），或者您需要在 React 前端实现专门的拖拽区域。

**计划修改文件**: `d:\giteecode\qwencode5\main.py`

**修改内容**:
```python
    window = webview.create_window(
        "QWENCODE", 
        entry, 
        js_api=Api(), 
        text_select=True,
        width=1400,
        height=800,
        frameless=True,  # 新增：隐藏窗口边框
        easy_drag=True   # 新增：允许拖拽窗口
    )
```

确认后，我将为您应用此更改。