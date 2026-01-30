import React, { useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Register({ onRegister, onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/bigdata-ide/auth/register`, {
        username: username.trim(),
        password,
      });
      const { access_token, username: u } = res.data;
      onRegister(access_token, u);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">注册</CardTitle>
          <p className="text-sm text-muted-foreground">创建账号后可直接登录使用</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="reg-username">用户名</Label>
              <Input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名"
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">密码</Label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm">确认密码</Label>
              <Input
                id="reg-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </Button>
            {onSwitchToLogin && (
              <p className="text-center text-sm text-muted-foreground">
                已有账号？{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={onSwitchToLogin}
                  disabled={loading}
                >
                  去登录
                </button>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
