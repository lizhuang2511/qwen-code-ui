from parsers import parse_qwen_line
from cli_runner import build_client, build_command


def run():
    samples = [
        '{"content": "Hello Qwen"}',
        '{"message": "World"}',
        'plain text line',
        '',
    ]
    results = []
    for s in samples:
        r = parse_qwen_line(s)
        results.append(r)
    c = build_client("qwen", "qwen2.5-coder", ".")
    cmd = build_command(c)
    print({"parser_results": results, "qwen_command": cmd})


if __name__ == "__main__":
    run()

