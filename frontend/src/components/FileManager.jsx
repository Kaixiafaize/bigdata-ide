import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { ArrowUp, RefreshCw, FolderPlus, Upload, Trash2, Download, Lock, Eye, FileEdit, Info, Folder, File, Code, FileText, Image, Database as DatabaseIcon, FileJson, FileCode } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';

const API_BASE_URL = '/api';

const FileManager = ({ onFileSelect, onFileOpen }) => {
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionFile, setPermissionFile] = useState(null);
  const [permissions, setPermissions] = useState({ read: true, write: true, delete: true, owner: '' });
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [sortBy, setSortBy] = useState('name'); // 'name', 'size', 'modified', 'type'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [filterType, setFilterType] = useState('all'); // 'all', 'file', 'directory', 'image', 'code', 'text'
  const [showRename, setShowRename] = useState(false);
  const [renameFile, setRenameFile] = useState(null);
  const [newFileName, setNewFileName] = useState('');
  const [showMove, setShowMove] = useState(false);
  const [moveFile, setMoveFile] = useState(null);
  const [moveTargetPath, setMoveTargetPath] = useState('');
  const [showCopy, setShowCopy] = useState(false);
  const [copyFile, setCopyFile] = useState(null);
  const [copyTargetPath, setCopyTargetPath] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [detailsFile, setDetailsFile] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showBatchPermissions, setShowBatchPermissions] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // 加载文件列表
  const loadFiles = async (path = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/files`, {
        params: { path }
      });
      setFiles(response.data.files || []);
      setCurrentPath(response.data.path || '');
      setSelectedFiles(new Set()); // 清空选择
    } catch (err) {
      setError(`加载文件失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // 文件排序
  const sortedFiles = React.useMemo(() => {
    let result = [...files];
    
    // 类型过滤
    if (filterType !== 'all') {
      if (filterType === 'file') {
        result = result.filter(f => f.type === 'file');
      } else if (filterType === 'directory') {
        result = result.filter(f => f.type === 'directory');
      } else {
        result = result.filter(f => {
          if (f.type === 'directory') return false;
          const fileType = getFileType(f.name);
          return fileType === filterType;
        });
      }
    }
    
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(file => 
        file.name.toLowerCase().includes(query) || 
        file.path.toLowerCase().includes(query)
      );
    }
    
    // 排序
    result.sort((a, b) => {
      let aVal, bVal;
      
      if (sortBy === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortBy === 'size') {
        aVal = a.size || 0;
        bVal = b.size || 0;
      } else if (sortBy === 'modified') {
        aVal = a.modified ? new Date(a.modified).getTime() : 0;
        bVal = b.modified ? new Date(b.modified).getTime() : 0;
      } else if (sortBy === 'type') {
        aVal = a.type === 'directory' ? 0 : 1;
        bVal = b.type === 'directory' ? 0 : 1;
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [files, searchQuery, sortBy, sortOrder, filterType]);

  // 进入目录
  const enterDirectory = (path) => {
    loadFiles(path);
  };

  // 返回上级目录
  const goUp = () => {
    if (currentPath) {
      const parentPath = currentPath.split('/').slice(0, -1).join('/');
      loadFiles(parentPath);
    }
  };

  // 上传文件（带进度）
  const handleUpload = async () => {
    if (!uploadFile) return;
    
    setLoading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('path', currentPath);
      
      await axios.post(`${API_BASE_URL}/bigdata-ide/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      
      setShowUpload(false);
      setUploadFile(null);
      setUploadProgress(0);
      loadFiles(currentPath);
    } catch (err) {
      setError(`上传失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 拖拽上传
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setUploadFile(droppedFiles[0]);
      setShowUpload(true);
    }
  };

  // 创建目录
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    setLoading(true);
    try {
      const folderPath = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
      await axios.post(`${API_BASE_URL}/bigdata-ide/files/mkdir`, null, {
        params: { path: folderPath }
      });
      
      setShowNewFolder(false);
      setNewFolderName('');
      loadFiles(currentPath);
    } catch (err) {
      setError(`创建目录失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 删除文件/目录
  const handleDelete = async (file) => {
    if (file.permissions && !file.permissions.delete) {
      setError('没有删除权限');
      return;
    }
    
    if (!confirm(`确定要删除 "${file.path}" 吗？`)) return;
    
    setLoading(true);
    try {
      await axios.delete(`${API_BASE_URL}/bigdata-ide/files`, {
        params: { path: file.path }
      });
      loadFiles(currentPath);
    } catch (err) {
      setError(`删除失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    const filesToDelete = Array.from(selectedFiles).map(path => 
      files.find(f => f.path === path)
    ).filter(Boolean);
    
    if (!confirm(`确定要删除 ${filesToDelete.length} 个文件/目录吗？`)) return;
    
    setLoading(true);
    try {
      await Promise.all(
        filesToDelete.map(file => 
          axios.delete(`${API_BASE_URL}/bigdata-ide/files`, {
            params: { path: file.path }
          })
        )
      );
      setSelectedFiles(new Set());
      loadFiles(currentPath);
    } catch (err) {
      setError(`批量删除失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 重命名文件
  const handleRename = async () => {
    if (!renameFile || !newFileName.trim()) return;
    
    setLoading(true);
    try {
      const newPath = renameFile.path.split('/').slice(0, -1).join('/');
      const targetPath = newPath ? `${newPath}/${newFileName}` : newFileName;
      
      await axios.post(`${API_BASE_URL}/bigdata-ide/files/rename`, null, {
        params: { old_path: renameFile.path, new_path: targetPath }
      });
      
      setShowRename(false);
      setRenameFile(null);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (err) {
      setError(`重命名失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 移动文件
  const handleMove = async () => {
    if (!moveFile || !moveTargetPath.trim()) return;
    
    setLoading(true);
    try {
      const targetPath = moveTargetPath.trim().endsWith('/') 
        ? `${moveTargetPath.trim()}${moveFile.name}`
        : `${moveTargetPath.trim()}/${moveFile.name}`;
      
      await axios.post(`${API_BASE_URL}/bigdata-ide/files/rename`, null, {
        params: { old_path: moveFile.path, new_path: targetPath }
      });
      
      setShowMove(false);
      setMoveFile(null);
      setMoveTargetPath('');
      loadFiles(currentPath);
    } catch (err) {
      setError(`移动失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 复制文件（通过下载后上传实现）
  const handleCopy = async () => {
    if (!copyFile || !copyTargetPath.trim()) return;
    
    setLoading(true);
    try {
      // 下载原文件
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/files/download`, {
        params: { path: copyFile.path },
        responseType: 'blob'
      });
      
      // 上传到新位置
      const targetPath = copyTargetPath.trim().endsWith('/') 
        ? `${copyTargetPath.trim()}${copyFile.name}`
        : `${copyTargetPath.trim()}/${copyFile.name}`;
      
      const formData = new FormData();
      formData.append('file', new Blob([response.data]), copyFile.name);
      formData.append('path', targetPath.split('/').slice(0, -1).join('/'));
      
      await axios.post(`${API_BASE_URL}/bigdata-ide/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setShowCopy(false);
      setCopyFile(null);
      setCopyTargetPath('');
      loadFiles(currentPath);
    } catch (err) {
      setError(`复制失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 下载文件
  const handleDownload = async (path, name) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/files/download`, {
        params: { path },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(`下载失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  // 批量下载
  const handleBatchDownload = async () => {
    if (selectedFiles.size === 0) return;
    
    const filesToDownload = Array.from(selectedFiles)
      .map(path => files.find(f => f.path === path))
      .filter(f => f && f.type === 'file');
    
    for (const file of filesToDownload) {
      try {
        await handleDownload(file.path, file.name);
        await new Promise(resolve => setTimeout(resolve, 100)); // 避免浏览器阻止多个下载
      } catch (err) {
        console.error(`下载 ${file.name} 失败:`, err);
      }
    }
  };

  // 预览文件
  const handlePreview = async (file) => {
    if (file.type === 'directory') return;
    
    if (file.permissions && !file.permissions.read) {
      setError('没有读取权限');
      return;
    }
    
    setSelectedFile(file);
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/files/download`, {
        params: { path: file.path },
        responseType: 'blob'
      });
      
      const fileType = getFileType(file.name);
      if (fileType === 'text' || fileType === 'code') {
        const text = await response.data.text();
        setPreviewContent({ type: 'text', content: text });
      } else if (fileType === 'image') {
        const url = URL.createObjectURL(response.data);
        setPreviewContent({ type: 'image', url });
      } else {
        setPreviewContent({ type: 'binary', message: '此文件类型不支持预览' });
      }
      setShowPreview(true);
    } catch (err) {
      setError(`预览失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 获取文件类型
  const getFileType = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
    const codeExts = ['py', 'js', 'jsx', 'ts', 'tsx', 'java', 'cpp', 'c', 'h', 'sql', 'html', 'css', 'json', 'xml', 'yaml', 'yml'];
    const textExts = ['txt', 'md', 'log', 'csv'];
    
    if (imageExts.includes(ext)) return 'image';
    if (codeExts.includes(ext)) return 'code';
    if (textExts.includes(ext)) return 'text';
    return 'binary';
  };

  // 打开文件到编辑器
  const handleOpenInEditor = async (file) => {
    if (file.type === 'directory') return;
    
    if (file.permissions && !file.permissions.read) {
      setError('没有读取权限');
      return;
    }
    
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/files/download`, {
        params: { path: file.path },
        responseType: 'text'
      });
      
      if (onFileOpen) {
        onFileOpen(file.name, response.data, getFileType(file.name));
      }
    } catch (err) {
      setError(`打开文件失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  // 打开权限管理
  const handleManagePermissions = async (file) => {
    setPermissionFile(file);
    try {
      const response = await axios.get(`${API_BASE_URL}/bigdata-ide/files/permissions`, {
        params: { path: file.path }
      });
      setPermissions(response.data.permissions || { read: true, write: true, delete: true, owner: '' });
      setShowPermissions(true);
    } catch (err) {
      setError(`获取权限失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  // 批量权限设置
  const handleBatchPermissions = async () => {
    if (selectedFiles.size === 0) return;
    
    const filesToSet = Array.from(selectedFiles).map(path => 
      files.find(f => f.path === path)
    ).filter(Boolean);
    
    setPermissionFile({ path: `批量设置 (${filesToSet.length} 项)` });
    setPermissions({ read: true, write: true, delete: true, owner: '' });
    setShowBatchPermissions(true);
  };

  // 保存权限
  const handleSavePermissions = async () => {
    if (!permissionFile) return;
    
    setLoading(true);
    try {
      if (showBatchPermissions) {
        // 批量设置权限
        const filesToSet = Array.from(selectedFiles).map(path => 
          files.find(f => f.path === path)
        ).filter(Boolean);
        
        await Promise.all(
          filesToSet.map(file => 
            axios.post(`${API_BASE_URL}/bigdata-ide/files/permissions`, null, {
              params: {
                path: file.path,
                read: permissions.read,
                write: permissions.write,
                delete: permissions.delete,
                owner: permissions.owner || null
              }
            })
          )
        );
        setSelectedFiles(new Set());
      } else {
        // 单个文件权限
        await axios.post(`${API_BASE_URL}/bigdata-ide/files/permissions`, null, {
          params: {
            path: permissionFile.path,
            read: permissions.read,
            write: permissions.write,
            delete: permissions.delete,
            owner: permissions.owner || null
          }
        });
      }
      
      setShowPermissions(false);
      setShowBatchPermissions(false);
      setPermissionFile(null);
      loadFiles(currentPath);
    } catch (err) {
      setError(`保存权限失败: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 显示文件详情
  const handleShowDetails = async (file) => {
    setDetailsFile(file);
    setShowDetails(true);
  };

  // 切换文件选择
  const toggleFileSelection = (filePath) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedFiles(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedFiles.size === sortedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(sortedFiles.map(f => f.path)));
    }
  };

  // 右键菜单
  const handleContextMenu = (e, file) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file: file
    });
  };

  // 关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div 
      className="flex flex-col h-full bg-card rounded-lg border overflow-hidden relative" 
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 工具栏 */}
      <div className="flex justify-between items-center p-3 bg-background border-b border-border gap-2 flex-wrap">
        <div className="flex gap-2 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={goUp}
                disabled={!currentPath}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>返回上级</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => loadFiles(currentPath)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>刷新</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowNewFolder(true)}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>新建文件夹</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>上传文件</p>
            </TooltipContent>
          </Tooltip>
          {selectedFiles.size > 0 && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleBatchDelete}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>批量删除</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleBatchDownload}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>批量下载</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleBatchPermissions}>
                    <Lock className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>批量权限</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="input-field w-auto text-sm"
              >
                <option value="all">全部</option>
                <option value="file">文件</option>
                <option value="directory">目录</option>
                <option value="image">图片</option>
                <option value="code">代码</option>
                <option value="text">文本</option>
              </select>
            </TooltipTrigger>
            <TooltipContent>
              <p>文件类型过滤</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="input-field w-auto text-sm"
              >
                <option value="name">名称</option>
                <option value="size">大小</option>
                <option value="modified">修改时间</option>
                <option value="type">类型</option>
              </select>
            </TooltipTrigger>
            <TooltipContent>
              <p>排序方式</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="font-bold"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>排序: {sortOrder === 'asc' ? '升序' : '降序'}</p>
            </TooltipContent>
          </Tooltip>
          <input
            type="text"
            placeholder="搜索文件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-48 text-sm"
          />
        </div>
      </div>

      {/* 路径导航 */}
      <div className="flex items-center px-3 py-2 bg-accent border-b border-border text-xs flex-wrap gap-1">
        <span 
          onClick={() => loadFiles('')} 
          className="text-primary cursor-pointer px-1 py-0.5 rounded hover:bg-accent transition-colors"
        >
          根目录
        </span>
        {currentPath && currentPath.split('/').map((part, idx) => {
          const path = currentPath.split('/').slice(0, idx + 1).join('/');
          return (
            <React.Fragment key={idx}>
              <span className="text-muted-foreground mx-1">/</span>
              <span 
                onClick={() => loadFiles(path)} 
                className="text-primary cursor-pointer px-1 py-0.5 rounded hover:bg-accent transition-colors"
              >
                {part}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* 批量操作栏 */}
      {selectedFiles.size > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-accent border-b border-border text-xs text-foreground">
          <span>已选择 {selectedFiles.size} 项</span>
          <Button
            variant="default"
            size="sm"
            onClick={toggleSelectAll}
          >
            取消全选
          </Button>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-3 py-2 bg-red-900 bg-opacity-20 border-l-4 border-red-500 text-red-400 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button 
            onClick={() => setError('')}
            className="text-red-400 hover:text-red-300 text-lg px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            加载中...
          </div>
        )}
        {!loading && sortedFiles.length === 0 && (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            暂无文件
          </div>
        )}
        {!loading && sortedFiles.map((file) => {
          const hasReadPermission = !file.permissions || file.permissions.read !== false;
          const hasWritePermission = !file.permissions || file.permissions.write !== false;
          const hasDeletePermission = !file.permissions || file.permissions.delete !== false;
          const isSelected = selectedFiles.has(file.path);
          
          return (
            <div 
              key={file.path} 
              className={`flex items-center px-3 py-2 rounded mb-1 gap-3 transition-all relative group ${
                isSelected 
                  ? 'bg-primary bg-opacity-20 border border-primary' 
                  : 'hover:bg-accent'
              } ${!hasReadPermission ? 'opacity-60' : ''}`}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <div className="w-5 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleFileSelection(file.path)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="w-6 text-center flex items-center justify-center">
                {file.type === 'directory' ? <Folder className="h-5 w-5 text-blue-500" /> : getFileIcon(file.name)}
              </div>
              <div 
                className="flex-1 cursor-pointer min-w-0" 
                onClick={() => {
                  if (!hasReadPermission) {
                    setError('没有读取权限');
                    return;
                  }
                  if (file.type === 'directory') {
                    enterDirectory(file.path);
                  } else {
                    handlePreview(file);
                  }
                }}
              >
                <div className="text-sm text-foreground font-medium truncate flex items-center gap-2">
                  {file.name}
                  {file.permissions?.owner && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs opacity-70 flex items-center cursor-help">
                          <Info className="h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>所有者: {file.permissions.owner}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {file.type === 'file' && file.size && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatFileSize(file.size)}
                  </div>
                )}
                {file.modified && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(file.modified).toLocaleString('zh-CN')}
                  </div>
                )}
                {file.permissions && (
                  <div className="flex gap-1 mt-1">
                    {hasReadPermission && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="px-1.5 py-0.5 bg-background rounded text-xs text-primary font-bold cursor-help">
                            R
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>可读</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {hasWritePermission && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="px-1.5 py-0.5 bg-background rounded text-xs text-primary font-bold cursor-help">
                            W
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>可写</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {hasDeletePermission && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="px-1.5 py-0.5 bg-background rounded text-xs text-primary font-bold cursor-help">
                            D
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>可删</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.type === 'file' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handlePreview(file); }}
                          disabled={!hasReadPermission}
                          className="h-7 w-7"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>预览</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleOpenInEditor(file); }}
                          disabled={!hasReadPermission}
                          className="h-7 w-7"
                        >
                          <FileEdit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>在编辑器中打开</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleDownload(file.path, file.name); }}
                          disabled={!hasReadPermission}
                          className="h-7 w-7"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>下载</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleShowDetails(file); }}
                      className="h-7 w-7"
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>详细信息</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleManagePermissions(file); }}
                      className="h-7 w-7"
                    >
                      <Lock className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>权限管理</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                      disabled={!hasDeletePermission}
                      className="h-7 w-7 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>删除</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div 
          className="fixed bg-popover border border-border rounded p-1 z-50 min-w-[150px] shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.file.type === 'file' && (
            <>
              <div 
                onClick={() => { handlePreview(contextMenu.file); setContextMenu(null); }}
                className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
              >
                预览
              </div>
              <div 
                onClick={() => { handleOpenInEditor(contextMenu.file); setContextMenu(null); }}
                className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
              >
                在编辑器中打开
              </div>
              <div 
                onClick={() => { handleDownload(contextMenu.file.path, contextMenu.file.name); setContextMenu(null); }}
                className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
              >
                下载
              </div>
              <div className="h-px bg-border my-1"></div>
            </>
          )}
          <div 
            onClick={() => { setRenameFile(contextMenu.file); setNewFileName(contextMenu.file.name); setShowRename(true); setContextMenu(null); }}
            className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
          >
            重命名
          </div>
          <div 
            onClick={() => { setMoveFile(contextMenu.file); setMoveTargetPath(currentPath); setShowMove(true); setContextMenu(null); }}
            className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
          >
            移动
          </div>
          {contextMenu.file.type === 'file' && (
            <div 
              onClick={() => { setCopyFile(contextMenu.file); setCopyTargetPath(currentPath); setShowCopy(true); setContextMenu(null); }}
              className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
            >
              复制
            </div>
          )}
          <div className="h-px bg-border my-1"></div>
          <div 
            onClick={() => { handleShowDetails(contextMenu.file); setContextMenu(null); }}
            className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
          >
            详细信息
          </div>
          <div 
            onClick={() => { handleManagePermissions(contextMenu.file); setContextMenu(null); }}
            className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
          >
            权限管理
          </div>
          <div className="h-px bg-border my-1"></div>
          <div 
            onClick={() => { handleDelete(contextMenu.file); setContextMenu(null); }}
            className="px-4 py-2 text-foreground text-sm cursor-pointer hover:bg-accent rounded transition-colors"
          >
            删除
          </div>
        </div>
      )}

      {/* 上传对话框 */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传文件</DialogTitle>
          </DialogHeader>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => setUploadFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          {uploadFile && (
            <div className="space-y-2">
              <p className="text-sm text-foreground">已选择: {uploadFile.name}</p>
              <p className="text-sm text-muted-foreground">大小: {formatFileSize(uploadFile.size)}</p>
              {uploadProgress > 0 && (
                <div className="relative h-6 bg-background rounded overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 flex items-center justify-center text-white text-xs"
                    style={{ width: `${uploadProgress}%` }}
                  >
                    {uploadProgress}%
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowUpload(false);
                setUploadFile(null);
                setUploadProgress(0);
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleUpload}
              disabled={!uploadFile || loading}
            >
              上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建文件夹对话框 */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
          </DialogHeader>
          <Input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="文件夹名称"
            onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowNewFolder(false);
                setNewFolderName('');
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || loading}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={showRename && !!renameFile} onOpenChange={(open) => {
        if (!open) {
          setShowRename(false);
          setRenameFile(null);
          setNewFileName('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          <Input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="新名称"
            onKeyPress={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowRename(false);
                setRenameFile(null);
                setNewFileName('');
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleRename}
              disabled={!newFileName.trim() || loading}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移动对话框 */}
      <Dialog open={showMove && !!moveFile} onOpenChange={(open) => {
        if (!open) {
          setShowMove(false);
          setMoveFile(null);
          setMoveTargetPath('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移动到</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">文件: {moveFile?.name}</p>
          <Input
            type="text"
            value={moveTargetPath}
            onChange={(e) => setMoveTargetPath(e.target.value)}
            placeholder="目标路径"
            onKeyPress={(e) => e.key === 'Enter' && handleMove()}
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowMove(false);
                setMoveFile(null);
                setMoveTargetPath('');
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleMove}
              disabled={!moveTargetPath.trim() || loading}
            >
              移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 复制对话框 */}
      <Dialog open={showCopy && !!copyFile} onOpenChange={(open) => {
        if (!open) {
          setShowCopy(false);
          setCopyFile(null);
          setCopyTargetPath('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>复制到</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">文件: {copyFile?.name}</p>
          <Input
            type="text"
            value={copyTargetPath}
            onChange={(e) => setCopyTargetPath(e.target.value)}
            placeholder="目标路径"
            onKeyPress={(e) => e.key === 'Enter' && handleCopy()}
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCopy(false);
                setCopyFile(null);
                setCopyTargetPath('');
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleCopy}
              disabled={!copyTargetPath.trim() || loading}
            >
              复制
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文件预览 */}
      <Dialog open={showPreview && !!selectedFile} onOpenChange={(open) => {
        if (!open) {
          setShowPreview(false);
          setPreviewContent(null);
          if (previewContent?.url) {
            URL.revokeObjectURL(previewContent.url);
          }
        }
      }}>
        <DialogContent className="min-w-[600px] max-w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-background rounded p-4 min-h-[300px] max-h-[60vh]">
            {previewContent?.type === 'text' && (
              <pre className="text-sm text-foreground font-mono whitespace-pre-wrap break-words m-0">
                {previewContent.content}
              </pre>
            )}
            {previewContent?.type === 'image' && (
              <img src={previewContent.url} alt={selectedFile?.name} className="max-w-full h-auto rounded" />
            )}
            {previewContent?.type === 'binary' && (
              <div className="text-center py-10 text-muted-foreground">
                {previewContent.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="default"
              onClick={() => handleOpenInEditor(selectedFile)}
            >
              在编辑器中打开
            </Button>
            <Button
              variant="default"
              onClick={() => handleDownload(selectedFile?.path, selectedFile?.name)}
            >
              下载
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文件详细信息 */}
      <Dialog open={showDetails && !!detailsFile} onOpenChange={(open) => {
        if (!open) {
          setShowDetails(false);
          setDetailsFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>文件详细信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-foreground">
              <strong className="text-primary mr-2">名称:</strong> {detailsFile?.name}
            </div>
            <div className="text-sm text-foreground">
              <strong className="text-primary mr-2">路径:</strong> {detailsFile?.path}
            </div>
            <div className="text-sm text-foreground">
              <strong className="text-primary mr-2">类型:</strong> {detailsFile?.type === 'directory' ? '目录' : '文件'}
            </div>
            {detailsFile?.size && (
              <div className="text-sm text-foreground">
                <strong className="text-primary mr-2">大小:</strong> {formatFileSize(detailsFile.size)}
              </div>
            )}
            {detailsFile?.modified && (
              <div className="text-sm text-foreground">
                <strong className="text-primary mr-2">修改时间:</strong> {new Date(detailsFile.modified).toLocaleString('zh-CN')}
              </div>
            )}
            {detailsFile?.permissions && (
              <>
                <div className="text-sm text-foreground">
                  <strong className="text-primary mr-2">权限:</strong>
                  <div className="flex gap-2 mt-1">
                    <span className="px-2 py-1 bg-background rounded text-xs">
                      读取: {detailsFile.permissions.read ? '✓' : '✗'}
                    </span>
                    <span className="px-2 py-1 bg-background rounded text-xs">
                      写入: {detailsFile.permissions.write ? '✓' : '✗'}
                    </span>
                    <span className="px-2 py-1 bg-background rounded text-xs">
                      删除: {detailsFile.permissions.delete ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
                {detailsFile.permissions.owner && (
                  <div className="text-sm text-foreground">
                    <strong className="text-primary mr-2">所有者:</strong> {detailsFile.permissions.owner}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowDetails(false);
                setDetailsFile(null);
              }}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 权限管理对话框 */}
      <Dialog open={(showPermissions || showBatchPermissions) && !!permissionFile} onOpenChange={(open) => {
        if (!open) {
          setShowPermissions(false);
          setShowBatchPermissions(false);
          setPermissionFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showBatchPermissions ? '批量权限管理' : '权限管理'} - {permissionFile?.name || permissionFile?.path}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={permissions.read}
                onChange={(e) => setPermissions({...permissions, read: e.target.checked})}
                className="w-5 h-5 cursor-pointer"
              />
              <span className="text-sm text-foreground cursor-pointer">读取权限</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={permissions.write}
                onChange={(e) => setPermissions({...permissions, write: e.target.checked})}
                className="w-5 h-5 cursor-pointer"
              />
              <span className="text-sm text-foreground cursor-pointer">写入权限</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={permissions.delete}
                onChange={(e) => setPermissions({...permissions, delete: e.target.checked})}
                className="w-5 h-5 cursor-pointer"
              />
              <span className="text-sm text-foreground cursor-pointer">删除权限</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground w-20">所有者:</span>
              <Input
                type="text"
                value={permissions.owner || ''}
                onChange={(e) => setPermissions({...permissions, owner: e.target.value})}
                placeholder="所有者名称（可选）"
                className="flex-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPermissions(false);
                setShowBatchPermissions(false);
                setPermissionFile(null);
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleSavePermissions}
              disabled={loading}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files[0]) {
            setUploadFile(e.target.files[0]);
            setShowUpload(true);
          }
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
};

// 获取文件图标
const getFileIcon = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconMap = {
    'py': <Code className="h-5 w-5 text-blue-500" />,
    'js': <FileCode className="h-5 w-5 text-yellow-500" />,
    'jsx': <FileCode className="h-5 w-5 text-blue-400" />,
    'ts': <FileCode className="h-5 w-5 text-blue-600" />,
    'tsx': <FileCode className="h-5 w-5 text-blue-500" />,
    'java': <FileCode className="h-5 w-5 text-orange-500" />,
    'cpp': <FileCode className="h-5 w-5 text-blue-700" />,
    'c': <FileCode className="h-5 w-5 text-blue-700" />,
    'h': <FileCode className="h-5 w-5 text-blue-700" />,
    'sql': <DatabaseIcon className="h-5 w-5 text-blue-600" />,
    'html': <FileCode className="h-5 w-5 text-orange-500" />,
    'css': <FileCode className="h-5 w-5 text-blue-500" />,
    'json': <FileJson className="h-5 w-5 text-yellow-600" />,
    'xml': <FileText className="h-5 w-5 text-orange-600" />,
    'yaml': <FileText className="h-5 w-5 text-purple-500" />,
    'yml': <FileText className="h-5 w-5 text-purple-500" />,
    'txt': <FileText className="h-5 w-5 text-gray-500" />,
    'md': <FileText className="h-5 w-5 text-gray-600" />,
    'log': <FileText className="h-5 w-5 text-gray-500" />,
    'csv': <FileText className="h-5 w-5 text-green-600" />,
    'jpg': <Image className="h-5 w-5 text-purple-500" />,
    'jpeg': <Image className="h-5 w-5 text-purple-500" />,
    'png': <Image className="h-5 w-5 text-purple-500" />,
    'gif': <Image className="h-5 w-5 text-purple-500" />,
    'pdf': <FileText className="h-5 w-5 text-red-600" />,
    'zip': <File className="h-5 w-5 text-blue-600" />,
    'tar': <File className="h-5 w-5 text-blue-600" />,
    'gz': <File className="h-5 w-5 text-blue-600" />
  };
  return iconMap[ext] || <File className="h-5 w-5 text-gray-500" />;
};

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default FileManager;
