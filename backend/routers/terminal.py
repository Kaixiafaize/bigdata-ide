"""
终端 WebSocket：在服务端启动一个 shell，与前端 xterm 双向通信。
Unix 下使用 PTY，shell 为真实交互式终端；Windows 下使用 PIPE。
"""
import asyncio
import logging
import os
import sys

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["terminal"])


def _run_with_pty(websocket, master_fd):
    """Unix：在 PTY 上读写，通过 queue 与 asyncio 交互。"""
    import fcntl

    try:
        # 非阻塞
        fl = fcntl.fcntl(master_fd, 1)  # F_GETFL
        fcntl.fcntl(master_fd, 2, fl | os.O_NONBLOCK)  # F_SETFL
    except Exception:
        pass

    loop = asyncio.get_event_loop()
    queue = asyncio.Queue()

    def reader():
        try:
            data = os.read(master_fd, 4096)
            if data:
                queue.put_nowait(data)
            else:
                queue.put_nowait(None)
        except (BlockingIOError, InterruptedError):
            pass
        except Exception as e:
            logger.exception("PTY read error: %s", e)
            queue.put_nowait(None)

    loop.add_reader(master_fd, reader)
    return queue, loop, master_fd


async def _read_pty_and_send(queue, websocket, loop, master_fd):
    """从 queue 取 PTY 输出并发送到 WebSocket。"""
    try:
        while True:
            data = await queue.get()
            if data is None:
                break
            await websocket.send_bytes(data)
    finally:
        try:
            loop.remove_reader(master_fd)
            os.close(master_fd)
        except Exception:
            pass


@router.websocket("/terminal/ws")
async def terminal_websocket(websocket: WebSocket):
    """终端 WebSocket：一端连前端 xterm，一端连本机 shell。"""
    await websocket.accept()
    proc = None
    master_fd = None
    # 告知前端是否需要本地回显：Windows PIPE 无回显需前端 echo，Unix PTY 有回显不需
    need_local_echo = sys.platform == "win32"
    try:
        await websocket.send_json({"type": "terminal_mode", "local_echo": need_local_echo})
        # Windows 下 shell 无 PTY 不输出提示符，发一行假提示让用户看到“有终端”
        if sys.platform == "win32":
            await websocket.send_text("\r\n> ")
    except Exception:
        pass

    try:
        if sys.platform == "win32":
            # Windows：PIPE，无 PTY，shell 非交互式（无提示符、输出可能缓冲）
            proc = await asyncio.create_subprocess_exec(
                "cmd.exe", "/K",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            async def read_stdout():
                try:
                    while proc and proc.stdout:
                        data = await proc.stdout.read(4096)
                        if not data:
                            break
                        await websocket.send_bytes(data)
                except (WebSocketDisconnect, ConnectionResetError, BrokenPipeError):
                    pass
                except Exception as e:
                    logger.exception("Terminal stdout read error: %s", e)

            async def read_websocket():
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg and msg["bytes"]:
                            proc.stdin.write(msg["bytes"])
                            await proc.stdin.drain()
                        if "text" in msg and msg["text"]:
                            proc.stdin.write(msg["text"].encode("utf-8"))
                            await proc.stdin.drain()
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.exception("Terminal ws read error: %s", e)

            await asyncio.gather(read_stdout(), read_websocket())

        else:
            # Unix：PTY，真实交互式终端（有提示符、命令执行、回显）
            import pty

            master_fd, slave_fd = pty.openpty()
            proc = await asyncio.create_subprocess_exec(
                "bash", "-i", "-l",
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                pass_fds=(slave_fd,),
            )
            os.close(slave_fd)

            try:
                pty.setwinsize(master_fd, 24, 80)
            except Exception:
                pass

            queue, loop, mfd = _run_with_pty(websocket, master_fd)
            master_fd = mfd

            async def read_websocket():
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg and msg["bytes"]:
                            os.write(master_fd, msg["bytes"])
                        if "text" in msg and msg["text"]:
                            os.write(master_fd, msg["text"].encode("utf-8"))
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.exception("Terminal ws read error: %s", e)

            await asyncio.gather(
                _read_pty_and_send(queue, websocket, loop, master_fd),
                read_websocket(),
            )
            master_fd = None

    except WebSocketDisconnect:
        logger.info("Terminal WebSocket disconnected")
    except Exception as e:
        logger.exception("Terminal error: %s", e)
    finally:
        if proc and proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                proc.kill()
        if master_fd is not None:
            try:
                os.close(master_fd)
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
