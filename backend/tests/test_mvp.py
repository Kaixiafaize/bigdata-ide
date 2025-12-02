import pytest
import sys
import os
from pathlib import Path

# 添加backend路径
sys.path.insert(0, str(Path(__file__).parent.parent))

# 导入FastAPI测试工具
from fastapi.testclient import TestClient

# 导入应用
from main import app

# 创建测试客户端
client = TestClient(app)


class TestBasicEndpoints:
    """基础端点测试"""
    
    def test_health_check(self):
        """测试健康检查"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
    
    def test_root_endpoint(self):
        """测试根端点"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "service" in data


class TestSessionManagement:
    """会话管理测试"""
    
    def test_create_python_session(self):
        """测试创建Python会话"""
        response = client.post("/api/sessions?engine=python")
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["engine"] == "python"
        assert "kernel_id" in data
    
    def test_create_spark_session(self):
        """测试创建Spark会话"""
        response = client.post("/api/sessions?engine=spark")
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["engine"] == "spark"
    
    def test_create_invalid_engine_session(self):
        """测试创建无效引擎会话"""
        response = client.post("/api/sessions?engine=invalid")
        assert response.status_code == 400
    
    def test_get_session(self):
        """测试获取会话信息"""
        # 创建会话
        create_response = client.post("/api/sessions?engine=python")
        session_id = create_response.json()["session_id"]
        
        # 获取会话
        get_response = client.get(f"/api/sessions/{session_id}")
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["session_id"] == session_id
        assert data["engine"] == "python"
        assert data["status"] == "active"
    
    def test_get_nonexistent_session(self):
        """测试获取不存在的会话"""
        response = client.get("/api/sessions/nonexistent-id")
        assert response.status_code == 404


class TestCodeExecution:
    """代码执行测试"""
    
    def test_python_execution_simple(self):
        """测试简单Python代码执行"""
        response = client.post("/api/execute", json={
            "engine": "python",
            "code": "print('Hello, BigData IDE!')"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "Hello, BigData IDE!" in data["output"]
        assert "execution_id" in data
    
    def test_python_execution_with_variables(self):
        """测试Python变量执行"""
        response = client.post("/api/execute", json={
            "engine": "python",
            "code": """
x = 5
y = 3
result = x + y
print(f'Result: {result}')
"""
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "Result: 8" in data["output"]
    
    def test_python_execution_error(self):
        """测试Python代码错误处理"""
        response = client.post("/api/execute", json={
            "engine": "python",
            "code": "x = 1 / 0"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "ZeroDivisionError" in data["errors"]
    
    def test_python_execution_with_session(self):
        """测试使用会话执行Python代码"""
        # 创建会话
        create_response = client.post("/api/sessions?engine=python")
        session_id = create_response.json()["session_id"]
        
        # 在会话中执行代码
        response = client.post("/api/execute", json={
            "engine": "python",
            "code": "print('Session test')",
            "session_id": session_id
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "Session test" in data["output"]
    
    def test_execute_empty_code(self):
        """测试空代码执行"""
        response = client.post("/api/execute", json={
            "engine": "python",
            "code": ""
        })
        # 应该返回200，输出为空
        assert response.status_code == 200
        data = response.json()
        # 空代码通常返回ok状态，输出为空
        assert data["status"] == "ok"
    
    def test_execute_with_syntax_error(self):
        """测试语法错误处理"""
        response = client.post("/api/execute", json={
            "engine": "python",
            "code": "if True\n    print('error')"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "SyntaxError" in data["errors"]


class TestSessionLifecycle:
    """会话生命周期测试"""
    
    def test_delete_session(self):
        """测试删除会话"""
        # 创建会话
        create_response = client.post("/api/sessions?engine=python")
        session_id = create_response.json()["session_id"]
        
        # 删除会话
        delete_response = client.delete(f"/api/sessions/{session_id}")
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["status"] == "deleted"
        assert data["session_id"] == session_id
        
        # 验证会话已删除
        get_response = client.get(f"/api/sessions/{session_id}")
        assert get_response.status_code == 404
    
    def test_delete_nonexistent_session(self):
        """测试删除不存在的会话"""
        response = client.delete("/api/sessions/nonexistent-id")
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
