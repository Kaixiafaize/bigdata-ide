#!/usr/bin/env python3
"""
轻量子内核包装器（原型）

协议: 通过 STDIN 接收一条 JSON 消息, 形如:
  {"id": "<id>", "code": "<python code>"}

执行后输出一条 JSON 到 STDOUT:
  {"id": "<id>", "status": "ok|error", "output": "...", "errors": "..."}

注意: 这个脚本用于原型验证；生产应使用长连接的子进程池并添加心跳/超时控制。
"""
import sys
import json
from io import StringIO


def handle_request(msg: dict):
    req_id = msg.get('id')
    code = msg.get('code', '')

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = out_buf = StringIO()
    sys.stderr = err_buf = StringIO()

    try:
        if code and code.strip():
            compiled = compile(code, '<string>', 'exec')
            exec_namespace = {}
            exec(compiled, exec_namespace)

        status = 'ok'
        output = out_buf.getvalue()
        errors = err_buf.getvalue()

    except Exception as e:
        status = 'error'
        output = out_buf.getvalue()
        errors = f"{type(e).__name__}: {e}\n" + err_buf.getvalue()

    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    return {
        'id': req_id,
        'status': status,
        'output': output,
        'errors': errors
    }


def main():
    # 持续从 stdin 读取每行 JSON 请求
    try:
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                resp = {'id': None, 'status': 'error', 'output': '', 'errors': 'Invalid JSON'}
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
                continue

            # 支持心跳协议: {"type":"ping"} -> {"type":"pong"}
            if isinstance(msg, dict) and msg.get('type') == 'ping':
                resp = {'id': msg.get('id'), 'type': 'pong'}
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
                continue

            resp = handle_request(msg)
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

    except KeyboardInterrupt:
        pass
    except Exception as e:
        try:
            sys.stdout.write(json.dumps({'id': None, 'status': 'error', 'output': '', 'errors': str(e)}) + "\n")
            sys.stdout.flush()
        except Exception:
            pass


if __name__ == '__main__':
    main()
