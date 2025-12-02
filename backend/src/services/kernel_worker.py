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


def main():
    try:
        raw = sys.stdin.read()
        if not raw:
            return
        msg = json.loads(raw)
        req_id = msg.get('id')
        code = msg.get('code', '')

        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = out_buf = StringIO()
        sys.stderr = err_buf = StringIO()

        try:
            if code and code.strip():
                # 执行用户代码
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

        resp = {
            'id': req_id,
            'status': status,
            'output': output,
            'errors': errors
        }

        sys.stdout.write(json.dumps(resp))
        sys.stdout.flush()

    except Exception as e:
        # 最后保险，确保返回 JSON
        try:
            sys.stdout.write(json.dumps({'id': None, 'status': 'error', 'output': '', 'errors': str(e)}))
            sys.stdout.flush()
        except Exception:
            pass


if __name__ == '__main__':
    main()
