#!/bin/bash

# BigData IDE 功能测试脚本

echo "🧪 BigData IDE 功能测试"
echo "========================"
echo ""

API_URL="http://localhost:8888"

# 测试 1: 普通 Python
echo "测试 1️⃣  - 普通 Python (无引擎)"
SESSION=$(curl -s -X POST "$API_URL/api/sessions?language=python" | jq -r '.session_id')
echo "  会话ID: $SESSION"
RESULT=$(curl -s -X POST "$API_URL/api/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"language\": \"python\",
    \"engine\": null,
    \"code\": \"print('Hello from Python')\",
    \"session_id\": \"$SESSION\"
  }")
echo "  结果: $(echo $RESULT | jq -r '.output')"
echo ""

# 测试 2: 普通 SQL
echo "测试 2️⃣  - 普通 SQL (无引擎)"
SESSION=$(curl -s -X POST "$API_URL/api/sessions?language=sql" | jq -r '.session_id')
echo "  会话ID: $SESSION"
RESULT=$(curl -s -X POST "$API_URL/api/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"language\": \"sql\",
    \"engine\": null,
    \"code\": \"SELECT 'Hello from SQL' as greeting;\",
    \"session_id\": \"$SESSION\"
  }")
echo "  结果: $(echo $RESULT | jq -r '.output')"
echo ""

# 测试 3: Python + Spark 引擎
echo "测试 3️⃣  - Python + Spark 引擎 (PySpark)"
SESSION=$(curl -s -X POST "$API_URL/api/sessions?language=python&engine=spark" | jq -r '.session_id')
echo "  会话ID: $SESSION"
RESULT=$(curl -s -X POST "$API_URL/api/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"language\": \"python\",
    \"engine\": \"spark\",
    \"code\": \"print('PySpark Test')\",
    \"session_id\": \"$SESSION\"
  }")
echo "  结果: $(echo $RESULT | jq -r '.output')"
echo ""

# 测试 4: Python + Flink 引擎
echo "测试 4️⃣  - Python + Flink 引擎 (PyFlink)"
SESSION=$(curl -s -X POST "$API_URL/api/sessions?language=python&engine=flink" | jq -r '.session_id')
echo "  会话ID: $SESSION"
RESULT=$(curl -s -X POST "$API_URL/api/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"language\": \"python\",
    \"engine\": \"flink\",
    \"code\": \"print('PyFlink Test')\",
    \"session_id\": \"$SESSION\"
  }")
echo "  结果: $(echo $RESULT | jq -r '.output')"
echo ""

# 测试 5: SQL + Spark 引擎
echo "测试 5️⃣  - SQL + Spark 引擎 (Spark SQL)"
SESSION=$(curl -s -X POST "$API_URL/api/sessions?language=sql&engine=spark" | jq -r '.session_id')
echo "  会话ID: $SESSION"
RESULT=$(curl -s -X POST "$API_URL/api/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"language\": \"sql\",
    \"engine\": \"spark\",
    \"code\": \"SELECT 'Spark SQL Test' as result;\",
    \"session_id\": \"$SESSION\"
  }")
echo "  结果: $(echo $RESULT | jq -r '.output')"
echo ""

# 测试 6: SQL + Flink 引擎
echo "测试 6️⃣  - SQL + Flink 引擎 (Flink SQL)"
SESSION=$(curl -s -X POST "$API_URL/api/sessions?language=sql&engine=flink" | jq -r '.session_id')
echo "  会话ID: $SESSION"
RESULT=$(curl -s -X POST "$API_URL/api/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"language\": \"sql\",
    \"engine\": \"flink\",
    \"code\": \"SELECT 'Flink SQL Test' as result;\",
    \"session_id\": \"$SESSION\"
  }")
echo "  结果: $(echo $RESULT | jq -r '.output')"
echo ""

echo "========================"
echo "✅ 所有测试完成！"
