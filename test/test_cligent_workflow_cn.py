import sys
import os
import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

# Setup path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
crates_path = os.path.join(project_root, "crates")
if crates_path not in sys.path:
    sys.path.insert(0, crates_path)

# Cligent module has been removed
print("[信息] Cligent 模块已从代码库中移除。")
print("[信息] 此测试不再有效，将退出。")
sys.exit(0)

def test_cligent_workflow():
    print("=== 开始 Cligent 工作流测试 ===")
    
    # 创建临时目录作为 HOME
    with tempfile.TemporaryDirectory() as temp_home:
        temp_home_path = Path(temp_home)
        
        # 模拟 HOME 路径
        with patch("pathlib.Path.home", return_value=temp_home_path), \
             patch("os.path.expanduser", side_effect=lambda p: str(temp_home_path / p.replace("~/", "").replace("~", "")) if p.startswith("~") else p):
            
            print(f"[设置] 模拟 HOME 目录: {temp_home_path}")
            
            # 设置 Qwen 日志目录
            qwen_dir = temp_home_path / ".qwen"
            qwen_dir.mkdir(parents=True, exist_ok=True)
            
            # 创建示例会话日志（JSONL 格式）
            session_id = "session-test-001"
            log_file = qwen_dir / f"{session_id}.jsonl"
            
            messages = [
                {"role": "user", "content": "你好 Qwen", "timestamp": "2024-01-01T10:00:00Z"},
                {"role": "assistant", "content": "你好！我能为您做些什么？", "timestamp": "2024-01-01T10:00:01Z"},
                {"role": "user", "content": "写一些 Python 代码", "timestamp": "2024-01-01T10:00:05Z"},
                {"role": "assistant", "content": "好的，这是代码...", "timestamp": "2024-01-01T10:00:10Z"}
            ]
            
            with open(log_file, "w", encoding="utf-8") as f:
                for msg in messages:
                    f.write(json.dumps(msg) + "\n")
            
            print(f"[设置] 创建日志文件: {log_file}")
            
            # --- 用户测试逻辑 ---
            
            # 创建代理（使用 qwen 因为它符合我们的上下文）
            print("\n[操作] 创建 Qwen 代理...")
            try:
                agent = create("qwen")
            except Exception as e:
                print(f"[错误] 创建代理失败: {e}")
                import traceback
                traceback.print_exc()
                return

            # 列出可用日志
            print("\n[操作] 列出日志...")
            logs = agent.list_logs()
            print(f"找到 {len(logs)} 个对话日志")
            for uri, meta in logs:
                print(f"  - URI: {uri}, 时间: {meta.get('last_modified')}")

            if not logs:
                print("[错误] 未找到日志！请检查日志存储实现。")
                return
            
            target_log_uri = logs[0][0] 

            # 解析最近的对话
            print(f"\n[操作] 解析日志: {target_log_uri}")
            chat = agent.parse(target_log_uri)
            
            if chat:
                print(f"最新对话有 {len(chat.messages)} 条消息")
                for i, msg in enumerate(chat.messages):
                    print(f"  [{i}] {msg.role}: {msg.content[:20]}...")
            else:
                print("[错误] 解析对话失败")
                return
            
            # 选择特定消息并导出为 YAML
            # 选择第1条（你好 Qwen）和第3条（写一些 Python 代码）-> 索引 0 和 2
            print("\n[操作] 选择消息 [0, 2]...")
            agent.select(target_log_uri, [0, 2])
            
            print("\n[操作] 组成 YAML...")
            yaml_output = agent.compose()
            print("--- YAML 输出 ---")
            print(yaml_output)
            print("-------------------")
            
            # 保存 YAML 到文件（模拟用户操作）
            yaml_file = temp_home_path / "conversation.yaml"
            with open(yaml_file, "w", encoding="utf-8") as f:
                f.write(yaml_output)
            
            # 从 YAML 文件加载消息
            print("\n[操作] 从文件分解 YAML...")
            with open(yaml_file, "r", encoding="utf-8") as f:
                yaml_content = f.read()
            
            loaded_chat = agent.decompose(yaml_content)
            print(f"从 YAML 加载了 {len(loaded_chat.messages)} 条消息")
            
            # 验证加载的内容
            if len(loaded_chat.messages) == 2:
                print("[成功] 加载了正确数量的消息。")
                # 注意：角色可能是枚举类型，比较字符串
                if str(loaded_chat.messages[0].content) == "你好 Qwen" and str(loaded_chat.messages[1].content) == "写一些 Python 代码":
                     print("[成功] 消息内容验证通过。")
                else:
                     print(f"[失败] 消息内容不匹配: {[m.content for m in loaded_chat.messages]}")
            else:
                print(f"[失败] 期望 2 条消息，实际得到 {len(loaded_chat.messages)}")

if __name__ == "__main__":
    test_cligent_workflow()
