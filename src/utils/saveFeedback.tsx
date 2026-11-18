'use client'

import { Modal, message } from 'antd'
import type { SaveResult } from '@/services/topology'

interface SaveFeedbackOptions {
  /** 409 冲突时"重新加载"的回调（会丢弃本地未保存修改） */
  onReload?: () => void
}

/**
 * 统一的保存结果反馈：
 * - 成功：message（含 git 提交短 hash）；有 warnings 时弹窗列出
 * - 422 校验失败：弹窗逐条展示 errors，便于定位脏数据
 * - 409 冲突：确认弹窗引导重新加载最新数据
 * 返回是否保存成功。
 */
export function applySaveResult(result: SaveResult, opts: SaveFeedbackOptions = {}): boolean {
  if (result.success) {
    if (result.warnings && result.warnings.length > 0) {
      Modal.warning({
        title: result.version ? `已保存并提交 ${result.version.slice(0, 7)}，但有 ${result.warnings.length} 条警告` : `已保存，但有 ${result.warnings.length} 条警告`,
        width: 600,
        content: (
          <div className="max-h-72 overflow-y-auto mt-2">
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ),
      })
    } else if (result.version) {
      message.success(`已保存并提交 ${result.version.slice(0, 7)}`)
    } else if (result.commitSkipped) {
      message.success(`已保存（未提交 git：${result.commitSkipped}）`)
    } else {
      message.success('保存成功（未检测到 git 仓库，提交审计未启用）')
    }
    return true
  }

  if (result.conflict) {
    Modal.confirm({
      title: '保存冲突',
      content: '数据已被其他页面或他人修改并保存。继续保存会覆盖对方修改；重新加载将丢弃你当前未保存的修改。',
      okText: '重新加载最新数据',
      cancelText: '留在本页',
      onOk: () => opts.onReload?.(),
    })
    return false
  }

  if (result.errors && result.errors.length > 0) {
    Modal.error({
      title: `数据校验未通过（${result.errors.length} 项）`,
      width: 640,
      content: (
        <div className="max-h-80 overflow-y-auto mt-2">
          <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ),
    })
    return false
  }

  message.error('保存失败: ' + (result.error || '未知错误'))
  return false
}
